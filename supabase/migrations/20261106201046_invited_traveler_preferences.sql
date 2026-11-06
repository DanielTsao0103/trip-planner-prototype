begin;

-- Viewers submit just their own survey. Only the database maps their login to
-- the planner ID, which can predate signup and differ from the account UUID.
create function private.save_invited_preferences(p_trip uuid, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  traveler uuid;
  field text;
begin
  if auth.uid() is null then raise exception 'Sign in to save preferences' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_trip::text,0));
  select planner_id into strict traveler from public.trip_member
    where "tripID"=p_trip and "userID"=auth.uid() and shared_account and status='accepted';

  if jsonb_typeof(p_answers) is distinct from 'object' or octet_length(p_answers::text)>64000 then
    raise exception 'Invalid survey answers';
  end if;
  foreach field in array array['diet','access','interests'] loop
    if jsonb_typeof(p_answers->field) is distinct from 'array' then raise exception 'Invalid survey selections'; end if;
    if jsonb_array_length(p_answers->field)>30 or exists (
      select from jsonb_array_elements(p_answers->field) item
      where jsonb_typeof(item)<>'string' or length(item #>> '{}')>100
    ) then raise exception 'Invalid survey selections'; end if;
  end loop;
  foreach field in array array['food','spending','dining','atmosphere','tickets','destinations','notes'] loop
    if jsonb_typeof(p_answers->field) is distinct from 'string' or
      (field not in ('destinations','notes') and length(p_answers->>field)>100)
      then raise exception 'Invalid survey text'; end if;
  end loop;
  if jsonb_typeof(p_answers->'walk') is distinct from 'number' then raise exception 'Invalid walking limit'; end if;

  -- Both statements share the same transaction and trip lock as owner edits.
  delete from public.trip_preference where trip_id=p_trip and participant_id=traveler;
  insert into public.trip_preference (trip_id,participant_id,diet,food,spending,dining,atmosphere,access,walk,interests,destinations,tickets,notes)
  values (p_trip, traveler, array(select jsonb_array_elements_text(p_answers->'diet')),
    p_answers->>'food',p_answers->>'spending',p_answers->>'dining',p_answers->>'atmosphere',
    array(select jsonb_array_elements_text(p_answers->'access')),(p_answers->>'walk')::integer,
    array(select jsonb_array_elements_text(p_answers->'interests')),p_answers->>'destinations',
    p_answers->>'tickets',p_answers->>'notes');
  -- The trip update trigger advances the revision so stale owner saves conflict.
  update public.trip set last_write_id=null,last_write_hash=null where "tripID"=p_trip;
  return private.trip_bundle(p_trip);
exception when no_data_found then
  raise exception 'An accepted invitation is required to save preferences' using errcode='42501';
end $$;

create function public.save_invited_preferences(p_trip uuid,p_answers jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select private.save_invited_preferences(p_trip,p_answers)
$$;
revoke all on function private.save_invited_preferences(uuid,jsonb),public.save_invited_preferences(uuid,jsonb) from public,anon;
grant execute on function private.save_invited_preferences(uuid,jsonb),public.save_invited_preferences(uuid,jsonb) to authenticated;
commit;
