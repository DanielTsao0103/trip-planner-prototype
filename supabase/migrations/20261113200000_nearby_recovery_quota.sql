begin;
-- A single empty-result recovery call reuses the same Tavily excerpts.
-- Reserve 16k Groq tokens per generation, keeping the daily project budget at 192k.
alter table private.nearby_research_usage alter column model_tokens set default 16000;
alter table private.nearby_research_usage drop constraint nearby_research_usage_model_tokens_check;
alter table private.nearby_research_usage add constraint nearby_research_usage_model_tokens_check check (model_tokens in (8000,16000));
create or replace function public.reserve_nearby_generation(p_actor uuid) returns uuid
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
  if (select coalesce(sum(model_tokens),0) from private.nearby_research_usage where created_at>=today)+16000>192000 then
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
commit;
