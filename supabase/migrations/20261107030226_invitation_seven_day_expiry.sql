begin;

-- Each email delivery has a fixed version and deadline. An owner resend starts
-- a new delivery, invalidating earlier links without changing trip membership.
alter table private.trip_signup_request
  add column invitation_id uuid not null default gen_random_uuid(),
  add column expires_at timestamptz not null default now()+interval '7 days',
  add column legacy_otp boolean not null default true;
alter table private.trip_signup_request alter column legacy_otp set default false;
update private.trip_signup_request set expires_at=requested_at+interval '7 days';
create unique index trip_signup_request_invitation_id on private.trip_signup_request(invitation_id);

-- The email's TokenHash stays out of readable account metadata. Keep only its
-- SHA-256 digest here, separate from Auth's shorter account-login token lifetime.
create table private.trip_invitation_proof (
  invitation_id uuid not null references private.trip_signup_request(invitation_id) on delete cascade,
  token_hash bytea not null,
  claim_hash bytea,
  primary key(invitation_id,token_hash)
);
alter table private.trip_invitation_proof enable row level security;
revoke all on private.trip_invitation_proof from public,anon,authenticated;

create function private.capture_trip_invitation_proof() returns trigger
language plpgsql security definer set search_path='' as $$
declare proof text;
begin
  -- Both fields are used by GoTrue for signup and magic-link delivery. Clearing
  -- or re-saving an unchanged field never creates a new invitation proof.
  if nullif(new.confirmation_token,'') is not null and
    (tg_op='INSERT' or new.confirmation_token is distinct from old.confirmation_token)
  then
    proof:=new.confirmation_token;
    insert into private.trip_invitation_proof(invitation_id,token_hash)
      select q.invitation_id,sha256(convert_to(proof,'UTF8')) from private.trip_signup_request q
      join public.trip_member m on m."tripID"=q.trip_id and m.planner_id=q.planner_id
      where q.email=lower(new.email) and q.expires_at>now() and q.allow_setup and q.target_account_id is null
        and m.status='pending' and m."userID" is null and lower(m.invite_email)=q.email
      on conflict do nothing;
  end if;
  if nullif(new.recovery_token,'') is not null and
    (tg_op='INSERT' or new.recovery_token is distinct from old.recovery_token)
  then
    proof:=new.recovery_token;
    insert into private.trip_invitation_proof(invitation_id,token_hash)
      select q.invitation_id,sha256(convert_to(proof,'UTF8')) from private.trip_signup_request q
      join public.trip_member m on m."tripID"=q.trip_id and m.planner_id=q.planner_id
      where q.email=lower(new.email) and q.expires_at>now() and q.allow_setup and q.target_account_id is null
        and m.status='pending' and m."userID" is null and lower(m.invite_email)=q.email
      on conflict do nothing;
  end if;
  return new;
end $$;
create trigger capture_trip_invitation_proof before insert or update of confirmation_token,recovery_token
  on auth.users for each row execute function private.capture_trip_invitation_proof();
revoke all on function private.capture_trip_invitation_proof() from public,anon,authenticated;

-- Only an owner preparing another email can rotate its delivery and renew the
-- deadline. A delivery acknowledgement or guest setup-email refresh cannot.
do $migration$
declare
  body text:=pg_get_functiondef('private.prepare_signup_invite(uuid,text,boolean)'::regprocedure);
  ack text:='set sent_at=now(),requested_at=now()';
  resend text:='update private.trip_signup_request q set requested_at=now() where q.trip_id=p_trip and q.email=address;';
  inherited_proof text:=$old$(select q.proof_account_id from private.trip_signup_request q where q.email=address
        and q.proof_account_id=recipient.id and q.requested_at>now()-interval '7 days' limit 1)$old$;
