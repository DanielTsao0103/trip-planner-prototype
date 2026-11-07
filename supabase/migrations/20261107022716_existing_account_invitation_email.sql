begin;

alter table private.trip_signup_request add column allow_setup boolean not null default false,
  add column target_account_id uuid references auth.users(id) on delete cascade,
  add column proof_account_id uuid references auth.users(id) on delete set null;
update private.trip_signup_request q set target_account_id=m."userID"
from public.trip_member m where m."tripID"=q.trip_id and m.planner_id=q.planner_id and m.shared_account;

-- Preserve still-unclaimed setup links made by the previous invitation flow.
-- New requests classify the account before sending its first OTP.
update private.trip_signup_request q set allow_setup=true
where exists (
  select from public.trip_member m where m."tripID"=q.trip_id and m.planner_id=q.planner_id
    and m.status='pending' and m."userID" is null
) and (not exists(select from auth.users u where lower(u.email)=q.email)
  or exists(select from auth.users u where lower(u.email)=q.email
    and u.raw_user_meta_data->>'trip_account_setup'='true'
    and nullif(btrim(u.raw_user_meta_data->>'name'),'') is null
    and not exists(select from auth.identities i where i.user_id=u.id and i.provider<>'email')));
update auth.users u set raw_app_meta_data=coalesce(u.raw_app_meta_data,'{}'::jsonb)
  || '{"trip_planner_needs_setup":true}'::jsonb
where exists(select from private.trip_signup_request q where q.email=lower(u.email) and q.allow_setup);

-- OTP verification itself sets last_sign_in_at, so it cannot identify completed
-- signup. This server-owned marker survives multiple invitations to a reserved
-- OTP account and clears when that account chooses its password or name.
create function private.track_invited_account_setup() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then
    if new.raw_user_meta_data->>'trip_account_setup'='true'
      and nullif(btrim(new.raw_user_meta_data->>'name'),'') is null
      and exists(select from private.trip_signup_request q where q.email=lower(new.email) and q.allow_setup)
    then new.raw_app_meta_data:=coalesce(new.raw_app_meta_data,'{}'::jsonb)
      || '{"trip_planner_needs_setup":true}'::jsonb; end if;
  elsif old.raw_app_meta_data->>'trip_planner_needs_setup'='true' and (
    new.encrypted_password is distinct from old.encrypted_password
    or nullif(btrim(new.raw_user_meta_data->>'name'),'') is not null
  ) then new.raw_app_meta_data:=new.raw_app_meta_data-'trip_planner_needs_setup'; end if;
  return new;
end $$;
create trigger track_invited_account_setup before insert or update of encrypted_password,raw_user_meta_data
on auth.users for each row execute function private.track_invited_account_setup();
revoke all on function private.track_invited_account_setup() from public,anon,authenticated;

create or replace function private.prepare_signup_invite(p_trip uuid,p_email text,p_sent boolean)
returns text language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid(); address text:=lower(btrim(p_email)); guest public.trip_member;
  pending private.trip_signup_request; viewer uuid; recipient auth.users; needs_setup boolean; target_account uuid;
