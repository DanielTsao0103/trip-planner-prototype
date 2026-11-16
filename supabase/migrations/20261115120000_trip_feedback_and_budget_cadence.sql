begin;

-- Private, deduplicated day-level signals. No itinerary content is copied here.
create table private.budget_cadence_day (
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid not null references public.trip("tripID") on delete cascade,
  activity_date date not null,
  accessed boolean not null default false,
  budget_changed boolean not null default false,
  primary key(user_id,trip_id,activity_date)
);
alter table private.budget_cadence_day enable row level security;
revoke all on private.budget_cadence_day from public,anon,authenticated;

create function private.record_budget_cadence_access(p_trip uuid,p_actor uuid,p_date date)
returns void language sql security definer set search_path='' as $$
  insert into private.budget_cadence_day(user_id,trip_id,activity_date,accessed)
  values(p_actor,p_trip,p_date,true)
  on conflict(user_id,trip_id,activity_date) do update set accessed=true
$$;
revoke all on function private.record_budget_cadence_access(uuid,uuid,date) from public,anon,authenticated;

-- Track trip-specific visits alongside the pre-existing account-level OKR signal.
do $$
declare body text;
begin
  body:=pg_get_functiondef('private.record_trip_plan_access(uuid)'::regprocedure);
  if position('private.record_budget_cadence_access' in body)=0 then
    body:=replace(body,
      '  on conflict(user_id,access_date) do update set last_seen_at=excluded.last_seen_at;',
      '  on conflict(user_id,access_date) do update set last_seen_at=excluded.last_seen_at;'||E'\n'||
      '  perform private.record_budget_cadence_access(p_trip,actor,(recorded_at at time zone ''UTC'')::date);');
    if position('private.record_budget_cadence_access' in body)=0 then raise exception 'Could not extend trip access tracking'; end if;
    execute body;
  end if;
end $$;

-- The atomic trip save already validates ownership and serializes writes. Add a
-- single deduplicated marker only when budget fields or expense records changed.
create function private.record_budget_cadence_change(p_trip uuid,p_data jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); now_utc date:=(statement_timestamp() at time zone 'UTC')::date;
  current_trip public.trip; new_expenses jsonb; old_expenses jsonb;
  new_individual jsonb; old_individual jsonb; changed boolean:=false;
begin
  if actor is null then return; end if;
  select * into current_trip from public.trip where "tripID"=p_trip;
  if not found or now_utc not between current_trip.start_date and current_trip.end_date then return; end if;
  if (p_data->>'budget') is distinct from current_trip.budget_cents::text
     or p_data->>'budgetMode' is distinct from current_trip.budget_mode then changed:=true; end if;
  select coalesce(jsonb_object_agg(b.participant_id::text,b.budget_cents),'{}'::jsonb) into old_individual
    from public.trip_person_budget b where b.trip_id=p_trip;
  new_individual:=coalesce(p_data->'individual','{}'::jsonb);
  if old_individual is distinct from new_individual then changed:=true; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'purpose',e.purpose,'amount',e.amount_cents,'category',e.category,'payer',e.payer_id,'date',e.expense_date,'source',e.source,'shares',coalesce((select jsonb_object_agg(sh.participant_id::text,sh.amount_cents) from public.trip_expense_share sh where sh.trip_id=e.trip_id and sh.expense_id=e.id),'{}'::jsonb),'settled',coalesce((select jsonb_agg(sh.participant_id::text order by sh.participant_id) from public.trip_expense_share sh where sh.trip_id=e.trip_id and sh.expense_id=e.id and sh.settled),'[]'::jsonb)) order by e.expense_date,e.id),'[]'::jsonb) into old_expenses from public.trip_expense e where e.trip_id=p_trip;
  select coalesce(jsonb_agg(jsonb_build_object('id',x->>'id','purpose',x->>'purpose','amount',(x->>'amount')::bigint,'category',x->>'category','payer',x->>'payer','date',(x->>'date')::date,'source',x->>'source','shares',x->'shares','settled',coalesce((select jsonb_agg(v order by v) from jsonb_array_elements_text(coalesce(x->'settled','[]'::jsonb)) as settled_rows(v)),'[]'::jsonb)) order by x->>'date',x->>'id'),'[]'::jsonb) into new_expenses from jsonb_array_elements(coalesce(p_data->'expenses','[]'::jsonb)) x;
  if old_expenses is distinct from new_expenses then changed:=true; end if;
  if changed then
    insert into private.budget_cadence_day(user_id,trip_id,activity_date,budget_changed)
    values(actor,p_trip,now_utc,true)
    on conflict(user_id,trip_id,activity_date) do update set budget_changed=true;
  end if;
end $$;

do $$
declare body text;
begin
  -- save_trip_bundle is only a compatibility wrapper in the deployed schema.
  -- persist_trip_bundle is the shared atomic writer used by owner and shared saves.
  body:=pg_get_functiondef('private.persist_trip_bundle(uuid,integer,uuid,jsonb,uuid)'::regprocedure);
  if position('private.record_budget_cadence_change' in body)=0 then
    body:=replace(body,
      'delete from public.trip_expense where trip_id=p_trip_id;',
      ' perform private.record_budget_cadence_change(p_trip_id,p_data);'||E'\n'||
      ' delete from public.trip_expense where trip_id=p_trip_id;');
    if position('private.record_budget_cadence_change' in body)=0 then raise exception 'Could not extend atomic trip save'; end if;
    execute body;
  end if;
