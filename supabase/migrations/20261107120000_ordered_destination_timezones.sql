create table public.trip_destination_timezone (
  trip_id uuid not null references public.trip("tripID") on delete cascade,
  destination_order smallint not null check (destination_order between 0 and 19),
  destination text not null check (length(btrim(destination)) between 1 and 220),
  timezone text,
  primary key (trip_id, destination_order)
);

-- Existing trips only had one trip-wide timezone. Preserve it for the first
-- destination and leave the remaining destinations unresolved until edited.
insert into public.trip_destination_timezone(trip_id,destination_order,destination,timezone)
select t."tripID",(d.ordinality-1)::smallint,d.destination,
  case when d.ordinality=1 then t.timezone else null end
from public.trip t
cross join lateral unnest(t.destinations) with ordinality as d(destination,ordinality)
on conflict do nothing;

revoke all on public.trip_destination_timezone from public, anon, authenticated;
alter table public.trip_destination_timezone enable row level security;

-- Return the ordered timezone list as trip content for account and shared-trip reads.
do $migration$
declare body text; fragment text:='''image'',t.image_url,''budget'',t.budget_cents'; replacement text;
begin
  body:=pg_get_functiondef('private.trip_bundle(uuid)'::regprocedure);
  if strpos(body,fragment)=0 then raise exception 'Unexpected trip bundle content'; end if;
  replacement:='''image'',t.image_url,''destinationTimezones'',coalesce((select jsonb_agg(d.timezone order by d.destination_order) from public.trip_destination_timezone d where d.trip_id=p_trip_id),''[]''::jsonb),''budget'',t.budget_cents';
  execute replace(body,fragment,replacement);
end $migration$;

create function public.save_trip_bundle_with_timezones(
  p_trip_id uuid,p_expected_revision integer,p_request_id uuid,p_data jsonb,p_destination_timezones text[]
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare destinations text[]; result jsonb; i integer;
begin
  if auth.uid() is null then raise exception 'Sign in to save this trip' using errcode='42501'; end if;
  destinations:=array(select jsonb_array_elements_text(p_data->'destinations'));
  if coalesce(array_length(destinations,1),0)=0 or array_length(destinations,1)>20
    or coalesce(array_length(p_destination_timezones,1),0)<>array_length(destinations,1) then
    raise exception 'Each trip destination needs a matching timezone entry';
  end if;
  for i in 1..array_length(destinations,1) loop
    if p_destination_timezones[i] is not null and not exists(
      select from pg_catalog.pg_timezone_names z where z.name=p_destination_timezones[i]
    ) then raise exception 'Invalid destination timezone'; end if;
  end loop;

  -- The existing owner-only bundle writer retains revision, validation, and
  -- transaction guarantees; timezone rows are saved in the same transaction.
  result:=private.save_trip_bundle(p_trip_id,p_expected_revision,p_request_id,p_data);
  delete from public.trip_destination_timezone where trip_id=p_trip_id;
  for i in 1..array_length(destinations,1) loop
    insert into public.trip_destination_timezone(trip_id,destination_order,destination,timezone)
    values(p_trip_id,(i-1)::smallint,destinations[i],p_destination_timezones[i]);
  end loop;
  return private.trip_bundle(p_trip_id);
end $$;

revoke all on function public.save_trip_bundle_with_timezones(uuid,integer,uuid,jsonb,text[]) from public,anon;
grant execute on function public.save_trip_bundle_with_timezones(uuid,integer,uuid,jsonb,text[]) to authenticated;
