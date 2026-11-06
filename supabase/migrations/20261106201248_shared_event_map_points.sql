begin;

-- One coordinate pair per event. A null pin represents a location awaiting confirmation.
alter table public.event add column map_point jsonb
  check (map_point is null or (
    jsonb_typeof(map_point) = 'object'
    and map_point ?& array['lat','lng']
    and jsonb_typeof(map_point->'lat') = 'number'
    and jsonb_typeof(map_point->'lng') = 'number'
    and (map_point->>'lat')::numeric between -90 and 90
    and (map_point->>'lng')::numeric between -180 and 180
    and map_point - 'lat' - 'lng' = '{}'::jsonb
  ));

-- Extend the two existing authorized bundle functions in place, retaining their
-- ownership, invitation, revision, and transactional checks.
do $migration$
declare
  body text;
  read_field text := '''place'',e.location,';
  remove_events text := 'delete from public.event where "tripID"=p_trip_id;';
  event_columns text := 'est_cost,notes,image_url)';
  event_values text := 'e->>''notes'',e->>''image'');';
begin
  body := pg_get_functiondef('private.trip_bundle(uuid)'::regprocedure);
  if strpos(body,read_field)=0 then raise exception 'Unexpected trip reader'; end if;
  execute replace(body,read_field,read_field || '''point'',e.map_point,');

  body := pg_get_functiondef('private.save_trip_bundle(uuid,integer,uuid,jsonb)'::regprocedure);
  if strpos(body,remove_events)=0 or strpos(body,event_columns)=0 or strpos(body,event_values)=0
    or strpos(body,'declare ')=0 then raise exception 'Unexpected trip writer'; end if;
  body := replace(body,'declare ','declare old_points jsonb; ');
  -- Clients from before this migration omit point. Preserve it only when the event
  -- ID and address still agree. New clients send explicit null to clear a pin.
  body := replace(body,remove_events,$snapshot$
    select jsonb_object_agg("eventID"::text,jsonb_build_object('place',location,'point',map_point))
      into old_points from public.event where "tripID"=p_trip_id and map_point is not null;
  $snapshot$ || remove_events);
  body := replace(body,event_columns,'est_cost,notes,image_url,map_point)');
  body := replace(body,event_values,$values$e->>'notes',e->>'image',
    case when e ? 'point' then nullif(e->'point','null'::jsonb)
      when old_points->(e->>'id')->>'place' = btrim(e->>'place')
      then old_points->(e->>'id')->'point' end);$values$);
  execute body;
end $migration$;

commit;
