begin;
-- A saved guest row only becomes an account membership through the owner invitation RPC.
alter table public.trip_member add column shared_account boolean not null default false;
create table private.invite_usage (
  actor uuid references auth.users(id) on delete cascade,
  action text, bucket timestamptz not null, total integer not null,
  primary key (actor, action)
);
alter table private.invite_usage enable row level security;

create function private.count_invite_usage(action text, amount integer, ceiling integer)
returns void language plpgsql set search_path='' as $$
declare hour_start timestamptz := date_trunc('hour', now()); used integer;
begin
  if auth.uid() is null then raise exception 'Sign in to invite travelers'; end if;
  insert into private.invite_usage as u values(auth.uid(),action,hour_start,amount)
  on conflict on constraint invite_usage_pkey do update set bucket=hour_start,
    total=case when u.bucket=hour_start then u.total+amount else amount end
  returning total into used;
  if used>ceiling then raise exception 'Invitation limit reached. Try again next hour.'; end if;
end $$;

create function private.resolve_trip_emails(p_emails text[]) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if cardinality(p_emails) not between 1 and 20 or exists (
    select 1 from unnest(p_emails) e where e is null or length(e)>280
    or e !~ '^[^[:space:]@,;]+@[^[:space:]@,;]+\.[^[:space:]@,;]+$'
  ) then raise exception 'Enter up to 20 valid email addresses'; end if;
  perform private.count_invite_usage('lookup',cardinality(p_emails),200);
  return coalesce((select jsonb_object_agg(lower(a.email),u.name)
    from auth.users a join public."user" u on u."userID"=a.id
    where lower(a.email)=any(p_emails) and a.email_confirmed_at is not null and a.deleted_at is null),'{}');
end $$;

-- Called in the owner's session. Never trust an account ID, name or role from the browser.
create function private.share_trip_recipient(p_trip uuid,p_email text,p_delivered boolean)
returns text language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); recipient auth.users; person public.trip_member; label text; viewer uuid;
begin
  if actor is null or length(p_email)>280 or p_delivered is null or p_email is null or p_email !~ '^[^[:space:]@,;]+@[^[:space:]@,;]+\.[^[:space:]@,;]+$'
    then raise exception 'Enter a valid email address'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_trip::text,0));
  perform 1 from public.trip where "tripID"=p_trip and owner_id=actor and content_version=1 for update;
  if not found then raise exception 'Only the owner of a saved trip can invite travelers' using errcode='42501'; end if;
  perform private.count_invite_usage('send',1,100);
  select * into recipient from auth.users where lower(email)=lower(p_email) and deleted_at is null;
  if recipient.id=actor then raise exception 'You already own this trip'; end if;
  if not p_delivered and exists(select from public.trip_member where "tripID"=p_trip and shared_account
      and "userID"=recipient.id and status='accepted') then return 'shared'; end if;
  if recipient.email_confirmed_at is null and not (p_delivered and recipient.invited_at is not null) then
    return 'needs_email';
  end if;
  select * into person from public.trip_member where "tripID"=p_trip and planner_id is not null
    and ("userID"=recipient.id or lower(invite_email)=lower(p_email))
    order by ("userID" is not distinct from recipient.id) desc,(status<>'removed') desc limit 1;
  if person.shared_account and person."userID"=recipient.id and person.status='accepted' then return 'shared'; end if;
  if person."userID" is not null and person."userID"<>recipient.id then raise exception 'This address belongs to another traveler record'; end if;
  if person.planner_id is null and (select count(*) from public.trip_member where "tripID"=p_trip and planner_id is not null)>=100
    then raise exception 'This trip has reached its traveler limit'; end if;
  select left(name,90) into label from public."user" where "userID"=recipient.id;
  select "roleID" into strict viewer from public.role where role_name='Viewer';
  label:=coalesce(nullif(label,'Traveler'),left(p_email,90));
  if person.planner_id is null then
    insert into public.trip_member("tripID","userID","roleID",status,planner_id,display_name,invite_email,shared_account)
      values(p_trip,recipient.id,viewer,'accepted',recipient.id,label,lower(p_email),true);
  else
    update public.trip_member set "userID"=recipient.id,"roleID"=viewer,status='accepted',
      display_name=label,invite_email=lower(p_email),shared_account=true where "tripID"=p_trip and planner_id=person.planner_id;
    delete from public.trip_member_day where trip_id=p_trip and participant_id=person.planner_id;
  end if;
  update public.trip set last_write_hash=null,last_write_id=null where "tripID"=p_trip;
  return 'shared';
end $$;

create function private.can_view_shared_trip(id uuid) returns boolean
language sql stable set search_path='' as $$
  select exists(select from public.trip_member where "tripID"=id and shared_account
    and "userID"=auth.uid() and status='accepted');
$$;

