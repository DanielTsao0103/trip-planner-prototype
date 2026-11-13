-- Older shipped clients validate every response key, so omission compatibility
-- must cover reads/acknowledgements as well as writes. The normal client-info
-- header advertises support; it does not grant any additional data access.
begin;
do $migration$
declare body text; marker text;
begin
 body:=pg_get_functiondef('private.trip_bundle(uuid)'::regprocedure);
 marker:='  return (result - ''last_write_hash'' - ''last_write_id'')';
 if strpos(body,marker)=0 then raise exception 'Unexpected trip bundle reader'; end if;
 body:=replace(body,marker,$compat$
  if coalesce(current_setting('request.headers',true),'{}')::jsonb->>'x-client-info'
       is distinct from 'stir-crazy/saved-places-v1' then
    result:=result #- '{content,savedPlaces}';
  end if;
$compat$ || marker);
 execute body;
end $migration$;
notify pgrst,'reload schema';
commit;
