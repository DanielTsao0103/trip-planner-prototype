-- One transaction owns the trip, ordered destination zones, and photo attribution.
-- Existing owner/shared permissions and revision checks remain authoritative.
begin;

create function private.assert_trip_keys(p_value jsonb,p_keys text[],p_label text)
returns void language plpgsql immutable set search_path='' as $$
begin
  if jsonb_typeof(p_value) is distinct from 'object' then
    raise exception 'Invalid % object',p_label;
  end if;
  if exists(select from jsonb_object_keys(p_value) k where not k=any(p_keys)) then
    raise exception 'Unsupported % field. Refresh the app before saving.',p_label;
  end if;
end $$;
revoke all on function private.assert_trip_keys(jsonb,text[],text) from public,anon,authenticated;

-- A future client field must acquire explicit database support, never disappear
-- behind a successful response. Required-field/value checks stay in the writer.
create function private.validate_trip_contract(p_data jsonb)
returns void language plpgsql set search_path='' as $$
declare item jsonb; entry record;
begin
  perform private.assert_trip_keys(p_data,array['id','title','destinations','destinationTimezones','start','end','zone','image','members','events','expenses','prefs','budget','budgetMode','individual','todos','dismissed'],'trip');
  for entry in select key,value from jsonb_each(p_data) where key in ('members','events','expenses','todos') loop
    if jsonb_typeof(entry.value) is distinct from 'array' then raise exception 'Invalid trip collection'; end if;
    for item in select value from jsonb_array_elements(entry.value) loop
      case entry.key
      when 'members' then
        perform private.assert_trip_keys(item,array['id','name','email','role','days','status','accountId','signupPending'],'traveler');
      when 'events' then
        perform private.assert_trip_keys(item,array['id','name','place','date','start','end','cost','attendees','image','notes','point','googlePlaceId'],'event');
        if item ? 'point' and item->'point'<>'null'::jsonb then
          perform private.assert_trip_keys(item->'point',array['lat','lng'],'map point');
        end if;
      when 'expenses' then
        perform private.assert_trip_keys(item,array['id','purpose','amount','category','payer','shares','date','source','settled'],'expense');
      when 'todos' then
        perform private.assert_trip_keys(item,array['id','text','date','done'],'reminder');
      end case;
    end loop;
  end loop;
  if p_data ? 'prefs' then
    if jsonb_typeof(p_data->'prefs') is distinct from 'object' then raise exception 'Invalid preferences'; end if;
    for item in select value from jsonb_each(p_data->'prefs') loop
      perform private.assert_trip_keys(item,array['diet','food','spending','dining','atmosphere','access','walk','interests','destinations','tickets','notes'],'preference');
    end loop;
  end if;
end $$;
revoke all on function private.validate_trip_contract(jsonb) from public,anon,authenticated;

-- Older writers can reorder/add destinations without knowing about the newer
-- relation. Match by destination identity, never attach an old zone by position.
create function private.trip_destination_timezones(p_trip uuid,p_destinations text[],p_zone text)
returns text[] language sql stable set search_path='' as $$
  select coalesce(array_agg(case when saved.destination is not null then saved.timezone
    when requested.ordinality=1 then p_zone else null end order by requested.ordinality),'{}'::text[])
  from unnest(p_destinations) with ordinality requested(destination,ordinality)
  left join lateral (
    select d.destination,d.timezone from public.trip_destination_timezone d
    where d.trip_id=p_trip and d.destination=requested.destination
    order by (d.destination_order=requested.ordinality-1) desc,d.destination_order limit 1
  ) saved on true
$$;
revoke all on function private.trip_destination_timezones(uuid,text[],text) from public,anon,authenticated;