-- Keep the current normalized bundle and all its field/financial validation. Restore
-- only links that previously existed in the database when the owner replaces a bundle.
do $$
declare def text; guard text := 'if exists(select 1 from public.trip_member where "tripID"=p_trip_id and "userID" is not null and "userID"<>actor) then raise exception ''This trip has linked collaborators and requires membership-aware editing''; end if;';
begin
  def:=pg_get_functiondef('private.save_trip_bundle(uuid,integer,uuid,jsonb)'::regprocedure);
  if strpos(def,guard)=0 or strpos(def,'case when mid=actor then actor else null end')=0 then raise exception 'Review current trip save function'; end if;
  def:=replace(def,'declare actor uuid','declare links jsonb; linked uuid; actor uuid');
  def:=replace(def,guard,$replacement$
    select jsonb_object_agg(planner_id::text,"userID") into links from public.trip_member
      where "tripID"=p_trip_id and shared_account and status='accepted';
    if exists(select from public.trip_member where "tripID"=p_trip_id and "userID"<>actor and not shared_account)
      then raise exception 'Unrecognized linked trip membership'; end if;
  $replacement$);
  def:=replace(def,'mid:=(m->>''id'')::uuid;', $replacement$
    mid:=(m->>'id')::uuid;
    linked:=case when m->>'status'<>'removed' then (links->>mid::text)::uuid end;
    if linked is not null and (m->>'role'<>'Viewer' or m->>'status'<>'accepted') then raise exception 'Shared trips have Viewer access'; end if;
  $replacement$);
  def:=replace(def,'invite_email)'||chr(10),'invite_email,shared_account)'||chr(10));
  def:=replace(def,'case when mid=actor then actor else null end','case when mid=actor then actor else linked end');
  def:=replace(def,'lower(btrim(m->>''email'')))','lower(btrim(m->>''email'')),linked is not null)');
  execute def;
  def:=pg_get_functiondef('private.trip_bundle(uuid)'::regprocedure);
  if strpos(def,'and owner_id=auth.uid();')=0 then raise exception 'Review current trip read function'; end if;
  def:=replace(def,'and owner_id=auth.uid();','and (owner_id=auth.uid() or private.can_view_shared_trip(p_trip_id));');
  def:=replace(def,'''id'',m.planner_id','''accountId'',case when m.shared_account then m."userID" end,''id'',m.planner_id');
  execute def;
end $$;

create or replace function private.load_trip_bundles(p_offset integer default 0,p_limit integer default 500) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Sign in to load trips' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(private.trip_bundle(t."tripID") order by t."tripID") from
    (select "tripID" from public.trip where owner_id=auth.uid() or "tripID" in
      (select "tripID" from public.trip_member where "userID"=auth.uid() and shared_account and status='accepted')
      order by "tripID" limit least(greatest(p_limit,1),500) offset greatest(p_offset,0)) t),'[]');
end $$;

-- Invited users choose their name after following the email link.
create function private.sync_invited_name() returns trigger language plpgsql security definer set search_path='' as $$
declare label text:=left(btrim(new.raw_user_meta_data->>'name'),90);
begin
  if new.invited_at is not null and label<>'' then
    update public."user" set name=label where "userID"=new.id;
    update public.trip_member set display_name=label where "userID"=new.id and shared_account;
    update public.trip set last_write_hash=null,last_write_id=null where "tripID" in
      (select "tripID" from public.trip_member where "userID"=new.id and shared_account);
  end if;
  return new;
end $$;
create trigger sync_invited_name after update of raw_user_meta_data on auth.users for each row
when (old.raw_user_meta_data is distinct from new.raw_user_meta_data) execute function private.sync_invited_name();

create function public.read_invited_trip(p_trip uuid) returns jsonb language sql security invoker set search_path=''
as $$ select private.trip_bundle(p_trip) $$;
revoke all on function public.read_invited_trip(uuid) from public,anon;
grant execute on function public.read_invited_trip(uuid),private.trip_bundle(uuid) to authenticated;
create function public.resolve_trip_emails(p_emails text[]) returns jsonb language sql security invoker set search_path=''
as $$ select private.resolve_trip_emails(p_emails) $$;
create function public.share_trip_recipient(p_trip uuid,p_email text,p_delivered boolean default false) returns text
language sql security invoker set search_path='' as $$ select private.share_trip_recipient(p_trip,lower(btrim(p_email)),p_delivered) $$;
revoke all on function private.count_invite_usage(text,integer,integer),private.can_view_shared_trip(uuid),private.sync_invited_name() from public,anon,authenticated;
revoke all on function private.resolve_trip_emails(text[]),private.share_trip_recipient(uuid,text,boolean),public.resolve_trip_emails(text[]),public.share_trip_recipient(uuid,text,boolean) from public,anon;
grant execute on function private.resolve_trip_emails(text[]),private.share_trip_recipient(uuid,text,boolean),public.resolve_trip_emails(text[]),public.share_trip_recipient(uuid,text,boolean) to authenticated;
commit;