begin
  if strpos(body,ack)=0 or strpos(body,resend)=0 or strpos(body,inherited_proof)=0 then raise exception 'Unexpected invitation delivery implementation'; end if;
  body:=replace(body,ack,'set sent_at=now()');
  body:=replace(body,inherited_proof,'null');
  body:=replace(body,resend,$new$
    delete from private.trip_invitation_proof where invitation_id=pending.invitation_id;
    update private.trip_signup_request q set requested_at=now(),sent_at=null,
      invitation_id=gen_random_uuid(),expires_at=now()+interval '7 days',
      claim_hash=null,claim_until=null,proof_account_id=null,legacy_otp=false
      where q.trip_id=p_trip and q.email=address;
  $new$);
  execute body;
end $migration$;

-- Keep old OTP callbacks usable while Auth still accepts them. Opening their
-- setup form cannot extend the fixed invitation deadline.
do $migration$
declare body text:=pg_get_functiondef('private.open_trip_invite(uuid,uuid)'::regprocedure);
begin
  if strpos(body,'now()-interval ''1 hour''')=0 or strpos(body,'claim_until=now()+interval ''1 hour''')=0 then
    raise exception 'Unexpected legacy invitation claim lifetime'; end if;
  body:=replace(body,'now()-interval ''1 hour''','now()-interval ''7 days''');
  body:=replace(body,'q.requested_at>now()-interval ''7 days''','q.expires_at>now() and q.legacy_otp');
  body:=replace(body,'claim_until=now()+interval ''1 hour''','claim_until=req.expires_at');
  body:=replace(body,'where email=address and requested_at>now()-interval ''7 days'';',
    'where trip_id=req.trip_id and invitation_id=req.invitation_id and legacy_otp;');
  execute body;
end $migration$;
update private.trip_signup_request set claim_until=expires_at where claim_hash is not null;

