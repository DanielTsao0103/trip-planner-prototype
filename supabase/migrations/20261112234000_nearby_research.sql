begin;
-- No provider content, identities beyond account IDs, or preference text is logged.
create table private.nearby_research_usage (
  id uuid primary key default gen_random_uuid(),
  actor uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  search_credits integer not null default 2 check (search_credits=2),
  model_tokens integer not null default 8000 check (model_tokens=8000),
  outcome text check (outcome in ('complete','failed'))
);
create index nearby_research_usage_date on private.nearby_research_usage(created_at);
create index nearby_research_usage_actor_date on private.nearby_research_usage(actor,created_at);
revoke all on private.nearby_research_usage from public,anon,authenticated;
create function public.nearby_trip_context(p_trip_id uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.trip_bundle(p_trip_id) $$;
revoke all on function public.nearby_trip_context(uuid) from public,anon;
grant execute on function public.nearby_trip_context(uuid) to authenticated;

-- Server-only, atomic project reservation: 5/user/day, 24/project/day,
-- 1/project/minute, 500/project/month (1000 basic Tavily credits).
-- Failures retain their reservations: external quota may already have been used.
create function public.reserve_nearby_generation(p_actor uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare request_id uuid;
  today timestamptz := date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
  month_start timestamptz := date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
begin
  if p_actor is null then raise exception 'Sign in first' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(731122340);
  if (select count(*) from private.nearby_research_usage where actor=p_actor and created_at>=today)>=5 then
    raise exception 'Daily user limit reached. Try again after midnight UTC.' using errcode='P0001';
  end if;
  if (select coalesce(sum(search_credits),0) from private.nearby_research_usage where created_at>=month_start)+2>1000 then
    raise exception 'The shared monthly free research allowance is exhausted. It resets on the first day of next month (UTC).' using errcode='P0001';
  end if;
  if (select count(*) from private.nearby_research_usage where created_at>=today)>=24 then
    raise exception 'The shared daily free AI allowance is exhausted. Try again after midnight UTC.' using errcode='P0001';
  end if;
  if exists(select from private.nearby_research_usage where created_at>now()-interval '60 seconds') then
    raise exception 'Another research request just used the shared free allowance. Please wait one minute.' using errcode='P0001';
  end if;
  insert into private.nearby_research_usage(actor) values(p_actor) returning id into request_id;
  return request_id;
end $$;
revoke all on function public.reserve_nearby_generation(uuid) from public,anon,authenticated;
grant execute on function public.reserve_nearby_generation(uuid) to service_role;
create function public.finish_nearby_generation(p_request uuid,p_outcome text) returns void
language sql security definer set search_path='' as $$
  update private.nearby_research_usage set outcome=p_outcome
  where id=p_request and outcome is null and p_outcome in ('complete','failed');
$$;
revoke all on function public.finish_nearby_generation(uuid,text) from public,anon,authenticated;
grant execute on function public.finish_nearby_generation(uuid,text) to service_role;
commit;