begin
  if actor is null or p_sent is null or address is null or length(address)>280
    or address !~ '^[^[:space:]@,;]+@[^[:space:]@,;]+\.[^[:space:]@,;]+$'
    then raise exception 'Enter a valid email address'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_trip::text,0));
  perform 1 from public.trip where "tripID"=p_trip and owner_id=actor and content_version=1 for update;
  if not found then raise exception 'Only the trip owner can share this trip' using errcode='42501'; end if;
  select * into pending from private.trip_signup_request q where q.trip_id=p_trip and q.email=address;
  if pending.planner_id is not null and not exists(select from public.trip_member m
    where m."tripID"=p_trip and m.planner_id=pending.planner_id and lower(m.invite_email)=address
      and (m.status='pending' and m."userID" is null or m.status='accepted' and m.shared_account))
  then
    delete from private.trip_signup_request q where q.trip_id=p_trip and q.email=address;
    pending:=null;
  end if;
  if pending.planner_id is not null then
    perform private.count_invite_usage('send',1,100);
    if p_sent then
      update private.trip_signup_request q set sent_at=now(),requested_at=now() where q.trip_id=p_trip and q.email=address;
      return 'sent';
    end if;
    if pending.sent_at>now()-interval '1 minute' then return 'sent'; end if;
    update private.trip_signup_request q set requested_at=now() where q.trip_id=p_trip and q.email=address;
    return 'needs_email';
  end if;
  if p_sent then raise exception 'The invitation changed. Invite the traveler again.'; end if;

  select * into recipient from auth.users where lower(email)=address and deleted_at is null;
  needs_setup:=recipient.id is null or coalesce(recipient.raw_app_meta_data->>'trip_planner_needs_setup'='true',false);
  if recipient.id=actor then raise exception 'You already own this trip'; end if;
  select * into guest from public.trip_member where "tripID"=p_trip and lower(invite_email)=address
    and planner_id is not null order by (status<>'removed') desc limit 1;
  if guest.shared_account and guest.status='accepted' then
    perform private.count_invite_usage('send',1,100);
    needs_setup:=false;
    target_account:=guest."userID";
  elsif not needs_setup and recipient.email_confirmed_at is not null then
    -- Existing accounts retain immediate access and any previously assigned role.
    -- The notification request still drives an email for every invited account.
    if private.share_trip_recipient(p_trip,address,false)<>'shared' then
      raise exception 'Verify this account email before accepting a trip invitation'; end if;
    select * into strict guest from public.trip_member
      where "tripID"=p_trip and "userID"=recipient.id and shared_account and status='accepted';
    target_account:=recipient.id;
    if lower(guest.invite_email) is distinct from address then
      update public.trip_member set invite_email=address where "tripID"=p_trip and planner_id=guest.planner_id;
      update public.trip set last_write_id=null,last_write_hash=null where "tripID"=p_trip;
    end if;
  else
    perform private.count_invite_usage('send',1,100);
    target_account:=case when not needs_setup then recipient.id end;
    select * into guest from public.trip_member where "tripID"=p_trip and lower(invite_email)=address
      and planner_id is not null order by (status<>'removed') desc limit 1;
    if guest."userID" is not null then raise exception 'This traveler already has an account membership'; end if;
    select "roleID" into strict viewer from public.role where role_name='Viewer';
    if guest.planner_id is null then
      if (select count(*) from public.trip_member where "tripID"=p_trip and planner_id is not null)>=100
        then raise exception 'This trip has reached its traveler limit'; end if;
      guest.planner_id:=gen_random_uuid();
      insert into public.trip_member("tripID","roleID",status,planner_id,display_name,invite_email)
        values(p_trip,viewer,'pending',guest.planner_id,left(address,90),address);
    else
      update public.trip_member set status='pending',"roleID"=viewer where "tripID"=p_trip and planner_id=guest.planner_id;
      delete from public.trip_member_day where trip_id=p_trip and participant_id=guest.planner_id;
    end if;
    update public.trip set last_write_id=null,last_write_hash=null where "tripID"=p_trip;
  end if;
  insert into private.trip_signup_request(trip_id,email,planner_id,allow_setup,target_account_id,proof_account_id)
    values(p_trip,address,guest.planner_id,needs_setup,target_account,
      (select q.proof_account_id from private.trip_signup_request q where q.email=address
        and q.proof_account_id=recipient.id and q.requested_at>now()-interval '7 days' limit 1));
  return 'needs_email';
end $$;