create function private.open_trip_token(p_trip uuid,p_token text,p_invitation uuid,p_ticket uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  req private.trip_signup_request;
  person public.trip_member;
  account auth.users;
  digest bytea;
  ticket uuid;
  existing_claim bytea;
  setup boolean;
begin
  if p_invitation is null or p_token is null or length(p_token) not between 32 and 256 then
    raise exception 'This invitation link is invalid. Ask the owner for a new email.' using errcode='42501'; end if;
  digest:=sha256(convert_to(p_token,'UTF8'));
  perform pg_advisory_xact_lock(hashtextextended(p_trip::text,0));
  select q.* into req
    from private.trip_signup_request q join private.trip_invitation_proof p on p.invitation_id=q.invitation_id
    where q.trip_id=p_trip and q.invitation_id=p_invitation and q.expires_at>now() and p.token_hash=digest
    for update of q;
  if req.planner_id is null then
    raise exception 'This invitation has expired. Ask the trip owner for a new email.' using errcode='42501'; end if;
  select claim_hash into existing_claim from private.trip_invitation_proof
    where invitation_id=p_invitation and token_hash=digest for update;
  select * into person from public.trip_member where "tripID"=p_trip and planner_id=req.planner_id
    and lower(invite_email)=req.email and (status='pending' and "userID" is null
      or status='accepted' and shared_account and "userID"=req.target_account_id);
  if person.planner_id is null then raise exception 'This invitation is no longer active.' using errcode='42501'; end if;
  select * into account from auth.users where lower(email)=req.email and deleted_at is null;
  -- Pin presentation to the verified delivery before a guest requests another
  -- setup email. Only UUID hints enter metadata, never the secret mail proof.
  update auth.users set raw_user_meta_data=coalesce(raw_user_meta_data,'{}'::jsonb) ||
    jsonb_build_object('trip_invite_id',p_trip,'trip_invitation_id',p_invitation)
    where id=account.id and (raw_user_meta_data->>'trip_invite_id' is distinct from p_trip::text
      or raw_user_meta_data->>'trip_invitation_id' is distinct from p_invitation::text);
  setup:=req.allow_setup and req.target_account_id is null and
    coalesce(account.raw_app_meta_data->>'trip_planner_needs_setup','false')='true';
  -- The same secret and delivery produce the same ticket, so opening the email
  -- in another tab cannot invalidate a form that is already in progress.
  if p_ticket is not null and existing_claim=sha256(convert_to(p_ticket::text,'UTF8')) then ticket:=p_ticket;
  else ticket:=substring(encode(sha256(convert_to('trip-claim:'||p_invitation::text||':'||p_token,'UTF8')),'hex'),1,32)::uuid; end if;
  update private.trip_invitation_proof set claim_hash=sha256(convert_to(ticket::text,'UTF8'))
    where invitation_id=p_invitation and token_hash=digest;
  return jsonb_build_object('trip',p_trip,'ticket',ticket,'email',req.email,'canSetup',setup,
    'accountId',coalesce(person."userID",req.target_account_id),'setupAccountId',case when setup then account.id end,
    'tokenInvite',true,'invitationId',p_invitation,'expiresAt',req.expires_at);
end $$;
-- The public wrapper deliberately grants only this proof-checked operation to
-- signed-out browsers, without granting anonymous access to the private schema.
create function public.open_trip_token(p_trip uuid,p_token text,p_invitation uuid,p_ticket uuid default null)
returns jsonb language sql security definer set search_path='' as $$
  select private.open_trip_token(p_trip,p_token,p_invitation,p_ticket)
$$;
revoke all on function private.open_trip_token(uuid,text,uuid,uuid),
  public.open_trip_token(uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.open_trip_token(uuid,text,uuid,uuid) to anon,authenticated;

create or replace function private.accept_trip_invite(p_trip uuid,p_ticket uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); req private.trip_signup_request; label text; digest bytea:=sha256(convert_to(p_ticket::text,'UTF8'));
begin
  select left(u.name,90) into strict label from public."user" u join auth.users a on a.id=u."userID"
    where a.id=actor and a.deleted_at is null and not a.is_anonymous;
  perform pg_advisory_xact_lock(hashtextextended(p_trip::text,0));
  perform 1 from public.trip where "tripID"=p_trip for update;
  select * into req from private.trip_signup_request q where q.trip_id=p_trip and q.expires_at>now()
    and (q.claim_hash=digest and q.claim_until>now() or exists(
      select from private.trip_invitation_proof p where p.invitation_id=q.invitation_id and p.claim_hash=digest))
    for update of q;
  if req.planner_id is null then
    raise exception 'This invitation has expired. Ask the trip owner for a new email.' using errcode='42501'; end if;
  if exists(select from public.trip_member m where m."tripID"=p_trip and m.planner_id=req.planner_id
    and m."userID"=actor and m.status='accepted' and m.shared_account) then return; end if;
  if exists(select from public.trip where "tripID"=p_trip and owner_id=actor) then
    raise exception 'Choose a traveler account instead of the trip owner' using errcode='42501'; end if;
  if (req.target_account_id is not null and req.target_account_id<>actor) or exists(
    select from public.trip_member m where m."tripID"=p_trip and m.planner_id=req.planner_id and m."userID" is not null)
  then raise exception 'Sign in to the account this invitation was sent to.' using errcode='42501'; end if;
  update public.trip_member set "userID"=actor,shared_account=true,status='accepted',display_name=label
    where "tripID"=p_trip and planner_id=req.planner_id and status='pending' and "userID" is null and lower(invite_email)=req.email;
  if not found then raise exception 'Invitation expired or no longer active' using errcode='42501'; end if;
  update private.trip_signup_request set target_account_id=actor,allow_setup=false
    where trip_id=p_trip and email=req.email;
  update public.trip set last_write_id=null,last_write_hash=null where "tripID"=p_trip;
end $$;

drop function public.open_trip_notice(uuid);
drop function private.open_trip_notice(uuid);
create function private.open_trip_notice(p_trip uuid,p_invitation uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); account auth.users; req private.trip_signup_request; label text;
begin
  if actor is null then raise exception 'Sign in to open this invitation.' using errcode='42501'; end if;
  if p_invitation is null then raise exception 'Ask the trip owner to resend this invitation with a new link.' using errcode='42501'; end if;
  select * into account from auth.users where id=actor and deleted_at is null
    and email_confirmed_at is not null and not is_anonymous;
  if account.id is null then raise exception 'Sign in to open this invitation.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_trip::text,0));
  perform 1 from public.trip where "tripID"=p_trip for update;
  select q.* into req from private.trip_signup_request q
    join public.trip_member m on m."tripID"=q.trip_id and m.planner_id=q.planner_id
    where q.trip_id=p_trip and q.invitation_id=p_invitation and q.expires_at>now() and lower(m.invite_email)=q.email
      and (m.status='accepted' and m.shared_account and m."userID"=actor and q.target_account_id=actor
        or m.status='pending' and m."userID" is null and q.target_account_id=actor)
    for update of q;
  if req.planner_id is null then raise exception 'This invitation has expired or belongs to another account. Ask the trip owner for a new email.' using errcode='42501'; end if;
  if exists(select from public.trip_member where "tripID"=p_trip and planner_id=req.planner_id
    and "userID"=actor and status='accepted' and shared_account) then return jsonb_build_object('trip',p_trip); end if;
  select left(name,90) into strict label from public."user" where "userID"=actor;
  update public.trip_member set "userID"=actor,shared_account=true,status='accepted',display_name=label
    where "tripID"=p_trip and planner_id=req.planner_id;
  update private.trip_signup_request set target_account_id=actor,allow_setup=false where trip_id=p_trip and email=req.email;
  update public.trip set last_write_id=null,last_write_hash=null where "tripID"=p_trip;
  return jsonb_build_object('trip',p_trip);
end $$;
create function public.open_trip_notice(p_trip uuid,p_invitation uuid default null) returns jsonb
language sql security invoker set search_path='' as $$ select private.open_trip_notice(p_trip,p_invitation) $$;
revoke all on function private.open_trip_notice(uuid,uuid),public.open_trip_notice(uuid,uuid) from public,anon;
grant execute on function private.open_trip_notice(uuid,uuid),public.open_trip_notice(uuid,uuid) to authenticated;

-- Versioned delivery IDs are safe to include in metadata and notice URLs.
-- The secret proof stays exclusively in Auth's email template variables.
do $migration$
declare body text:=pg_get_functiondef('private.set_trip_mail_context()'::regprocedure);
begin
  if strpos(body,'''login_url'',r.login_url')=0 or strpos(body,'?trip_notice=''||q.trip_id::text as login_url')=0 then
    raise exception 'Unexpected invitation template context'; end if;
  body:=replace(body,'''login_url'',r.login_url','''login_url'',r.login_url,''invitation'',r.invitation_id');
  body:=replace(body,'t.trip_name as title,','q.invitation_id,t.trip_name as title,');
  body:=replace(body,'?trip_notice=''||q.trip_id::text as login_url',
    '?trip_notice=''||q.trip_id::text||''&invitation=''||q.invitation_id::text as login_url');
  body:=replace(body,'q.requested_at>now()-interval ''7 days''','q.expires_at>now()');
  body:=replace(body,'order by q.requested_at desc,q.trip_id limit 4',
    'order by coalesce(q.invitation_id::text=new.raw_user_meta_data->>''trip_invitation_id'',false) desc,
      coalesce(q.trip_id::text=new.raw_user_meta_data->>''trip_invite_id'',false) desc,q.requested_at desc,q.trip_id limit 4');
  execute body;
end $migration$;
create or replace function private.refresh_trip_mail_context() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update auth.users set raw_user_meta_data=coalesce(raw_user_meta_data,'{}'::jsonb) ||
    jsonb_build_object('trip_invite_id',new.trip_id,'trip_invitation_id',new.invitation_id)
    where lower(email)=new.email and deleted_at is null;
  return new;
end $$;

commit;
