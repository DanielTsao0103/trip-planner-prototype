begin;

-- Share the provider's stable ID; Google coordinates are resolved for display.
alter table public.event add column google_place_id text
  check (length(google_place_id) between 1 and 512);

do $migration$
declare
  body text;
  field text := '''point'',e.map_point,';
  columns text := 'image_url,map_point)';
  end_values text := 'then old_points->(e->>''id'')->''point'' end);';
  old_filter text := 'and map_point is not null;';
  old_fields text := '''place'',location,''point'',map_point)';
begin
  body := pg_get_functiondef('private.trip_bundle(uuid)'::regprocedure);
  if strpos(body,field)=0 then raise exception 'Unexpected event reader'; end if;
  execute replace(body,field,field || '''googlePlaceId'',e.google_place_id,');

  body := pg_get_functiondef('private.save_trip_bundle(uuid,integer,uuid,jsonb)'::regprocedure);
  if strpos(body,columns)=0 or strpos(body,end_values)=0 or strpos(body,old_filter)=0
    or strpos(body,old_fields)=0 then raise exception 'Unexpected event writer'; end if;
  body := replace(body,old_filter,'and (map_point is not null or google_place_id is not null);');
  body := replace(body,old_fields,'''place'',location,''point'',map_point,''googlePlaceId'',google_place_id)');
  body := replace(body,columns,'image_url,map_point,google_place_id)');
  -- An edit from an older client must keep the reference only for the same address.
  body := replace(body,end_values,$v$then nullif(old_points->(e->>'id')->'point','null'::jsonb) end,
    case when e ? 'googlePlaceId' then e->>'googlePlaceId'
      when old_points->(e->>'id')->>'place'=btrim(e->>'place')
      then old_points->(e->>'id')->>'googlePlaceId' end);$v$);
  execute body;
end $migration$;
commit;