drop function public.open_trip_invite(uuid);
drop function private.open_trip_invite(uuid);
create function private.open_trip_invite(p_trip uuid,p_ticket uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  address text; can_setup boolean; req private.trip_signup_request; bound_account uuid;
  ticket text:=gen_random_uuid()::text;
begin
  if not exists(select from jsonb_array_elements(auth.jwt()->'amr') a
    where a->>'method' in ('otp','magiclink','invite') and (a->>'timestamp')::bigint > extract(epoch from now()-interval '1 hour'))
  then raise exception 'Open a fresh invitation email' using errcode='42501'; end if;
  select lower(email),coalesce(raw_app_meta_data->>'trip_planner_needs_setup'='true',false)
    into address,can_setup from auth.users
    where id=auth.uid() and deleted_at is null and email_confirmed_at is not null;
  select q.* into strict req from private.trip_signup_request q
    join public.trip_member m on m."tripID"=q.trip_id and m.planner_id=q.planner_id
    where q.email=address and (p_trip is null or q.trip_id=p_trip) and q.requested_at>now()-interval '7 days'
    and lower(m.invite_email)=q.email and (m.status='pending' and m."userID" is null
      or m.status='accepted' and m.shared_account and m."userID"=q.target_account_id)
    for update of q;
  select coalesce("userID",req.target_account_id) into bound_account from public.trip_member
    where "tripID"=req.trip_id and planner_id=req.planner_id;
  -- Record actual OTP proof separately from the prototype's automatically
  -- confirmed signup flag. This never claims any trip or restricts account choice.
  update private.trip_signup_request set proof_account_id=auth.uid()
    where email=address and requested_at>now()-interval '7 days';
  if p_ticket is not null and req.claim_until>now()
    and req.claim_hash=sha256(convert_to(p_ticket::text,'UTF8')) then ticket:=p_ticket::text; end if;
  update private.trip_signup_request set claim_hash=sha256(convert_to(ticket,'UTF8')),claim_until=now()+interval '1 hour'
    where trip_id=req.trip_id and email=req.email;
  return jsonb_build_object('trip',req.trip_id,'ticket',ticket,'email',address,
    'canSetup',req.allow_setup and can_setup and bound_account is null,'accountId',bound_account);
end $$;

create function public.open_trip_invite(p_trip uuid,p_ticket uuid default null) returns jsonb
language sql security invoker set search_path='' as $$
  select private.open_trip_invite(p_trip,p_ticket)
$$;
revoke all on function private.open_trip_invite(uuid,uuid),public.open_trip_invite(uuid,uuid) from public,anon;
grant execute on function private.open_trip_invite(uuid,uuid),public.open_trip_invite(uuid,uuid) to authenticated;

-- A notification for an already-linked account can never transfer its membership.
-- Unclaimed invitations keep their existing choice of which account accepts.
do $migration$
declare body text:=pg_get_functiondef('private.accept_trip_invite(uuid,uuid)'::regprocedure);
  fragment text:='update public.trip_member set "userID"=actor, shared_account=true, status=''accepted'', display_name=label';
begin
  if strpos(body,fragment)=0 then raise exception 'Unexpected invitation acceptance function'; end if;
  execute replace(body,fragment,$guard$
    if (req.target_account_id is not null and req.target_account_id<>actor)
      or exists(select from public.trip_member m where m."tripID"=p_trip and m.planner_id=req.planner_id and m."userID" is not null)
    then raise exception 'Sign in to the account this invitation was sent to.' using errcode='42501'; end if;
    $guard$ || fragment);
end $migration$;

-- Keep notification requests through normal owner/collaborator saves. Their
-- presence does not make an accepted traveler look like a pending signup.
do $migration$
declare body text; old_check text:='and lower(m.invite_email)=q.email and m.status=''pending''';
  read_check text:='q.trip_id=p_trip_id and q.planner_id=m.planner_id)';
begin
  body:=pg_get_functiondef('private.persist_trip_bundle(uuid,integer,uuid,jsonb,uuid)'::regprocedure);
  if strpos(body,old_check)=0 then raise exception 'Unexpected invite cleanup in trip writer'; end if;
  execute replace(body,old_check,$new$and lower(m.invite_email)=q.email and
    (m.status='pending' and m."userID" is null or m.status='accepted' and m.shared_account)$new$);
  body:=pg_get_functiondef('private.trip_bundle(uuid)'::regprocedure);
  if strpos(body,read_check)=0 then raise exception 'Unexpected pending signup field'; end if;
  execute replace(body,read_check,$new$q.trip_id=p_trip_id and q.planner_id=m.planner_id
    and m.status='pending' and m."userID" is null)$new$);
end $migration$;

