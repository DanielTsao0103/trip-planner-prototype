begin;
-- An older metadata-only client can still edit a root field. That invalidates the
-- last aggregate receipt; otherwise a later retry could incorrectly skip saving.
create function private.invalidate_trip_retry_hash() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.last_write_hash is not distinct from old.last_write_hash and
    row(new.trip_name,new.destinations,new.start_date,new.end_date,new.timezone)
    is distinct from row(old.trip_name,old.destinations,old.start_date,old.end_date,old.timezone)
  then new.last_write_hash:=null; new.last_write_id:=null; end if;
  return new;
end $$;
revoke all on function private.invalidate_trip_retry_hash() from public,anon,authenticated;
create trigger invalidate_trip_retry_hash before update on public.trip
for each row execute function private.invalidate_trip_retry_hash();
commit;
