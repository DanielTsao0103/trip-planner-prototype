-- Unscheduled places participate in the existing revision-checked trip transaction.
-- The trip's existing RLS/column privileges remain authoritative; no new write API.
begin;
alter table public.trip add column saved_places jsonb not null default '[]'::jsonb
  check (jsonb_typeof(saved_places)='array' and jsonb_array_length(saved_places)<=200);

create function private.validate_saved_places(items jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare item jsonb; key text;
begin
 if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items)>200 then
   raise exception 'A trip can have up to 200 saved places';
 end if;
 if (select count(*) from jsonb_array_elements(items))<>(select count(distinct value->>'id') from jsonb_array_elements(items)) then
   raise exception 'Saved place IDs must be unique';
 end if;
 for item in select value from jsonb_array_elements(items) loop
   perform private.assert_trip_keys(item,array['id','name','place','notes','point','googlePlaceId'],'saved place');
   foreach key in array array['id','name','place','notes'] loop
     if jsonb_typeof(item->key) is distinct from 'string' then raise exception 'Invalid saved place %',key; end if;
   end loop;
   if length(item->>'id') not between 1 and 100 or length(btrim(item->>'name')) not between 1 and 100
     or length(btrim(item->>'place')) not between 1 and 2048 or length(item->>'notes')>2200 then
     raise exception 'Saved place text exceeds the allowed length';
   end if;
   if item ? 'googlePlaceId' and item->'googlePlaceId'<>'null'::jsonb and
     (jsonb_typeof(item->'googlePlaceId')<>'string' or length(item->>'googlePlaceId')>500) then raise exception 'Invalid saved place ID'; end if;
   if item ? 'point' and item->'point'<>'null'::jsonb then
     perform private.assert_trip_keys(item->'point',array['lat','lng'],'saved place point');
     if jsonb_typeof(item#>'{point,lat}') is distinct from 'number' or jsonb_typeof(item#>'{point,lng}') is distinct from 'number' then raise exception 'Invalid saved place coordinates'; end if;
     if (item#>>'{point,lat}')::numeric not between -90 and 90 or (item#>>'{point,lng}')::numeric not between -180 and 180 then raise exception 'Invalid saved place coordinates'; end if;
   end if;
 end loop;
end $$;
revoke all on function private.validate_saved_places(jsonb) from public,anon,authenticated;

do $migration$
declare body text; old text;
begin
 body:=pg_get_functiondef('private.validate_trip_contract(jsonb)'::regprocedure);
 old:='''todos'',''dismissed''],''trip'')';
 if strpos(body,old)=0 then raise exception 'Unexpected trip contract'; end if;
 body:=replace(body,old,'''todos'',''dismissed'',''savedPlaces''],''trip'')');
 old:='declare item jsonb; entry record;' || chr(10) || 'begin';
 if strpos(body,old)=0 then raise exception 'Unexpected contract entry'; end if;
 body:=replace(body,old,old || chr(10) || ' if p_data ? ''savedPlaces'' then perform private.validate_saved_places(p_data->''savedPlaces''); end if;');
 execute body;

 body:=pg_get_functiondef('private.trip_bundle(uuid)'::regprocedure);
 old:='''image'',t.image_url';
 if strpos(body,old)=0 then raise exception 'Unexpected bundle reader'; end if;
 body:=replace(body,old,'''savedPlaces'',t.saved_places,' || old);
 body:=replace(body,'result := to_jsonb(t);','result := to_jsonb(t) - ''saved_places'';');
 execute body;

 body:=pg_get_functiondef('private.persist_trip_bundle(uuid,integer,uuid,jsonb,uuid)'::regprocedure);
 old:='content_version=1,last_write_id=p_request_id';
 if strpos(body,old)=0 then raise exception 'Unexpected atomic writer'; end if;
 -- Preserve saved places for clients/recovery drafts that predate this field.
 -- The supplied field is already covered by the existing whole-payload retry hash.
 body:=replace(body,old,'saved_places=coalesce(p_data->''savedPlaces'',saved_places),' || old);
 execute body;

 body:=pg_get_functiondef('private.save_shared_trip_changes(uuid,integer,uuid,jsonb)'::regprocedure);
 old:='array[''events'',''todos'',''expenses'',''individual'',''prefs'',''dismissed'']';
 if strpos(body,old)=0 then raise exception 'Unexpected collaborator fields'; end if;
 body:=replace(body,old,'array[''events'',''todos'',''expenses'',''individual'',''prefs'',''dismissed'',''savedPlaces'']');
 old:='  -- The browser can never grant itself roles';
 if strpos(body,old)=0 then raise exception 'Unexpected collaborator guard'; end if;
 body:=replace(body,old,$guard$
  -- Omission by an older client preserves the collection; explicit changes need
  -- a whole-trip Editor grant, since an unscheduled place has no assigned day.
  if p_data ? 'savedPlaces' and granted_role<>'Editor' and
    p_data->'savedPlaces' is distinct from before_data->'savedPlaces' then
    raise exception 'Only the owner and editors can change saved places.' using errcode='42501';
  end if;
$guard$ || old);
 execute body;
end $migration$;
notify pgrst,'reload schema';
commit;
