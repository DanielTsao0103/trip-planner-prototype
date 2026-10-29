begin;
-- Former travelers retain their role history but do not need active editing days.
-- This lets the owner shorten a trip after removing a Day Editor.
do $$
declare definition text;
begin
  select pg_get_functiondef('private.save_trip_bundle(uuid,integer,uuid,jsonb)'::regprocedure) into definition;
  if position('if m->>''role''=''Day Editor'' and jsonb_array_length' in definition)=0 then
    raise exception 'Unexpected save function; review the day validation before applying';
  end if;
  execute replace(definition,
    'if m->>''role''=''Day Editor'' and jsonb_array_length',
    'if m->>''status''<>''removed'' and m->>''role''=''Day Editor'' and jsonb_array_length');
end $$;
commit;
