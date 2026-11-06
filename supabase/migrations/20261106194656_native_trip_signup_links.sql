begin;
-- The address and planner ID are bound by the owner. Only an email-link session
-- for that address can turn a pending guest into an authenticated Viewer.
create table private.trip_signup_request (
  trip_id uuid not null references public.trip("tripID") on delete cascade,
  email text not null,
  planner_id uuid not null,
  requested_at timestamptz not null default now(),
  sent_at timestamptz,
  primary key(trip_id,email)
);
create index trip_signup_request_email on private.trip_signup_request(email);
alter table private.trip_signup_request enable row level security;

create function private.prepare_signup_invite(p_trip uuid,p_email text,p_sent boolean)
returns text language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); address text:=lower(btrim(p_email)); guest public.trip_member;
  pending private.trip_signup_request; viewer uuid; registered boolean;
begin
  if actor is null or p_sent is null or address is null or length(address)>280
    or address !~ '^[^[:space:]@,;]+@[^[:space:]@,;]+\.[^[:space:]@,;]+$' then raise exception 'Enter a valid email address'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_trip::text,0));
  perform 1 from public.trip where "tripID"=p_trip and owner_id=actor and content_version=1 for update;
  if not found then raise exception 'Only the trip owner can share this trip' using errcode='42501'; end if;
  select * into pending from private.trip_signup_request q where q.trip_id=p_trip and q.email=address;
  if pending.planner_id is null then
    select exists(select from auth.users a where lower(a.email)=address and a.deleted_at is null
      and a.email_confirmed_at is not null and (a.last_sign_in_at is not null or nullif(btrim(a.raw_user_meta_data->>'name'),'') is not null))
      into registered;
    if registered then return private.share_trip_recipient(p_trip,address,false); end if;
    if p_sent then raise exception 'The invitation changed. Invite the traveler again.'; end if;
  end if;
  perform private.count_invite_usage('send',1,100);
  if pending.planner_id is not null then
    if p_sent then
      update private.trip_signup_request q set sent_at=now(),requested_at=now() where q.trip_id=p_trip and q.email=address;
      return 'sent';
    end if;
    if pending.sent_at>now()-interval '1 minute' then return 'sent'; end if;
    update private.trip_signup_request q set requested_at=now() where q.trip_id=p_trip and q.email=address;
    return 'needs_email';
  end if;
  select * into guest from public.trip_member where "tripID"=p_trip and lower(invite_email)=address
    and planner_id is not null order by (status<>'removed') desc limit 1;
  if guest."userID" is not null then raise exception 'This traveler already has an account membership'; end if;
  select "roleID" into strict viewer from public.role where role_name='Viewer';
  if guest.planner_id is null then
    if (select count(*) from public.trip_member where "tripID"=p_trip and planner_id is not null)>=100 then raise exception 'This trip has reached its traveler limit'; end if;
    guest.planner_id:=gen_random_uuid();
    insert into public.trip_member("tripID","roleID",status,planner_id,display_name,invite_email)
      values(p_trip,viewer,'pending',guest.planner_id,left(address,90),address);
  else
    update public.trip_member set status='pending',"roleID"=viewer where "tripID"=p_trip and planner_id=guest.planner_id;
    delete from public.trip_member_day where trip_id=p_trip and participant_id=guest.planner_id;
  end if;
  insert into private.trip_signup_request(trip_id,email,planner_id) values(p_trip,address,guest.planner_id);
  update public.trip set last_write_id=null,last_write_hash=null where "tripID"=p_trip;
  return 'needs_email';
end $$;

create function private.claim_signup_trips() returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); account_email text; label text; req private.trip_signup_request;
begin
  if actor is null or not exists(select from jsonb_array_elements(auth.jwt()->'amr') method
    where method->>'method' in ('otp','magiclink','email/signup','invite')) then return; end if;
  select lower(a.email),left(u.name,90) into account_email,label from auth.users a join public."user" u on u."userID"=a.id
    where a.id=actor and a.email_confirmed_at is not null and lower(a.email)=lower(auth.jwt()->>'email') and a.deleted_at is null;
  for req in select * from private.trip_signup_request where email=account_email and requested_at>now()-interval '7 days' order by trip_id loop
    perform pg_advisory_xact_lock(hashtextextended(req.trip_id::text,0));
    perform 1 from public.trip where "tripID"=req.trip_id for update;
    update public.trip_member m set "userID"=actor,shared_account=true,status='accepted',display_name=coalesce(label,left(account_email,90))
      where m."tripID"=req.trip_id and m.planner_id=req.planner_id and m.status='pending' and m."userID" is null
      and lower(m.invite_email)=account_email and exists(select from private.trip_signup_request q where q.trip_id=req.trip_id and q.email=account_email and q.planner_id=m.planner_id);
    if found then
      delete from private.trip_signup_request where trip_id=req.trip_id and email=account_email;
      update public.trip set last_write_id=null,last_write_hash=null where "tripID"=req.trip_id;
    end if;
  end loop;
end $$;

create or replace function public.share_trip_recipient(p_trip uuid,p_email text,p_delivered boolean default false)
returns text language sql security invoker set search_path='' as $$ select private.prepare_signup_invite(p_trip,p_email,p_delivered) $$;
-- The older private implementation is now an internal helper for registered accounts.
revoke all on function private.share_trip_recipient(uuid,text,boolean) from authenticated;
revoke all on function private.prepare_signup_invite(uuid,text,boolean),private.claim_signup_trips() from public,anon,authenticated;
grant execute on function private.prepare_signup_invite(uuid,text,boolean) to authenticated;
do $$
declare def text;
begin
  def:=pg_get_functiondef('private.load_trip_bundles(integer,integer)'::regprocedure);
  execute replace(def,'return coalesce','perform private.claim_signup_trips(); return coalesce');
  def:=pg_get_functiondef('private.trip_bundle(uuid)'::regprocedure);
  execute replace(def,'''accountId'',case','''signupPending'',exists(select from private.trip_signup_request q where q.trip_id=p_trip_id and q.planner_id=m.planner_id),''accountId'',case');
  def:=pg_get_functiondef('private.save_trip_bundle(uuid,integer,uuid,jsonb)'::regprocedure);
  execute replace(def,'update public.trip set trip_name=', $cleanup$
    delete from private.trip_signup_request q where q.trip_id=p_trip_id and not exists(select from public.trip_member m
      where m."tripID"=q.trip_id and m.planner_id=q.planner_id and lower(m.invite_email)=q.email and m.status='pending');
    update public.trip set trip_name=$cleanup$);
  def:=pg_get_functiondef('private.sync_invited_name()'::regprocedure);
  execute replace(def,'new.invited_at is not null and label','(new.invited_at is not null or new.raw_user_meta_data->>''trip_account_setup''=''true'') and label');
  def:=pg_get_functiondef('private.resolve_trip_emails(text[])'::regprocedure);
  execute replace(def,'and a.deleted_at is null','and a.deleted_at is null and (a.last_sign_in_at is not null or nullif(btrim(a.raw_user_meta_data->>''name''),'''') is not null)');
end $$;
commit;
