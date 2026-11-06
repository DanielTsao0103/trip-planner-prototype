begin;

-- Authorize only changes to the signed-in traveler's own financial and survey records.
-- Canonical field validation and settled-expense history remain in the bundle writer.
create function private.check_shared_content_changes(
  p_before jsonb, p_after jsonb, p_person uuid, p_role text, p_days date[]
) returns void language plpgsql set search_path='' as $$
begin
  if p_person is null or p_role is null or p_role not in ('Viewer','Editor','Day Editor') or
     ((p_before->'prefs') - p_person::text) is distinct from ((p_after->'prefs') - p_person::text) or
     ((p_before->'individual') - p_person::text) is distinct from ((p_after->'individual') - p_person::text) or
     (p_before->>'budgetMode' <> 'individual' and p_before->'individual' is distinct from p_after->'individual') or
     (p_role <> 'Editor' and p_before->'dismissed' is distinct from p_after->'dismissed')
  then raise exception 'You do not have permission to make this change.' using errcode='42501'; end if;

  -- Match IDs on both sides so deleting someone else's expense or taking over
  -- its payer is subject to the same rule as editing it.
  if exists (
    select from jsonb_array_elements(p_before->'expenses') a
    full join jsonb_array_elements(p_after->'expenses') b on a->>'id'=b->>'id'
    where a is distinct from b and ((a is not null and a->>'payer' is distinct from p_person::text)
      or (b is not null and b->>'payer' is distinct from p_person::text))
  ) then raise exception 'Only the payer can change this expense.' using errcode='42501'; end if;

  if p_role <> 'Editor' and exists (
    select from jsonb_array_elements(p_before->'todos') a
    full join jsonb_array_elements(p_after->'todos') b on a->>'id'=b->>'id'
    where a is distinct from b and (p_role='Viewer' or
      (a is not null and not coalesce((a->>'date')::date=any(p_days),false)) or
      (b is not null and not coalesce((b->>'date')::date=any(p_days),false)))
  ) then raise exception 'You do not have permission to change this reminder.' using errcode='42501'; end if;
end $$;
revoke all on function private.check_shared_content_changes(jsonb,jsonb,uuid,text,date[]) from public,anon,authenticated;

-- Keep one implementation of the existing normalized write, including validation,
-- revision checks and rollback. Only the two authorization entry points may call it.
do $migration$
declare
  body text := (select prosrc from pg_proc
    where oid='private.save_trip_bundle(uuid,integer,uuid,jsonb)'::regprocedure);
  viewer_guard text := $old$if linked is not null and (m->>'role'<>'Viewer' or m->>'status'<>'accepted') then raise exception 'Shared trips have Viewer access'; end if;$old$;
