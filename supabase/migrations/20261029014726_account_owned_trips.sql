-- Add account-owned trip details to the existing team schema. Legacy rows are untouched.
begin;
alter table public.trip add column destinations text[], add column revision integer not null default 1;
create index trip_created_by_id_idx on public.trip (created_by, "tripID");
alter table public.trip enable row level security;

-- Validate every new save server-side, even if a caller bypasses the form.
-- This trigger uses caller privileges; it never bypasses RLS.
create function private.validate_account_trip()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.created_by is distinct from old.created_by or new."tripID" is distinct from old."tripID" then
      raise exception 'Trip ownership and ID cannot be changed' using errcode = '23514';
    end if;
    new.revision := old.revision + 1;
  else
    new.revision := 1;
  end if;
  if new.created_by is null or new.trip_name is null or char_length(btrim(new.trip_name)) not between 1 and 90
    or new.start_date is null or new.end_date is null or not isfinite(new.start_date) or not isfinite(new.end_date)
    or new.start_date < date '0001-01-01' or new.end_date > date '9999-12-31'
    or new.end_date - new.start_date not between 0 and 364
    or new.destinations is null or cardinality(new.destinations) not between 1 and 20
    or array_ndims(new.destinations) <> 1 or array_lower(new.destinations, 1) <> 1
    or exists (select 1 from unnest(new.destinations) as d where d is null or char_length(btrim(d)) not between 1 and 200)
    or new.timezone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone)
  then raise exception 'Invalid trip details' using errcode = '23514'; end if;
  new.trip_name := btrim(new.trip_name);
  new.destinations := array(select btrim(d) from unnest(new.destinations) as d);
  new.destination := new.destinations[1];
  return new;
end $$;
revoke all on function private.validate_account_trip() from public, anon, authenticated;
create trigger validate_account_trip before insert or update on public.trip
for each row execute function private.validate_account_trip();

-- Account ownership comes from the signed-in JWT, never a name or email match.
revoke all on public.trip from anon, authenticated;
grant select, delete on public.trip to authenticated;
grant insert ("tripID", created_by, trip_name, destination, destinations, start_date, end_date, timezone) on public.trip to authenticated;
grant update (trip_name, destination, destinations, start_date, end_date, timezone) on public.trip to authenticated;
create policy "Read own trips" on public.trip for select to authenticated
using (created_by = (select auth.uid()));
create policy "Create own trips" on public.trip for insert to authenticated
with check (created_by = (select auth.uid()));
create policy "Update own trips" on public.trip for update to authenticated
using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));
create policy "Delete own trips" on public.trip for delete to authenticated
using (created_by = (select auth.uid()));
commit;
