begin;
-- OKR #1: minimum telemetry for real saved-plan usage. No route, trip content,
-- email, device, or historical visit data is stored. Private tables are never API resources.
create table private.plan_tracking_settings (
  singleton boolean primary key default true check (singleton),
  started_at timestamptz not null default clock_timestamp()
);
insert into private.plan_tracking_settings default values;
create table private.plan_user_cohort (
  user_id uuid primary key references auth.users(id) on delete cascade,
  registered_at timestamptz not null default clock_timestamp(),
  planner_at timestamptz
);
create table private.plan_access_day (
  user_id uuid not null references auth.users(id) on delete cascade,
  access_date date not null,
  last_seen_at timestamptz not null default clock_timestamp(),
  primary key (user_id, access_date)
);
create index plan_access_day_date_idx on private.plan_access_day(access_date, user_id);
alter table private.plan_tracking_settings enable row level security;
alter table private.plan_user_cohort enable row level security;
alter table private.plan_access_day enable row level security;
revoke all on private.plan_tracking_settings, private.plan_user_cohort, private.plan_access_day from public, anon, authenticated;

-- Enrollment persists after trip deletion or membership revocation, so inactivity
-- cannot silently remove a planner from the denominator. Auth deletion cascades it.
create function private.enroll_plan_user(p_user uuid, p_planner boolean default false)
returns void language sql security definer set search_path='' as $$
  insert into private.plan_user_cohort(user_id, planner_at)
  select id, case when p_planner then clock_timestamp() end
  from auth.users where id=p_user and not coalesce(is_anonymous,false)
  on conflict(user_id) do update set planner_at=coalesce(private.plan_user_cohort.planner_at,excluded.planner_at)
$$;
create function private.enroll_plan_account_trigger() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform private.enroll_plan_user(new.id);
  return new;
end $$;
create trigger plan_account_enrollment after insert or update of is_anonymous on auth.users
for each row execute function private.enroll_plan_account_trigger();
create function private.enroll_plan_owner_trigger() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform private.enroll_plan_user(new.owner_id,true);
  return new;
end $$;
create trigger plan_owner_enrollment after insert or update of owner_id on public.trip
for each row execute function private.enroll_plan_owner_trigger();
create function private.enroll_plan_member_trigger() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.shared_account and new.status='accepted' and exists(
    select 1 from public.trip t join auth.users a on a.id=t.owner_id
    where t."tripID"=new."tripID" and not coalesce(a.is_anonymous,false)
  ) then perform private.enroll_plan_user(new."userID",true); end if;
  return new;
end $$;
create trigger plan_member_enrollment after insert or update of "userID",shared_account,status on public.trip_member
for each row execute function private.enroll_plan_member_trigger();

-- Baseline enrollment is observed now, never backdated to imply historical usage.
insert into private.plan_user_cohort(user_id,registered_at)
select id,(select started_at from private.plan_tracking_settings) from auth.users where not coalesce(is_anonymous,false);
update private.plan_user_cohort c set planner_at=(select started_at from private.plan_tracking_settings)
where exists(select 1 from public.trip t where t.owner_id=c.user_id)
   or exists(select 1 from public.trip_member m join public.trip t on t."tripID"=m."tripID"
     join auth.users owner_account on owner_account.id=t.owner_id
     where m."userID"=c.user_id and m.shared_account and m.status='accepted' and not coalesce(owner_account.is_anonymous,false));

create function private.record_trip_plan_access(p_trip uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); recorded_at timestamptz:=clock_timestamp();
begin
  if actor is null or not exists(select 1 from auth.users where id=actor and not coalesce(is_anonymous,false)) then
    raise exception 'A signed-in account is required' using errcode='42501';
  end if;
  if not exists(select 1 from public.trip t join auth.users a on a.id=t.owner_id
    where t."tripID"=p_trip and not coalesce(a.is_anonymous,false)
      and (t.owner_id=actor or exists(select 1 from public.trip_member m
        where m."tripID"=t."tripID" and m."userID"=actor and m.shared_account and m.status='accepted'))
  ) then raise exception 'Trip access denied' using errcode='42501'; end if;
  perform private.enroll_plan_user(actor,true);
  insert into private.plan_access_day(user_id,access_date,last_seen_at)
  values(actor,(recorded_at at time zone 'UTC')::date,recorded_at)
  on conflict(user_id,access_date) do update set last_seen_at=excluded.last_seen_at;
  return true;