end $$;

create function public.get_budget_cadence_metrics(p_days integer default 14) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare today_utc date:=(statement_timestamp() at time zone 'UTC')::date;
  first_day date; eligible bigint; consistent bigint; observed integer;
begin
  if auth.uid() is null or not private.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  if p_days not between 2 and 90 then raise exception 'Invalid reporting window'; end if;
  first_day:=today_utc-(p_days-1);
  with windows as (
    select t.user_id,t.trip_id,first_day+n as window_start,first_day+n+1 as window_end
    from (
      select tr.owner_id as user_id,tr."tripID" as trip_id from public.trip tr
      union
      select m."userID",m."tripID" from public.trip_member m where m.shared_account and m.status='accepted'
    ) t
    cross join generate_series(0,p_days-2) n
    join public.trip tr on tr."tripID"=t.trip_id
    where first_day+n between tr.start_date and tr.end_date
      and first_day+n+1 between tr.start_date and tr.end_date
  ), by_trip as (
    select w.user_id,w.trip_id,bool_and(exists(
      select 1 from private.budget_cadence_day q where q.user_id=w.user_id and q.trip_id=w.trip_id
        and q.activity_date between w.window_start and w.window_end and q.accessed and q.budget_changed
    )) as all_windows_met,max(w.window_end) as last_date
    from windows w group by w.user_id,w.trip_id
  ), by_user as (
    select user_id,bool_and(all_windows_met) as all_windows_met,max(last_date) as last_date
    from by_trip group by user_id
  )
  select count(*),count(*) filter(where all_windows_met),coalesce(max(last_date-first_day+1),0)::integer
  into eligible,consistent,observed from by_user;
  return jsonb_build_object('windowStart',first_day,'windowEnd',today_utc,'windowDays',p_days,
    'observedDays',least(observed,p_days),'eligibleUsers',eligible,'consistentUsers',consistent,
    'percent',case when eligible=0 then null else round(100.0*consistent/eligible,1) end,'targetPercent',85,
    'definition','For every rolling two-day window fully inside an active trip, at least one day must include both a trip-plan visit and a real budget, individual-budget, or expense change. UTC dates.');
end $$;
revoke all on function public.get_budget_cadence_metrics(integer) from public,anon;
grant execute on function public.get_budget_cadence_metrics(integer) to authenticated;

create table private.trip_recommendation_feedback (
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid not null references public.trip("tripID") on delete cascade,
  specific_recommendations boolean not null,
  matched_find_category boolean not null,
  answered_at timestamptz not null default clock_timestamp(),
  primary key(user_id,trip_id)
);
alter table private.trip_recommendation_feedback enable row level security;
revoke all on private.trip_recommendation_feedback from public,anon,authenticated;

create function public.pending_trip_recommendation_feedback() returns table(trip_id uuid,title text)
language sql stable security definer set search_path='' as $$
  select t."tripID",t.trip_name from public.trip t
  where auth.uid() is not null and (t.owner_id=auth.uid() or exists(select 1 from public.trip_member m where m."tripID"=t."tripID" and m."userID"=auth.uid() and m.shared_account and m.status='accepted'))
    and t.end_date < (clock_timestamp() at time zone t.timezone)::date
    and not exists(select 1 from private.trip_recommendation_feedback f where f.user_id=auth.uid() and f.trip_id=t."tripID")
  order by t.end_date desc limit 1
$$;
revoke all on function private.record_budget_cadence_change(uuid,jsonb) from public,anon,authenticated;
create function public.submit_trip_recommendation_feedback(p_trip uuid,p_specific boolean,p_matched_find boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if actor is null or coalesce((select is_anonymous from auth.users where id=actor),true) then raise exception 'A signed-in account is required' using errcode='42501'; end if;
  if not exists(select 1 from public.trip t where t."tripID"=p_trip and t.end_date < (clock_timestamp() at time zone t.timezone)::date
    and (t.owner_id=actor or exists(select 1 from public.trip_member m where m."tripID"=t."tripID" and m."userID"=actor and m.shared_account and m.status='accepted'))) then raise exception 'Trip feedback access denied' using errcode='42501'; end if;
  insert into private.trip_recommendation_feedback(user_id,trip_id,specific_recommendations,matched_find_category)
    values(actor,p_trip,p_specific,p_matched_find)
    on conflict(user_id,trip_id) do update set specific_recommendations=excluded.specific_recommendations,matched_find_category=excluded.matched_find_category,answered_at=clock_timestamp();
  return true;
end $$;
create function public.get_nearby_feedback_signal() returns jsonb
language sql stable security definer set search_path='' as $$
  with counts as (
    select count(*)::integer as responses,
      count(*) filter(where specific_recommendations)::integer as specific_yes,
      count(*) filter(where matched_find_category)::integer as category_yes
    from private.trip_recommendation_feedback where user_id=auth.uid()
  )
  select case when responses<3 then null else jsonb_build_object('responses',responses,
    'specificSuccessRate',round(100.0*specific_yes/responses,1),
    'categoryMatchRate',round(100.0*category_yes/responses,1)) end from counts
$$;
revoke all on function public.pending_trip_recommendation_feedback(),public.submit_trip_recommendation_feedback(uuid,boolean,boolean),public.get_nearby_feedback_signal() from public,anon;
grant execute on function public.pending_trip_recommendation_feedback(),public.submit_trip_recommendation_feedback(uuid,boolean,boolean),public.get_nearby_feedback_signal() to authenticated;

commit;