-- Extend the current checked reader, retaining its owner/member authorization.
do $migration$
declare body text; fragment text;
begin
  body:=pg_get_functiondef('private.trip_bundle(uuid)'::regprocedure);
  fragment:='coalesce((select jsonb_agg(d.timezone order by d.destination_order) from public.trip_destination_timezone d where d.trip_id=p_trip_id),''[]''::jsonb)';
  if strpos(body,fragment)=0 then raise exception 'Unexpected trip timezone reader'; end if;
  body:=replace(body,fragment,'to_jsonb(private.trip_destination_timezones(p_trip_id,t.destinations,t.timezone))');
  fragment:='return result - ''last_write_hash'' - ''last_write_id'';';
  if strpos(body,fragment)=0 then raise exception 'Unexpected trip bundle return'; end if;
  body:=replace(body,fragment,$replacement$return (result - 'last_write_hash' - 'last_write_id') || jsonb_build_object('photoCredit',(
    select jsonb_build_object('source',c.source,'photographer_name',c.photographer_name,
      'photographer_profile_url',c.photographer_profile_url,'photo_url',c.photo_url)
    from public.trip_photo_credit c where c.trip_id=p_trip_id));$replacement$);
  execute body;

  body:=pg_get_functiondef('private.persist_trip_bundle(uuid,integer,uuid,jsonb,uuid)'::regprocedure);
  fragment:='if actor is null then raise exception ''Sign in to save trips'' using errcode=''42501''; end if;';
  if strpos(body,fragment)=0 then raise exception 'Unexpected trip writer authorization'; end if;
  execute replace(body,fragment,fragment || E'\n perform private.validate_trip_contract(p_data - ''_photoCredit'');');

  body:=pg_get_functiondef('private.save_shared_trip_changes(uuid,integer,uuid,jsonb)'::regprocedure);
  if strpos(body,fragment)=0 then raise exception 'Unexpected shared trip writer authorization'; end if;
  execute replace(body,fragment,fragment || E'\n perform private.validate_trip_contract(p_data);');
end $migration$;

create function private.save_account_trip(
  p_trip_id uuid,p_expected_revision integer,p_request_id uuid,p_data jsonb,p_photo_credit jsonb default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); prior public.trip; destinations text[]; zones text[];
  credit jsonb; canonical jsonb; result jsonb; i integer;
