-- Match the agreed form limits; preserve all existing trip data and access rules.
begin;
create or replace function private.validate_account_trip()
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
  if new.created_by is null or new.trip_name is null or char_length(btrim(new.trip_name)) not between 1 and 100
    or new.start_date is null or new.end_date is null or not isfinite(new.start_date) or not isfinite(new.end_date)
    or new.start_date < date '0001-01-01' or new.end_date > date '9999-12-31'
    or new.end_date - new.start_date not between 0 and 364
    or new.destinations is null or cardinality(new.destinations) not between 1 and 20
    or array_ndims(new.destinations) <> 1 or array_lower(new.destinations, 1) <> 1
    or exists (select 1 from unnest(new.destinations) as d where d is null or char_length(btrim(d)) not between 1 and 220)
    or new.timezone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone)
  then raise exception 'Invalid trip details' using errcode = '23514'; end if;
  new.trip_name := btrim(new.trip_name);
  new.destinations := array(select btrim(d) from unnest(new.destinations) as d);
  new.destination := new.destinations[1];
  return new;
end $$;
revoke all on function private.validate_account_trip() from public, anon, authenticated;
commit;
