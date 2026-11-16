begin;

create table private.trip_departure_budget (
  trip_id uuid primary key references public.trip("tripID") on delete cascade,
  budget_cents bigint check (budget_cents > 0),
  departure_at timestamptz not null
);

alter table private.trip_departure_budget enable row level security;
revoke all on table private.trip_departure_budget from public, anon, authenticated;

create function private.capture_trip_departure_budget()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  observed_at timestamptz := clock_timestamp();
begin
  if new.owner_id is null then
    return new;
  end if;

  -- Keep the baseline when an itinerary is rescheduled after its original departure.
  if tg_op = 'UPDATE' then
    if old.timezone is not null and old.start_date <= (observed_at at time zone old.timezone)::date then
      insert into private.trip_departure_budget (trip_id, departure_at)
        values (new."tripID", old.start_date::timestamp at time zone old.timezone)
        on conflict (trip_id) do nothing;
      return new;
    end if;
  end if;

  if new.start_date is null or new.timezone is null
    or new.start_date <= (observed_at at time zone new.timezone)::date then
    -- Moving departure to today or earlier freezes any previously saved budget.
    if new.start_date is not null and new.timezone is not null then
      update private.trip_departure_budget
      set departure_at = least(departure_at, new.start_date::timestamp at time zone new.timezone)
      where trip_id = new."tripID";
    end if;
    return new;
  end if;

  insert into private.trip_departure_budget as baseline (trip_id, budget_cents, departure_at)
  values (
    new."tripID",
    case when new.budget_mode = 'group' and new.budget_cents > 0 then new.budget_cents end,
    new.start_date::timestamp at time zone new.timezone
  )
  on conflict (trip_id) do update
    set budget_cents = excluded.budget_cents, departure_at = excluded.departure_at
    where baseline.departure_at > observed_at;
  return new;
end;
$$;

revoke all on function private.capture_trip_departure_budget() from public, anon, authenticated;

create trigger capture_trip_departure_budget
after insert or update of owner_id, start_date, timezone, budget_mode, budget_cents on public.trip
for each row execute function private.capture_trip_departure_budget();

-- An existing budget can only be verified as pre-departure for an upcoming trip.
insert into private.trip_departure_budget (trip_id, budget_cents, departure_at)
select t."tripID", t.budget_cents, t.start_date::timestamp at time zone t.timezone
from public.trip t
where t.owner_id is not null and t.budget_mode = 'group' and t.budget_cents > 0
  and t.start_date > (clock_timestamp() at time zone t.timezone)::date;

create function private.okr4_trip_budget_stats()
returns table (eligible_trips bigint, within_budget_trips bigint, trips_without_expenses bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  return query
  with completed_trips as (
    select b.trip_id, b.budget_cents
    from private.trip_departure_budget b
    join public.trip t on t."tripID" = b.trip_id
    where b.budget_cents is not null and t.owner_id is not null and t.end_date < (now() at time zone t.timezone)::date
  ),
  spending as (
    select t.trip_id, t.budget_cents, sum(e.amount_cents) as spent
    from completed_trips t
    left join public.trip_expense e on e.trip_id = t.trip_id
    group by t.trip_id, t.budget_cents
  )
  select count(*), count(*) filter (where spent <= budget_cents),
    count(*) filter (where spent is null)
  from spending;
end;
$$;

create function public.okr4_trip_budget_stats()
returns table (eligible_trips bigint, within_budget_trips bigint, trips_without_expenses bigint)
language sql stable security invoker set search_path = ''
as $$ select * from private.okr4_trip_budget_stats() $$;

revoke all on function private.okr4_trip_budget_stats(), public.okr4_trip_budget_stats() from public, anon, authenticated;
grant execute on function private.okr4_trip_budget_stats(), public.okr4_trip_budget_stats() to authenticated;

commit;
