begin;
-- 40001 is reserved for transient transaction failures. PostgREST retries it;
-- a stale editor revision is a permanent HTTP conflict until the user reloads.
do $$
declare definition text;
begin
  select pg_get_functiondef('private.save_trip_bundle(uuid,integer,uuid,jsonb)'::regprocedure) into definition;
  execute replace(definition, 'errcode=''40001''', 'errcode=''PT409''');
end $$;

-- Metadata-only clients must not shorten dates around existing planning records.
create function private.check_trip_child_dates() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.owner_id is not null and (
    exists(select 1 from public.event where "tripID"=new."tripID" and event_date not between new.start_date and new.end_date)
    or exists(select 1 from public.trip_todo where trip_id=new."tripID" and reminder_date not between new.start_date and new.end_date)
    or exists(select 1 from public.trip_member_day where trip_id=new."tripID" and editable_date not between new.start_date and new.end_date)
  ) then raise exception 'Trip dates must include existing events, reminders, and assigned days'; end if;
  return new;
end $$;
revoke all on function private.check_trip_child_dates() from public,anon,authenticated;
create trigger check_trip_child_dates before update of start_date,end_date on public.trip
for each row execute function private.check_trip_child_dates();

-- Keep the previous metadata API compatible, without exposing aggregate internals
-- (version/hash/budgets) to unvalidated direct updates.
revoke insert,update on public.trip from authenticated;
grant insert("tripID",created_by,owner_id,trip_name,destination,destinations,start_date,end_date,timezone) on public.trip to authenticated;
grant update(trip_name,destination,destinations,start_date,end_date,timezone) on public.trip to authenticated;
commit;
