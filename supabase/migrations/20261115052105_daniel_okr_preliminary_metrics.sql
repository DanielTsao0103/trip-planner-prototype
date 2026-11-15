begin;
-- Add an early aggregate without changing the official 14-day calculation or
-- backdating enrollment. Raw account/day records remain private.
create or replace function private.get_daniel_okr_preliminary_metrics(p_days integer default 14)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  today_utc date:=(statement_timestamp() at time zone 'UTC')::date;
  tracking_start timestamptz; launch_day date; first_full_day date;
  starts date; ends date; completed_days integer;
  eligible bigint:=0; consistent bigint:=0; daily_rows jsonb;
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception 'Admin access required' using errcode='42501';
  end if;
  if p_days is null or p_days not in (7,14,30) then
    raise exception 'Choose a 7, 14, or 30 day window' using errcode='22023';
  end if;
  select started_at into tracking_start from private.plan_tracking_settings;
  launch_day:=(tracking_start at time zone 'UTC')::date;
  first_full_day:=launch_day+case when (tracking_start at time zone 'UTC')::time=time '00:00' then 0 else 1 end;
  starts:=greatest(today_utc-p_days,first_full_day);
  ends:=today_utc-1;
  completed_days:=greatest(0,ends-starts+1);

  -- One day has no adjacent pair: never allow vacuous 100% consistency.
  if completed_days>=2 then
    select count(*),count(*) filter(where private.plan_access_is_consistent(user_id,starts,ends))
    into eligible,consistent from private.plan_user_cohort
    where planner_at<=starts::timestamp at time zone 'UTC';
  end if;

  -- Real activity is useful from the partial launch day onward. Include zero
  -- days after launch; never manufacture pre-launch history. Today is separate.
  select coalesce(jsonb_agg(jsonb_build_object('date',d,'activeUsers',n) order by d),'[]'::jsonb)
  into daily_rows from (
    select today_utc-p_days+offset_day as d,
      (select count(*) from private.plan_access_day where access_date=today_utc-p_days+offset_day) as n
    from generate_series(0,p_days-1) offset_day where today_utc-p_days+offset_day>=launch_day
  ) days;
  return jsonb_build_object('windowStart',starts,'windowEnd',ends,'observedDays',completed_days,
    'eligiblePlanners',eligible,'consistentPlanners',consistent,
    'retentionPercent',round(100.0*consistent/nullif(eligible,0),1),'daily',daily_rows);
end $$;
revoke all on function private.get_daniel_okr_preliminary_metrics(integer) from public,anon,authenticated;
grant execute on function private.get_daniel_okr_preliminary_metrics(integer) to authenticated;

-- Additive contract: old clients continue using the unchanged official fields.
create or replace function public.get_daniel_okr_metrics(p_days integer default 14) returns jsonb
language sql stable security invoker set search_path='' as $$
  select private.get_daniel_okr_metrics(p_days)
    || jsonb_build_object('preliminary',private.get_daniel_okr_preliminary_metrics(p_days))
$$;
revoke all on function public.get_daniel_okr_metrics(integer) from public,anon,authenticated;
grant execute on function public.get_daniel_okr_metrics(integer) to authenticated;
notify pgrst,'reload schema';
commit;
