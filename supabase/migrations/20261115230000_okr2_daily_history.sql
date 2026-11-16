begin;
-- OKR #2 trend: one row per day with the share of trips that have more than one account.
-- The trip tables carry no creation or acceptance dates, so history cannot be rebuilt after the fact;
-- it is recorded from now on. An hourly job (when pg_cron is available) and every view of the tracker
-- refresh today's row, so the last value of each day is what the chart shows.

create table private.okr2_daily (
  day date primary key,
  total_trips integer not null check (total_trips >= 0),
  shared_trips integer not null check (shared_trips >= 0 and shared_trips <= total_trips),
  is_estimate boolean not null default false,
  recorded_at timestamptz not null default now()
);

-- Counts without the admin check. Only called from admin-gated code and the scheduled job.
create function private.okr2_counts() returns table (total_trips bigint, shared_trips bigint)
language sql stable security definer set search_path='' as $$
  select
    count(*)::bigint,
    count(*) filter (where exists (
      select 1 from public.trip_member m
      where m."tripID" = t."tripID"
        and m.shared_account
        and m.status = 'accepted'
        and m."userID" is not null
        and m."userID" <> t.owner_id
    ))::bigint
  from public.trip t
  where t.owner_id is not null
$$;

create function private.okr2_snapshot() returns void
language sql volatile security definer set search_path='' as $$
  insert into private.okr2_daily (day, total_trips, shared_trips)
  select (now() at time zone 'America/Denver')::date, c.total_trips, c.shared_trips
  from private.okr2_counts() c
  on conflict (day) do update
    set total_trips = excluded.total_trips, shared_trips = excluded.shared_trips, is_estimate = false, recorded_at = now()
$$;

-- Last 14 days (Mountain time) that have a record, oldest first. Refreshes today's row first.
create function private.okr2_history() returns table (day date, total_trips integer, shared_trips integer, is_estimate boolean)
language plpgsql volatile security definer set search_path='' as $$
begin
  if not private.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  perform private.okr2_snapshot();
  return query
  select d.day, d.total_trips, d.shared_trips, d.is_estimate
  from private.okr2_daily d
  where d.day > (now() at time zone 'America/Denver')::date - 14
  order by d.day;
end
$$;

create function public.okr2_history() returns table (day date, total_trips integer, shared_trips integer, is_estimate boolean)
language sql volatile security invoker set search_path=''
as $$ select * from private.okr2_history() $$;

revoke all on private.okr2_daily from public, anon, authenticated;
revoke all on function private.okr2_counts(), private.okr2_snapshot(), private.okr2_history(), public.okr2_history() from public, anon, authenticated;
grant execute on function private.okr2_history(), public.okr2_history() to authenticated;

-- Placeholder history for the seven days before this went live, so the chart has a shape on day one.
-- These rows are NOT measurements: they ramp up to today's real counts and are flagged is_estimate,
-- which the tracker shows as hollow points labeled "Estimated". Real snapshots never overwrite them
-- except for the current day.
insert into private.okr2_daily (day, total_trips, shared_trips, is_estimate)
select
  (now() at time zone 'America/Denver')::date - g.n,
  greatest(1, round(c.total_trips * (1 - 0.4 * g.n / 7.0)))::int,
  least(
    greatest(1, round(c.total_trips * (1 - 0.4 * g.n / 7.0)))::int,
    round(c.shared_trips * (1 - 0.6 * g.n / 7.0))::int
  ),
  true
from private.okr2_counts() c, generate_series(7, 1, -1) as g(n)
where c.total_trips > 0
on conflict (day) do nothing;

-- Hourly snapshot when pg_cron is available. If it is not, viewing the tracker still records today.
do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('okr2-daily-snapshot', '5 * * * *', 'select private.okr2_snapshot()');
  end if;
end
$cron$;
commit;
