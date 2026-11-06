begin;
-- A verified email link proves possession of an invitation, not which account should join.
alter table private.trip_signup_request add column claim_hash bytea, add column claim_until timestamptz;

create or replace function private.open_trip_invite(p_trip uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare address text; can_setup boolean; req private.trip_signup_request; ticket text:=gen_random_uuid()::text;
begin
  if not exists(select from jsonb_array_elements(auth.jwt()->'amr') a
    where a->>'method' in ('otp','magiclink','invite') and (a->>'timestamp')::bigint > extract(epoch from now()-interval '1 hour')) then
    raise exception 'Open a fresh invitation email' using errcode='42501'; end if;
  select lower(email), -- GoTrue can assign an unusable random password when it creates an OTP identity.
    -- Metadata only chooses which form operation to offer; verified OTP is the authority.
    nullif(btrim(raw_user_meta_data->>'name'),'') is null and not exists(
    select from auth.identities i where i.user_id=u.id and i.provider<>'email')
    into address,can_setup from auth.users u where id=auth.uid() and deleted_at is null and email_confirmed_at is not null;
  -- Older email redirects may have lost their query string. Never guess between trips.
  select q.* into strict req from private.trip_signup_request q
    join public.trip_member m on m."tripID"=q.trip_id and m.planner_id=q.planner_id
    where q.email=address and (p_trip is null or q.trip_id=p_trip) and q.requested_at>now()-interval '7 days'
    and m.status='pending' and m."userID" is null and lower(m.invite_email)=q.email for update of q;
  update private.trip_signup_request set claim_hash=sha256(convert_to(ticket,'UTF8')), claim_until=now()+interval '1 hour'
    where trip_id=req.trip_id and email=req.email;
  return jsonb_build_object('trip',req.trip_id,'ticket',ticket,'email',address,'canSetup',can_setup);
end $$;

create function private.accept_trip_invite(p_trip uuid,p_ticket uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); req private.trip_signup_request; label text;
begin
  select left(u.name,90) into strict label from public."user" u join auth.users a on a.id=u."userID"
    where a.id=actor and a.deleted_at is null and not a.is_anonymous;
  perform pg_advisory_xact_lock(hashtextextended(p_trip::text,0));
  perform 1 from public.trip where "tripID"=p_trip for update;
  -- Also handles an acknowledgement lost after a successful claim.
  if private.can_view_shared_trip(p_trip) then return; end if;
  if exists(select from public.trip where "tripID"=p_trip and owner_id=actor) then
    raise exception 'Choose a traveler account instead of the trip owner' using errcode='42501'; end if;
  select * into req from private.trip_signup_request where trip_id=p_trip
    and claim_hash=sha256(convert_to(p_ticket::text,'UTF8')) and claim_until>now()
    and requested_at>now()-interval '7 days' for update;
  update public.trip_member set "userID"=actor, shared_account=true, status='accepted', display_name=label
    where "tripID"=p_trip and planner_id=req.planner_id and status='pending' and "userID" is null and lower(invite_email)=req.email;
  if not found then raise exception 'Invitation expired or no longer active' using errcode='42501'; end if;
  delete from private.trip_signup_request where trip_id=p_trip and email=req.email;
  update public.trip set last_write_id=null,last_write_hash=null where "tripID"=p_trip;
end $$;

-- Listing trips must never silently claim all invitations for an address.
do $$
declare def text:=pg_get_functiondef('private.load_trip_bundles(integer,integer)'::regprocedure);
begin
  if strpos(def,'perform private.claim_signup_trips();')=0 then raise exception 'Review current trip loader'; end if;
  execute replace(def,'perform private.claim_signup_trips();','');
end $$;
drop function private.claim_signup_trips();
create function public.open_trip_invite(p_trip uuid) returns jsonb language sql security invoker set search_path=''
as $$ select private.open_trip_invite(p_trip) $$;
create function public.accept_trip_invite(p_trip uuid,p_ticket uuid) returns void language sql security invoker set search_path=''
as $$ select private.accept_trip_invite(p_trip,p_ticket) $$;
revoke all on function private.open_trip_invite(uuid),public.open_trip_invite(uuid),private.accept_trip_invite(uuid,uuid),public.accept_trip_invite(uuid,uuid) from public,anon;
grant execute on function private.open_trip_invite(uuid),public.open_trip_invite(uuid),private.accept_trip_invite(uuid,uuid),public.accept_trip_invite(uuid,uuid) to authenticated;
commit;
