begin;

-- Existing budget_changed signals include budget edits and cannot be reclassified.
-- Start a separate, accurate expense-only series when this migration is applied.
alter table private.budget_cadence_day add column expense_logged boolean not null default false;
create table private.expense_okr_tracking_start (
  singleton boolean primary key default true check (singleton),
  started_on date not null
);
insert into private.expense_okr_tracking_start(singleton, started_on)
values (true, (statement_timestamp() at time zone 'UTC')::date);
alter table private.expense_okr_tracking_start enable row level security;
revoke all on private.expense_okr_tracking_start from public, anon, authenticated;

-- Called before the atomic trip writer replaces expense rows. A new expense ID,
-- saved by a signed-in traveler during the trip, is the only qualifying event.
create or replace function private.record_budget_cadence_change(p_trip uuid, p_data jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  today_utc date := (statement_timestamp() at time zone 'UTC')::date;
  trip_start date;
  trip_end date;
begin
  if actor is null then return; end if;
  select t.start_date, t.end_date into trip_start, trip_end
    from public.trip t where t."tripID" = p_trip;
  if not found or today_utc not between trip_start and trip_end then return; end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_data->'expenses', '[]'::jsonb)) as incoming(expense)
    where not exists (
      select 1 from public.trip_expense saved
      where saved.trip_id = p_trip and saved.id = (incoming.expense->>'id')
    )
  ) then
    insert into private.budget_cadence_day(user_id, trip_id, activity_date, expense_logged)
    values (actor, p_trip, today_utc, true)
    on conflict(user_id, trip_id, activity_date) do update set expense_logged = true;
  end if;
end $$;
revoke all on function private.record_budget_cadence_change(uuid,jsonb) from public, anon, authenticated;

create or replace function public.get_budget_cadence_metrics(p_days integer default 14)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  today_utc date := (statement_timestamp() at time zone 'UTC')::date;
  tracking_start date;
  first_day date;
  result jsonb;
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception 'Admin access required' using errcode='42501';
  end if;
  if p_days not between 2 and 90 then raise exception 'Invalid reporting window' using errcode='22023'; end if;
  select started_on into tracking_start from private.expense_okr_tracking_start where singleton;
  first_day := greatest(today_utc - p_days, tracking_start);
  with members as (
    select t.owner_id as user_id, t."tripID" as trip_id, t.start_date, t.end_date
      from public.trip t where t.owner_id is not null
    union
    select m."userID", t."tripID", t.start_date, t.end_date
      from public.trip_member m join public.trip t on t."tripID" = m."tripID"
      where m.shared_account and m.status = 'accepted'
  ), windows as (
    select m.user_id, m.trip_id, d::date as window_end,
      exists (
        select 1 from private.budget_cadence_day q
        where q.user_id = m.user_id and q.trip_id = m.trip_id
          and q.activity_date between d::date - 1 and d::date and q.expense_logged
      ) as logged
    from members m
    cross join generate_series(first_day + 1, today_utc - 1, interval '1 day') d
    where d::date - 1 between m.start_date and m.end_date
      and d::date between m.start_date and m.end_date
  ), by_user as (
    select user_id, bool_and(logged) as consistent from windows group by user_id
  ), by_day as (
    select window_end, user_id, bool_and(logged) as logged
      from windows group by window_end, user_id
  ), daily as (
    select window_end, count(*) as eligible, count(*) filter (where logged) as logging
      from by_day group by window_end
  )
  select jsonb_build_object(
    'windowStart', first_day, 'windowEnd', today_utc - 1, 'trackingStart', tracking_start,
    'observedDays', today_utc - first_day,
    'eligibleUsers', (select count(*) from by_user),
    'consistentUsers', (select count(*) from by_user where consistent),
    'percent', (select case when count(*) = 0 then null
      else round(100.0 * count(*) filter (where consistent) / count(*), 1) end from by_user),
    'targetPercent', 60,
    'daily', coalesce((select jsonb_agg(jsonb_build_object(
      'day', window_end, 'eligibleUsers', eligible, 'loggingUsers', logging,
      'percent', round(100.0 * logging / eligible, 1)
    ) order by window_end) from daily), '[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function public.get_budget_cadence_metrics(integer) from public, anon;
grant execute on function public.get_budget_cadence_metrics(integer) to authenticated;

commit;