begin
  if strpos(body, viewer_guard)=0 or strpos(body,'actor uuid:=auth.uid()')=0
     or strpos(body,'content_hash text:=md5(p_data::text)')=0 then
    raise exception 'Unexpected trip writer. Review its access checks before migrating.';
  end if;
  -- An existing linked traveler may become an Editor or Day Editor. The owner
  -- check later in the writer still requires exactly one accepted account owner.
  body := replace(body,viewer_guard,$new$if linked is not null and m->>'status'<>'accepted' then
      raise exception 'Linked travelers must be accepted or removed'; end if;
    if m->>'status'='pending' and m->>'role'<>'Viewer' and exists (
      select from private.trip_signup_request q where q.trip_id=p_trip_id and q.planner_id=mid
    ) then raise exception 'Accept the invitation before changing permissions'; end if;$new$);
  body := replace(body,'actor uuid:=auth.uid()','actor uuid:=p_owner');
  -- Scope shared retry receipts to the authenticated account. Preserve earlier
  -- owner receipts so an owner can still recover an interrupted save.
  body := replace(body,'content_hash text:=md5(p_data::text)',
    $hash$content_hash text:=case when p_owner=auth.uid() then md5(p_data::text)
      else encode(sha256(convert_to(auth.uid()::text || p_data::text,'UTF8')),'hex') end$hash$);
  execute format('create function private.persist_trip_bundle(p_trip_id uuid,p_expected_revision integer,
    p_request_id uuid,p_data jsonb,p_owner uuid) returns jsonb language plpgsql
    security invoker set search_path='''' as %L',body);
end $migration$;
revoke all on function private.persist_trip_bundle(uuid,integer,uuid,jsonb,uuid)
  from public, anon, authenticated;

create or replace function private.save_trip_bundle(
  p_trip_id uuid,p_expected_revision integer,p_request_id uuid,p_data jsonb
) returns jsonb language sql security definer set search_path='' as $$
  select private.persist_trip_bundle(p_trip_id,p_expected_revision,p_request_id,p_data,auth.uid())
$$;

create function private.save_shared_trip_changes(
  p_trip_id uuid,p_expected_revision integer,p_request_id uuid,p_data jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  t public.trip;
  traveler uuid;
  granted_role text;
  granted_days date[];
  before_data jsonb;
  mutable_keys text[] := array['events','todos','expenses','individual','prefs','dismissed'];
begin
  if actor is null then raise exception 'Sign in to save trips' using errcode='42501'; end if;
  if p_request_id is null or jsonb_typeof(p_data) is distinct from 'object'
     or octet_length(p_data::text)>2000000 then raise exception 'Invalid or oversized trip'; end if;

  -- Owner grants, removal, invitation acceptance, and all writes serialize on
  -- this same lock. Membership and day checks therefore use the effective grant.
  perform pg_advisory_xact_lock(hashtextextended(p_trip_id::text,0));
  select * into t from public.trip where "tripID"=p_trip_id for update;
  select m.planner_id,r.role_name,array(select d.editable_date from public.trip_member_day d
      where d.trip_id=p_trip_id and d.participant_id=m.planner_id)
    into traveler,granted_role,granted_days from public.trip_member m
    join public.role r on r."roleID"=m."roleID"
    where m."tripID"=p_trip_id and m."userID"=actor and m.shared_account and m.status='accepted';
  if traveler is null or granted_role not in ('Viewer','Editor','Day Editor') then
    raise exception 'You do not have permission to make this change.' using errcode='42501';
  end if;
  if t.last_write_hash=encode(sha256(convert_to(actor::text || p_data::text,'UTF8')),'hex') then
    return private.trip_bundle(p_trip_id);
  end if;
  if p_expected_revision is distinct from t.revision then
    raise exception 'This trip changed. Reload the saved version before editing.' using errcode='PT409';
  end if;

  before_data := (private.trip_bundle(p_trip_id)->'content') || jsonb_build_object(
    'id',p_trip_id,'title',t.trip_name,'destinations',t.destinations,'start',t.start_date,
    'end',t.end_date,'zone',t.timezone);
  -- The browser can never grant itself roles or rewrite the trip's header,
  -- members, budget settings or future fields. Reject any such change.
  if (before_data - mutable_keys) is distinct from (p_data - mutable_keys) then
    raise exception 'Only the owner can change trip settings or permissions.' using errcode='42501';
  end if;

  -- Check every inserted, deleted and modified event, including the original
  -- date AND the destination date when a Day Editor moves an event.
  if granted_role<>'Editor' and exists (
    select from jsonb_array_elements(before_data->'events') a
    full join jsonb_array_elements(p_data->'events') b on a->>'id'=b->>'id'
    where a is distinct from b and (granted_role='Viewer' or
      (a is not null and not coalesce((a->>'date')::date=any(granted_days),false)) or
      (b is not null and not coalesce((b->>'date')::date=any(granted_days),false)))
  ) then raise exception 'You do not have permission to edit this event.' using errcode='42501'; end if;
  perform private.check_shared_content_changes(before_data,p_data,traveler,granted_role,granted_days);
  if before_data=p_data then return private.trip_bundle(p_trip_id); end if;
  return private.persist_trip_bundle(p_trip_id,p_expected_revision,p_request_id,p_data,t.owner_id);
end $$;

create function public.save_shared_trip_changes(
  p_trip_id uuid,p_expected_revision integer,p_request_id uuid,p_data jsonb
) returns jsonb language sql security invoker set search_path='' as $$
  select private.save_shared_trip_changes(p_trip_id,p_expected_revision,p_request_id,p_data)
$$;
revoke all on function private.save_shared_trip_changes(uuid,integer,uuid,jsonb),
  public.save_shared_trip_changes(uuid,integer,uuid,jsonb) from public,anon;
grant execute on function private.save_shared_trip_changes(uuid,integer,uuid,jsonb),
  public.save_shared_trip_changes(uuid,integer,uuid,jsonb) to authenticated;
commit;