end $$;
create function public.record_trip_plan_access(p_trip uuid) returns boolean
language sql security invoker set search_path='' as $$ select private.record_trip_plan_access(p_trip) $$;

-- The target is cadence, not visit volume: every adjacent pair of completed days
-- must contain at least one access. Seven clustered visits in 14 days cannot pass.
create function private.plan_access_is_consistent(p_user uuid,p_start date,p_end date) returns boolean
language sql stable security invoker set search_path='' as $$
  select p_end>=p_start and not exists(
    select 1 from generate_series(0,p_end-p_start-1) offset_day
    where not exists(select 1 from private.plan_access_day a where a.user_id=p_user
      and a.access_date between p_start+offset_day and p_start+offset_day+1)
  )
$$;

create function private.get_daniel_okr_metrics(p_days integer default 14) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  today_utc date:=(statement_timestamp() at time zone 'UTC')::date;
  starts date; ends date; tracking_start timestamptz; first_full_day date;
  registered_count bigint; planner_count bigint; current_planner_count bigint;
  eligible_planners bigint; consistent_planners bigint; eligible_users bigint; consistent_users bigint;
  trip_count bigint; shared_count bigint; sharing_owner_count bigint; collaborator_count bigint;
  daily_rows jsonb; trend_rows jsonb;
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception 'Admin access required' using errcode='42501';
  end if;
  if p_days is null or p_days not in(7,14,30) then
    raise exception 'Choose a 7, 14, or 30 day window' using errcode='22023';
  end if;
  starts:=today_utc-p_days; ends:=today_utc-1;
  select started_at into tracking_start from private.plan_tracking_settings;
  first_full_day:=(tracking_start at time zone 'UTC')::date
    +case when (tracking_start at time zone 'UTC')::time=time '00:00' then 0 else 1 end;
  select count(*),count(*) filter(where planner_at is not null),
    count(*) filter(where registered_at<=starts::timestamp at time zone 'UTC'),
    count(*) filter(where registered_at<=starts::timestamp at time zone 'UTC' and private.plan_access_is_consistent(user_id,starts,ends)),
    count(*) filter(where planner_at<=starts::timestamp at time zone 'UTC'),
    count(*) filter(where planner_at<=starts::timestamp at time zone 'UTC' and private.plan_access_is_consistent(user_id,starts,ends))
  into registered_count,planner_count,eligible_users,consistent_users,eligible_planners,consistent_planners
  from private.plan_user_cohort;

  select count(*),count(*) filter(where shared),count(distinct owner_id) filter(where shared)
  into trip_count,shared_count,sharing_owner_count from (
    select t.owner_id,exists(select 1 from public.trip_member m join auth.users a on a.id=m."userID"
      where m."tripID"=t."tripID" and m.shared_account and m.status='accepted' and m."userID"<>t.owner_id and not coalesce(a.is_anonymous,false)) as shared
    from public.trip t join auth.users a on a.id=t.owner_id where not coalesce(a.is_anonymous,false)
  ) trips;
  select count(distinct m."userID") into collaborator_count
  from public.trip_member m join public.trip t on t."tripID"=m."tripID"
  join auth.users a on a.id=m."userID" join auth.users owner_account on owner_account.id=t.owner_id
  where m.shared_account and m.status='accepted' and m."userID"<>t.owner_id
    and not coalesce(a.is_anonymous,false) and not coalesce(owner_account.is_anonymous,false);
  select count(*) into current_planner_count from private.plan_user_cohort c
  where exists(select 1 from public.trip t where t.owner_id=c.user_id)
    or exists(select 1 from public.trip_member m join public.trip t on t."tripID"=m."tripID"
      join auth.users a on a.id=t.owner_id where m."userID"=c.user_id and m.shared_account and m.status='accepted' and not coalesce(a.is_anonymous,false));

  select coalesce(jsonb_agg(jsonb_build_object('date',d,'activeUsers',active_count) order by d),'[]'::jsonb)
  into daily_rows from (
    select starts+offset_day as d,(select count(*) from private.plan_access_day a where a.access_date=starts+offset_day) as active_count
    from generate_series(0,p_days-1) offset_day where starts+offset_day>=first_full_day
  ) days;
  select coalesce(jsonb_agg(jsonb_build_object('date',d,'eligiblePlanners',ep,'consistentPlanners',cp,
    'percent',round(100.0*cp/nullif(ep,0),1),'eligibleUsers',eu,'consistentUsers',cu,
    'allUserPercent',round(100.0*cu/nullif(eu,0),1)) order by d),'[]'::jsonb)
  into trend_rows from (
    select starts+offset_day as d,
      count(*) filter(where planner_at<=(starts+offset_day-p_days+1)::timestamp at time zone 'UTC') as ep,
      count(*) filter(where planner_at<=(starts+offset_day-p_days+1)::timestamp at time zone 'UTC'
        and private.plan_access_is_consistent(user_id,starts+offset_day-p_days+1,starts+offset_day)) as cp,
      count(*) filter(where registered_at<=(starts+offset_day-p_days+1)::timestamp at time zone 'UTC') as eu,
      count(*) filter(where registered_at<=(starts+offset_day-p_days+1)::timestamp at time zone 'UTC'
        and private.plan_access_is_consistent(user_id,starts+offset_day-p_days+1,starts+offset_day)) as cu
    from generate_series(0,p_days-1) offset_day left join private.plan_user_cohort on true
    where starts+offset_day>=first_full_day group by offset_day
  ) trend;
  return jsonb_build_object(
    'trackingStartedAt',tracking_start,'windowStart',starts,'windowEnd',ends,'windowDays',p_days,
    'observedDays',least(p_days,greatest(0,today_utc-first_full_day)),'targetPercent',85,
    'registeredUsers',registered_count,'planners',planner_count,'currentPlanners',current_planner_count,
    'savedTrips',trip_count,'sharedTrips',shared_count,'sharingOwners',sharing_owner_count,'acceptedCollaborators',collaborator_count,
    'eligiblePlanners',eligible_planners,'consistentPlanners',consistent_planners,
    'eligibleUsers',eligible_users,'consistentUsers',consistent_users,
    'retentionPercent',round(100.0*consistent_planners/nullif(eligible_planners,0),1),
    'allUserRetentionPercent',round(100.0*consistent_users/nullif(eligible_users,0),1),
    'activeToday',(select count(*) from private.plan_access_day where access_date=today_utc),
    'activeYesterday',(select count(*) from private.plan_access_day where access_date=ends),
    'activeInWindow',(select count(distinct user_id) from private.plan_access_day where access_date between greatest(starts,first_full_day) and ends),
    'newPlanners',(select count(*) from private.plan_user_cohort where planner_at>=starts::timestamp at time zone 'UTC' and planner_at<today_utc::timestamp at time zone 'UTC'),
    'lastActivityAt',(select max(last_seen_at) from private.plan_access_day),
    'daily',daily_rows,'trend',trend_rows
  );
end $$;
create function public.get_daniel_okr_metrics(p_days integer default 14) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.get_daniel_okr_metrics(p_days) $$;

revoke all on function private.enroll_plan_user(uuid,boolean),private.enroll_plan_account_trigger(),
  private.enroll_plan_owner_trigger(),private.enroll_plan_member_trigger(),private.plan_access_is_consistent(uuid,date,date),
  private.record_trip_plan_access(uuid),public.record_trip_plan_access(uuid),
  private.get_daniel_okr_metrics(integer),public.get_daniel_okr_metrics(integer) from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.record_trip_plan_access(uuid),public.record_trip_plan_access(uuid),
  private.get_daniel_okr_metrics(integer),public.get_daniel_okr_metrics(integer) to authenticated;
comment on table private.plan_access_day is 'Server-dated real-account plan access, one row per user per UTC day; no trip identity or content. Account deletion cascades.';
comment on table private.plan_user_cohort is 'Enrollment observed at telemetry launch or first real trip access/ownership/sharing; retained despite later inactivity or trip deletion.';
notify pgrst,'reload schema';
commit;