-- Existing-account email links contain only the trip ID. Normal authentication
-- proves account ownership before this function reveals or accepts the trip.
create function private.open_trip_notice(p_trip uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid(); account auth.users; req private.trip_signup_request; label text;
begin
  if actor is null then raise exception 'Sign in to open this invitation.' using errcode='42501'; end if;
  select * into account from auth.users where id=actor and deleted_at is null
    and email_confirmed_at is not null and not is_anonymous;
  if account.id is null then raise exception 'Sign in to open this invitation.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_trip::text,0));
  perform 1 from public.trip where "tripID"=p_trip for update;
  if private.can_view_shared_trip(p_trip) or exists(
    select from public.trip where "tripID"=p_trip and owner_id=actor
  ) then return jsonb_build_object('trip',p_trip); end if;
  -- Also accepts a previously unconfirmed account after normal email verification,
  -- or a newly completed account whose original setup link now uses login.
  select q.* into req from private.trip_signup_request q
    join public.trip_member m on m."tripID"=q.trip_id and m.planner_id=q.planner_id
    where q.trip_id=p_trip and q.requested_at>now()-interval '7 days'
      and m.status='pending' and m."userID" is null and lower(m.invite_email)=q.email
      and (q.target_account_id=actor or (q.target_account_id is null and q.proof_account_id=actor and q.email=lower(account.email)
        and coalesce(account.raw_app_meta_data->>'trip_planner_needs_setup','false')<>'true'))
    for update of q;
  if req.planner_id is null then raise exception 'This account does not have access to the invited trip.' using errcode='42501'; end if;
  select left(name,90) into strict label from public."user" where "userID"=actor;
  update public.trip_member set "userID"=actor,shared_account=true,status='accepted',display_name=label
    where "tripID"=p_trip and planner_id=req.planner_id;
  delete from private.trip_signup_request where trip_id=p_trip and email=req.email;
  update public.trip set last_write_id=null,last_write_hash=null where "tripID"=p_trip;
  return jsonb_build_object('trip',p_trip);
end $$;
create function public.open_trip_notice(p_trip uuid) returns jsonb
language sql security invoker set search_path='' as $$
  select private.open_trip_notice(p_trip)
$$;
revoke all on function private.open_trip_notice(uuid),public.open_trip_notice(uuid) from public,anon;
grant execute on function private.open_trip_notice(uuid),public.open_trip_notice(uuid) to authenticated;

-- Refreshing email presentation metadata must not invalidate unrelated trip
-- revisions. A real name change still updates each affected trip atomically.
create or replace function private.sync_invited_name() returns trigger
language plpgsql security definer set search_path='' as $$
declare label text:=left(btrim(new.raw_user_meta_data->>'name'),90);
begin
  if (new.invited_at is not null or new.raw_user_meta_data->>'trip_account_setup'='true') and label<>'' then
    update public."user" set name=label where "userID"=new.id and name is distinct from label;
    with changed as (
      update public.trip_member set display_name=label where "userID"=new.id and shared_account
        and display_name is distinct from label returning "tripID"
    )
    update public.trip set last_write_hash=null,last_write_id=null
      where "tripID" in (select "tripID" from changed);
  end if;
  return new;
end $$;

-- Populate the same invitation email copy for registered and new accounts.
-- Auth metadata supplies presentation only; these values never authorize access.
create or replace function private.set_trip_mail_context() returns trigger
language plpgsql security definer set search_path='' as $$
declare contexts jsonb;
begin
  new.raw_user_meta_data:=coalesce(new.raw_user_meta_data,'{}'::jsonb)-'trip_mail';
  select jsonb_object_agg(r.id,jsonb_build_object('host',r.host,'title',r.title,'place',r.place,'setup',r.setup,'login_url',r.login_url))
    into contexts from (
      select t."tripID" as id,coalesce(nullif(btrim(u.name),''),'Your travel partner') as host,
        t.trip_name as title,array_to_string(t.destinations,' · ') as place,
        q.allow_setup and q.target_account_id is null
          and coalesce(new.raw_app_meta_data->>'trip_planner_needs_setup','false')='true' as setup,
        'https://danieltsao0103.github.io/trip-planner-prototype/?trip_notice='||q.trip_id::text as login_url
      from private.trip_signup_request q join public.trip t on t."tripID"=q.trip_id
      join public."user" u on u."userID"=t.owner_id
      where q.email=lower(new.email) and q.requested_at>now()-interval '7 days'
      order by q.requested_at desc,q.trip_id limit 4
    ) r;
  if contexts is not null then
    new.raw_user_meta_data:=new.raw_user_meta_data||jsonb_build_object('trip_mail',contexts);
  end if;
  return new;
end $$;
create or replace function private.refresh_trip_mail_context() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update auth.users set raw_user_meta_data=coalesce(raw_user_meta_data,'{}'::jsonb)
    where lower(email)=new.email and deleted_at is null;
  return new;
end $$;

commit;