begin
  if actor is null then raise exception 'Sign in to save trips' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_trip_id::text,0));
  select * into prior from public.trip where "tripID"=p_trip_id for update;
  if found and prior.owner_id is distinct from actor then
    raise exception 'Trip access denied' using errcode='42501';
  end if;
  perform private.validate_trip_contract(p_data);
  if p_data ? 'id' and (p_data->>'id')::uuid is distinct from p_trip_id then
    raise exception 'Trip ID does not match this save';
  end if;
  if jsonb_typeof(p_data->'destinations') is distinct from 'array' then raise exception 'Invalid trip destinations'; end if;
  destinations:=array(select jsonb_array_elements_text(p_data->'destinations'));
  if coalesce(array_length(destinations,1),0) not between 1 and 20 then raise exception 'Invalid trip destinations'; end if;
  if p_data ? 'destinationTimezones' then
    if jsonb_typeof(p_data->'destinationTimezones') is distinct from 'array' then
      raise exception 'Invalid destination timezone list';
    end if;
    if exists(select from jsonb_array_elements(p_data->'destinationTimezones') z
      where jsonb_typeof(z) not in ('string','null')) then raise exception 'Invalid destination timezone'; end if;
    zones:=array(select jsonb_array_elements_text(p_data->'destinationTimezones'));
  end if;
  if coalesce(array_length(zones,1),0)=0 then
    zones:=private.trip_destination_timezones(p_trip_id,destinations,p_data->>'zone');
  end if;
  if array_length(zones,1)<>array_length(destinations,1) then
    raise exception 'Each trip destination needs a matching timezone entry';
  end if;
  for i in 1..array_length(zones,1) loop
    if zones[i] is not null and not exists(select from pg_catalog.pg_timezone_names z where z.name=zones[i]) then
      raise exception 'Invalid destination timezone';
    end if;
  end loop;

  -- Omitted credit keeps an unchanged photo's attribution. Changing the photo
  -- without supplied metadata clears obsolete attribution in the same commit.
  if p_photo_credit is null or p_photo_credit='null'::jsonb then
    if prior.image_url is not distinct from p_data->>'image' then
      select jsonb_build_object('source',c.source,'photographer_name',c.photographer_name,
        'photographer_profile_url',c.photographer_profile_url,'photo_url',c.photo_url)
        into credit from public.trip_photo_credit c where c.trip_id=p_trip_id;
    end if;
  else
    perform private.assert_trip_keys(p_photo_credit,array['source','photographer_name','photographer_profile_url','photo_url'],'photo credit');
    if p_photo_credit->>'source' not in ('upload','unsplash') or p_photo_credit->>'source' is null then
      raise exception 'Invalid photo credit source';
    end if;
    if p_photo_credit->>'source'='unsplash' and (
      coalesce(length(btrim(p_photo_credit->>'photographer_name')),0)=0 or
      coalesce(length(btrim(p_photo_credit->>'photographer_profile_url')),0)=0 or
      coalesce(length(btrim(p_photo_credit->>'photo_url')),0)=0) then raise exception 'Incomplete photo credit'; end if;
    if exists(select from jsonb_each(p_photo_credit) e where e.value<>'null'::jsonb
      and (jsonb_typeof(e.value)<>'string' or length(e.value#>>'{}')>2048)) then raise exception 'Invalid photo credit'; end if;
    credit:=jsonb_build_object('source',p_photo_credit->>'source','photographer_name',p_photo_credit->>'photographer_name',
      'photographer_profile_url',p_photo_credit->>'photographer_profile_url','photo_url',p_photo_credit->>'photo_url');
  end if;
  -- Every persisted component participates in the SAME retry hash. There are
  -- no mutable side parameters left outside the revision/idempotency check.
  canonical:=jsonb_set(p_data,'{destinationTimezones}',to_jsonb(zones),true)
    || jsonb_build_object('_photoCredit',credit);
  result:=private.persist_trip_bundle(p_trip_id,p_expected_revision,p_request_id,canonical,actor);
  delete from public.trip_destination_timezone where trip_id=p_trip_id;
  for i in 1..array_length(destinations,1) loop
    insert into public.trip_destination_timezone(trip_id,destination_order,destination,timezone)
      values(p_trip_id,(i-1)::smallint,destinations[i],zones[i]);
  end loop;
  if credit is null then
    delete from public.trip_photo_credit where trip_id=p_trip_id;
  else
    insert into public.trip_photo_credit(trip_id,owner_id,source,photographer_name,photographer_profile_url,photo_url)
      values(p_trip_id,actor,credit->>'source',credit->>'photographer_name',credit->>'photographer_profile_url',credit->>'photo_url')
      on conflict(trip_id) do update set owner_id=excluded.owner_id,source=excluded.source,
        photographer_name=excluded.photographer_name,photographer_profile_url=excluded.photographer_profile_url,photo_url=excluded.photo_url;
  end if;
  return private.trip_bundle(p_trip_id);
end $$;
revoke all on function private.save_account_trip(uuid,integer,uuid,jsonb,jsonb) from public,anon;
grant execute on function private.save_account_trip(uuid,integer,uuid,jsonb,jsonb) to authenticated;

create function public.save_account_trip(
  p_trip_id uuid,p_expected_revision integer,p_request_id uuid,p_data jsonb,p_photo_credit jsonb default null
) returns jsonb language sql security invoker set search_path='' as $$
  select private.save_account_trip(p_trip_id,p_expected_revision,p_request_id,p_data,p_photo_credit)
$$;
revoke all on function public.save_account_trip(uuid,integer,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.save_account_trip(uuid,integer,uuid,jsonb,jsonb) to authenticated;

-- Keep old bundle clients on the same canonical writer, including older clients
-- that have no destination timezone field at all.
create or replace function private.save_trip_bundle(p_trip_id uuid,p_expected_revision integer,p_request_id uuid,p_data jsonb)
returns jsonb language sql security definer set search_path='' as $$
  select private.save_account_trip(p_trip_id,p_expected_revision,p_request_id,p_data,null)
$$;
create or replace function public.save_trip_bundle_with_timezones(
  p_trip_id uuid,p_expected_revision integer,p_request_id uuid,p_data jsonb,p_destination_timezones text[]
) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Sign in to save trips' using errcode='42501'; end if;
  if p_data ? 'destinationTimezones' and p_data->'destinationTimezones'<>'[]'::jsonb
    and p_data->'destinationTimezones' is distinct from to_jsonb(p_destination_timezones) then
    raise exception 'Conflicting destination timezone values';
  end if;
  return private.save_account_trip(p_trip_id,p_expected_revision,p_request_id,
    jsonb_set(p_data,'{destinationTimezones}',coalesce(to_jsonb(p_destination_timezones),'[]'::jsonb),true),null);
end $$;

-- Older two-request clients must refresh instead of overwriting the attribution
-- of a newer image after its trip commit. Authenticated reads remain unchanged.
revoke insert,update,delete on public.trip_photo_credit from authenticated;
notify pgrst,'reload schema';
commit;
