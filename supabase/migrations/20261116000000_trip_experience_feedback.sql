begin;

-- Keep recommendation-specific historical answers separate from the end-of-trip survey.
create table private.trip_experience_feedback (
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid not null references public.trip("tripID") on delete cascade,
  met_expectations boolean not null,
  would_recommend boolean not null,
  answered_at timestamptz not null default clock_timestamp(),
  primary key(user_id, trip_id)
);
alter table private.trip_experience_feedback enable row level security;
revoke all on private.trip_experience_feedback from public, anon, authenticated;

create function public.pending_trip_experience_feedback()
returns table(trip_id uuid, title text, completed_on date)
language sql stable security definer set search_path='' as $$
  select t."tripID",t.trip_name,t.end_date
  from public.trip t
  where auth.uid() is not null
    and t.end_date < (statement_timestamp() at time zone t.timezone)::date
    and (
      t.owner_id=auth.uid()
      or exists (
        select 1 from public.trip_member m
        where m."tripID"=t."tripID" and m."userID"=auth.uid()
          and m.shared_account and m.status='accepted'
      )
    )
    and not exists (
      select 1 from private.trip_experience_feedback f
      where f.user_id=auth.uid() and f.trip_id=t."tripID"
    )
  order by t.end_date desc
  limit 1
$$;

create function public.submit_trip_experience_feedback(
  p_trip uuid,p_met_expectations boolean,p_would_recommend boolean
) returns boolean
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if actor is null or coalesce((select is_anonymous from auth.users where id=actor),true) then
    raise exception 'A signed-in account is required' using errcode='42501';
  end if;
  if p_met_expectations is null or p_would_recommend is null then
    raise exception 'Both trip feedback answers are required';
  end if;
  if not exists (
    select 1 from public.trip t
    where t."tripID"=p_trip
      and t.end_date < (statement_timestamp() at time zone t.timezone)::date
      and (
        t.owner_id=actor
        or exists (
          select 1 from public.trip_member m
          where m."tripID"=t."tripID" and m."userID"=actor
            and m.shared_account and m.status='accepted'
        )
      )
  ) then raise exception 'Trip feedback is available only after an accessible trip has ended' using errcode='42501'; end if;
  insert into private.trip_experience_feedback(user_id,trip_id,met_expectations,would_recommend)
    values(actor,p_trip,p_met_expectations,p_would_recommend)
    on conflict(user_id,trip_id) do nothing;
  return true;
end $$;

-- Recommendation generation consumes only aggregate trip-level satisfaction signals.
create or replace function public.get_nearby_feedback_signal() returns jsonb
language sql stable security definer set search_path='' as $$
  with counts as (
    select count(*)::integer as responses,
      count(*) filter(where met_expectations)::integer as met_expectations_yes,
      count(*) filter(where would_recommend)::integer as would_recommend_yes
    from private.trip_experience_feedback where user_id=auth.uid()
  )
  select case when responses<3 then null else jsonb_build_object('responses',responses,
    'tripSatisfactionRate',round(100.0*met_expectations_yes/responses,1),
    'wouldRecommendRate',round(100.0*would_recommend_yes/responses,1)) end from counts
$$;

revoke all on function public.pending_trip_experience_feedback(),
  public.submit_trip_experience_feedback(uuid,boolean,boolean),
  public.get_nearby_feedback_signal() from public,anon;
grant execute on function public.pending_trip_experience_feedback(),
  public.submit_trip_experience_feedback(uuid,boolean,boolean),
  public.get_nearby_feedback_signal() to authenticated;

commit;
