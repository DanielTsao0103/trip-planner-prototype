begin;
-- The location column is text. Keep required-field and bundle-size checks.
do $migration$
declare
  body text := pg_get_functiondef('private.save_trip_bundle(uuid,integer,uuid,jsonb)'::regprocedure);
  old_check text := 'length(btrim(e->>''place'')) not between 1 and 220';
begin
  if strpos(body, old_check) = 0 then raise exception 'Unexpected event location validation'; end if;
  execute replace(body, old_check, 'length(btrim(e->>''place'')) = 0');
end $migration$;
commit;
