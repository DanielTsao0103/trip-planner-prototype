-- One canonical interval owns identity, attendees, cost and recovery/retry behavior.
begin;
alter table public.event add column end_date date;
alter table public.event add constraint event_end_date_interval_check check (
  end_date is null or (isfinite(end_date) and event_date is not null and start_time is not null and end_time is not null
    and end_date + end_time > event_date + start_time));

create function private.overnight_capable() returns boolean language sql stable set search_path='' as $$
 select coalesce(current_setting('request.headers',true),'{}')::jsonb->>'x-client-info'
   = 'stir-crazy/saved-places-v1 overnight-events-v1'
$$;
revoke all on function private.overnight_capable() from public,anon,authenticated;

-- Normalize BEFORE deleting/reinserting rows, comparison, and retry hashing.
-- Omitted dates preserve existing intervals; explicitly send the start date to shorten one.
create function private.normalize_event_dates(p_trip uuid,p_data jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare incoming jsonb; prior jsonb; effective date; result jsonb:='[]'; old_events jsonb;
begin
 if jsonb_typeof(p_data->'events') is distinct from 'array' then raise exception 'Invalid events'; end if;
 if exists(select from public.event where "tripID"=p_trip and end_date>event_date) and not coalesce(private.overnight_capable(),false) then
   old_events:=private.trip_bundle(p_trip)->'content'->'events';
   if exists(select from jsonb_array_elements(old_events) a
     left join lateral (select value b from jsonb_array_elements(p_data->'events') where value->>'id'=a->>'id') changed on true
     join public.event e on e."eventID"=(a->>'id')::uuid and e."tripID"=p_trip
     where e.end_date>e.event_date and (changed.b is null or (a-'endDate') is distinct from (changed.b-'endDate')))
   then raise exception 'Refresh the app before changing an overnight event.'; end if;
 end if;
 for incoming in select value from jsonb_array_elements(p_data->'events') loop
   if incoming ? 'endDate' then
     if jsonb_typeof(incoming->'endDate') is distinct from 'string' or incoming->>'endDate' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid event end date'; end if;
     effective:=(incoming->>'endDate')::date;
   else
     select coalesce(end_date,event_date) into effective from public.event where "tripID"=p_trip and "eventID"=(incoming->>'id')::uuid;
     -- Legacy same-day events follow their start when moved by old clients.
     if effective is null or not exists(select from public.event where "tripID"=p_trip and "eventID"=(incoming->>'id')::uuid and end_date>event_date) then
       effective:=(incoming->>'date')::date;
     end if;
   end if;
   result:=result || jsonb_build_array(incoming || jsonb_build_object('endDate',effective));
 end loop;
 return jsonb_set(p_data,'{events}',result);
end $$;
revoke all on function private.normalize_event_dates(uuid,jsonb) from public,anon,authenticated;

create function private.event_days_allowed(p_event jsonb,p_days date[]) returns boolean
language sql immutable set search_path='' as $$
 select case when (p_event->>'endDate')::date-(p_event->>'date')::date between 0 and 364 then not exists(select from generate_series(0,(p_event->>'endDate')::date-(p_event->>'date')::date) offset_day
   where ((p_event->>'date')::date + offset_day < (p_event->>'endDate')::date or p_event->>'end'<>'00:00')
   and not coalesce(((p_event->>'date')::date + offset_day)=any(p_days),false)) else false end
$$;
revoke all on function private.event_days_allowed(jsonb,date[]) from public,anon,authenticated;

do $migration$
declare body text; old text;
begin
 body:=pg_get_functiondef('private.validate_trip_contract(jsonb)'::regprocedure);
 old:=$old$'date','start','end','cost'$old$;
 if strpos(body,old)=0 then raise exception 'Unexpected overnight migration target private.validate_trip_contract(jsonb) step 1'; end if;
 body:=replace(body,old,$new$'date','endDate','start','end','cost'$new$);
 execute body;
 body:=pg_get_functiondef('private.trip_bundle(uuid)'::regprocedure);
 old:=$old$'date',e.event_date,'start'$old$;
 if strpos(body,old)=0 then raise exception 'Unexpected overnight migration target private.trip_bundle(uuid) step 1'; end if;
 body:=replace(body,old,$new$'date',e.event_date,'endDate',coalesce(e.end_date,e.event_date),'start'$new$);
 old:=$old$is distinct from 'stir-crazy/saved-places-v1'$old$;
 if strpos(body,old)=0 then raise exception 'Unexpected overnight migration target private.trip_bundle(uuid) step 2'; end if;
 body:=replace(body,old,$new$is distinct from 'stir-crazy/saved-places-v1' and not coalesce(private.overnight_capable(),false)$new$);
 old:=$old$  return (result - 'last_write_hash' - 'last_write_id')$old$;
 if strpos(body,old)=0 then raise exception 'Unexpected overnight migration target private.trip_bundle(uuid) step 3'; end if;
 body:=replace(body,old,$new$  if not coalesce(private.overnight_capable(),false) then
    result:=jsonb_set(result,'{content,events}',coalesce((select jsonb_agg(value-'endDate' order by position)
      from jsonb_array_elements(result->'content'->'events') with ordinality items(value,position)),'[]'::jsonb));
  end if;
  return (result - 'last_write_hash' - 'last_write_id')$new$);
 execute body;
 body:=pg_get_functiondef('private.persist_trip_bundle(uuid,integer,uuid,jsonb,uuid)'::regprocedure);
 old:=$old$ if found then
   if t.owner_id is distinct from actor then raise exception 'Trip access denied' using errcode='42501'; end if;$old$;
 if strpos(body,old)=0 then raise exception 'Unexpected overnight migration target private.persist_trip_bundle(uuid,integer,uuid,jsonb,uuid) step 1'; end if;
 body:=replace(body,old,$new$ if found and t.owner_id is distinct from actor then raise exception 'Trip access denied' using errcode='42501'; end if;
 p_data:=private.normalize_event_dates(p_trip_id,p_data);
 content_hash:=case when p_owner=auth.uid() then md5(p_data::text)
   else encode(sha256(convert_to(auth.uid()::text || p_data::text,'UTF8')),'hex') end;
 if t."tripID" is not null then$new$);
 old:=$old$or (e->>'end')::time<=(e->>'start')::time$old$;
 if strpos(body,old)=0 then raise exception 'Unexpected overnight migration target private.persist_trip_bundle(uuid,integer,uuid,jsonb,uuid) step 2'; end if;
 body:=replace(body,old,$new$or (e->>'endDate')::date not between start_day and end_day or (e->>'endDate')::date+(e->>'end')::time <= (e->>'date')::date+(e->>'start')::time$new$);
 old:=$old$v.event_date=(e->>'date')::date and v.start_time<(e->>'end')::time and v.end_time>(e->>'start')::time$old$;
 if strpos(body,old)=0 then raise exception 'Unexpected overnight migration target private.persist_trip_bundle(uuid,integer,uuid,jsonb,uuid) step 3'; end if;
 body:=replace(body,old,$new$v.event_date+v.start_time < (e->>'endDate')::date+(e->>'end')::time and coalesce(v.end_date,v.event_date)+v.end_time > (e->>'date')::date+(e->>'start')::time$new$);
 old:=$old$event_date,start_time,end_time,est_cost$old$;
 if strpos(body,old)=0 then raise exception 'Unexpected overnight migration target private.persist_trip_bundle(uuid,integer,uuid,jsonb,uuid) step 4'; end if;
 body:=replace(body,old,$new$event_date,end_date,start_time,end_time,est_cost$new$);
 old:=$old$(e->>'date')::date,(e->>'start')::time$old$;
 if strpos(body,old)=0 then raise exception 'Unexpected overnight migration target private.persist_trip_bundle(uuid,integer,uuid,jsonb,uuid) step 5'; end if;
 body:=replace(body,old,$new$(e->>'date')::date,(e->>'endDate')::date,(e->>'start')::time$new$);
 execute body;
 body:=pg_get_functiondef('private.save_shared_trip_changes(uuid,integer,uuid,jsonb)'::regprocedure);
 old:=$old$  if t.last_write_hash=$old$;
 if strpos(body,old)=0 then raise exception 'Unexpected overnight migration target private.save_shared_trip_changes(uuid,integer,uuid,jsonb) step 1'; end if;
 body:=replace(body,old,$new$  p_data:=private.normalize_event_dates(p_trip_id,p_data);
  if t.last_write_hash=$new$);
 old:=$old$    'end',t.end_date,'zone',t.timezone);$old$;
 if strpos(body,old)=0 then raise exception 'Unexpected overnight migration target private.save_shared_trip_changes(uuid,integer,uuid,jsonb) step 2'; end if;
 body:=replace(body,old,$new$    'end',t.end_date,'zone',t.timezone);
  before_data:=private.normalize_event_dates(p_trip_id,before_data);$new$);
 old:=$old$not coalesce((a->>'date')::date=any(granted_days),false)$old$;
 if strpos(body,old)=0 then raise exception 'Unexpected overnight migration target private.save_shared_trip_changes(uuid,integer,uuid,jsonb) step 3'; end if;
 body:=replace(body,old,$new$not private.event_days_allowed(a,granted_days)$new$);
 old:=$old$not coalesce((b->>'date')::date=any(granted_days),false)$old$;
 if strpos(body,old)=0 then raise exception 'Unexpected overnight migration target private.save_shared_trip_changes(uuid,integer,uuid,jsonb) step 4'; end if;
 body:=replace(body,old,$new$not private.event_days_allowed(b,granted_days)$new$);
 execute body;
 body:=pg_get_functiondef('private.check_trip_child_dates()'::regprocedure);
 old:=$old$event_date not between new.start_date and new.end_date$old$;
 if strpos(body,old)=0 then raise exception 'Unexpected overnight migration target private.check_trip_child_dates() step 1'; end if;
 body:=replace(body,old,$new$(event_date not between new.start_date and new.end_date or coalesce(end_date,event_date) not between new.start_date and new.end_date)$new$);
 execute body;
end $migration$;
notify pgrst,'reload schema';
commit;
