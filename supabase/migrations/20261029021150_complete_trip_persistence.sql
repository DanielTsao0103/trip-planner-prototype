-- Extend existing account trips without replacing legacy team rows or their data.
begin;
alter table public.trip
  add column image_url text,
  add column budget_cents bigint check (budget_cents between 0 and 99999999),
  add column budget_mode text not null default 'group' check (budget_mode in ('group','individual')),
  add column content_version integer not null default 0,
  add column last_write_id uuid,
  add column last_write_hash text;
alter table public.trip_member
  add column planner_id uuid,
  add column display_name text,
  add column invite_email text;
-- Only matching account-owner memberships receive planner metadata. Legacy rows stay intact.
update public.trip_member m set planner_id=m."userID", display_name=u.name, invite_email=u.email
from public.trip t, public."user" u
where t."tripID"=m."tripID" and t.owner_id=m."userID" and u."userID"=m."userID";
create unique index trip_member_planner_unique on public.trip_member("tripID",planner_id);
create unique index trip_member_active_email on public.trip_member("tripID",lower(invite_email)) where planner_id is not null and status in ('pending','accepted');
create index if not exists trip_member_user_lookup on public.trip_member("userID");
create index if not exists trip_member_role_lookup on public.trip_member("roleID");
insert into public.role(role_name,can_edit,can_invite) values ('Day Editor',true,false)
on conflict (role_name) do nothing;
create table public.trip_member_day (
  trip_id uuid not null, participant_id uuid not null, editable_date date not null,
  primary key(trip_id,participant_id,editable_date),
  foreign key(trip_id,participant_id) references public.trip_member("tripID",planner_id) on delete cascade
);
alter table public.event add column image_url text;
create unique index event_trip_id_unique on public.event("tripID","eventID");
create table public.trip_event_attendee (
  trip_id uuid not null, event_id uuid not null, participant_id uuid not null,
  primary key(trip_id,event_id,participant_id),
  foreign key(trip_id,event_id) references public.event("tripID","eventID") on delete cascade,
  foreign key(trip_id,participant_id) references public.trip_member("tripID",planner_id) on delete cascade
);
create table public.trip_expense (
  trip_id uuid not null references public.trip("tripID") on delete cascade,
  id text not null check(length(id) between 1 and 100),
  purpose text not null check(length(btrim(purpose)) between 1 and 130),
  amount_cents bigint not null check(amount_cents between 1 and 9999999),
  category text not null check(category in ('Stay','Food','Transport','Activities','Other')),
  payer_id uuid not null, expense_date date not null, source text not null check(length(source)<=200),
  primary key(trip_id,id),
  foreign key(trip_id,payer_id) references public.trip_member("tripID",planner_id)
);
create table public.trip_expense_share (
  trip_id uuid not null, expense_id text not null, participant_id uuid not null,
  amount_cents bigint not null check(amount_cents between 0 and 9999999), settled boolean not null default false,
  primary key(trip_id,expense_id,participant_id),
  foreign key(trip_id,expense_id) references public.trip_expense(trip_id,id) on delete cascade,
  foreign key(trip_id,participant_id) references public.trip_member("tripID",planner_id)
);
create table public.trip_person_budget (
  trip_id uuid not null, participant_id uuid not null, amount_cents bigint not null check(amount_cents between 0 and 99999999),
  primary key(trip_id,participant_id),
  foreign key(trip_id,participant_id) references public.trip_member("tripID",planner_id) on delete cascade
);
create table public.trip_preference (
  trip_id uuid not null, participant_id uuid not null,
  diet text[] not null, food text not null, spending text not null, dining text not null, atmosphere text not null,
  access text[] not null, walk integer not null check(walk between 0 and 100000), interests text[] not null,
  destinations text not null check(length(destinations)<=1100), tickets text not null, notes text not null check(length(notes)<=2200),
  primary key(trip_id,participant_id),
  foreign key(trip_id,participant_id) references public.trip_member("tripID",planner_id) on delete cascade
);
create table public.trip_todo (
  trip_id uuid not null references public.trip("tripID") on delete cascade,
  id text not null check(length(id) between 1 and 100), reminder text not null check(length(btrim(reminder)) between 1 and 220),
  reminder_date date not null, done boolean not null default false, primary key(trip_id,id)
);
create table public.trip_dismissed_suggestion (
  trip_id uuid not null references public.trip("tripID") on delete cascade,
  suggestion_id text not null check(length(suggestion_id) between 1 and 100), primary key(trip_id,suggestion_id)
);
-- New data is readable only by the owning account. Writes go through the validated
-- transaction below, so callers cannot bypass split totals or relational checks.
do $$ declare tab text; begin
  foreach tab in array array['trip_member_day','trip_event_attendee','trip_expense','trip_expense_share','trip_person_budget','trip_preference','trip_todo','trip_dismissed_suggestion'] loop
    execute format('alter table public.%I enable row level security',tab);
    execute format('revoke all on public.%I from anon,authenticated',tab);
    execute format('grant select on public.%I to authenticated',tab);
    execute format('create policy "Read owned trip data" on public.%I for select to authenticated using (exists(select 1 from public.trip t where t."tripID"=trip_id and t.owner_id=(select auth.uid())))',tab);
  end loop;
end $$;
grant select on public.event to authenticated;
create policy "Read owned trip events" on public.event for select to authenticated
using(exists(select 1 from public.trip t where t."tripID"=event."tripID" and t.owner_id=(select auth.uid())));

create function private.trip_bundle(p_trip_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.trip; result jsonb;
begin
  select * into t from public.trip where "tripID"=p_trip_id and owner_id=auth.uid();
  if not found or auth.uid() is null then raise exception 'Trip access denied' using errcode='42501'; end if;
  result := to_jsonb(t);
  result := result || jsonb_build_object('content',jsonb_build_object(
    'image',t.image_url,'budget',t.budget_cents,'budgetMode',t.budget_mode,
    'members',coalesce((select jsonb_agg(jsonb_build_object('id',m.planner_id,'name',m.display_name,'email',m.invite_email,'role',r.role_name,'status',m.status,
      'days',coalesce((select jsonb_agg(d.editable_date order by d.editable_date) from public.trip_member_day d where d.trip_id=p_trip_id and d.participant_id=m.planner_id),'[]'::jsonb)) order by case when m."userID"=t.owner_id then 0 else 1 end,m.planner_id)
      from public.trip_member m join public.role r on r."roleID"=m."roleID" where m."tripID"=p_trip_id and m.planner_id is not null),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(jsonb_build_object('id',e."eventID",'name',e.title,'date',e.event_date,'start',to_char(e.start_time,'HH24:MI'),'end',to_char(e.end_time,'HH24:MI'),'cost',e.est_cost,'image',e.image_url,'notes',e.notes,'place',e.location,
      'attendees',coalesce((select jsonb_agg(a.participant_id order by a.participant_id) from public.trip_event_attendee a where a.trip_id=p_trip_id and a.event_id=e."eventID"),'[]'::jsonb)) order by e.event_date,e.start_time,e."eventID") from public.event e where e."tripID"=p_trip_id),'[]'::jsonb),
    'expenses',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'purpose',e.purpose,'amount',e.amount_cents,'category',e.category,'payer',e.payer_id,'date',e.expense_date,'source',e.source,
      'shares',coalesce((select jsonb_object_agg(s.participant_id,s.amount_cents) from public.trip_expense_share s where s.trip_id=p_trip_id and s.expense_id=e.id),'{}'::jsonb),
      'settled',coalesce((select jsonb_agg(s.participant_id order by s.participant_id) from public.trip_expense_share s where s.trip_id=p_trip_id and s.expense_id=e.id and s.settled),'[]'::jsonb)) order by e.expense_date,e.id) from public.trip_expense e where e.trip_id=p_trip_id),'[]'::jsonb),
    'prefs',coalesce((select jsonb_object_agg(p.participant_id,jsonb_build_object('diet',p.diet,'food',p.food,'spending',p.spending,'dining',p.dining,'atmosphere',p.atmosphere,'access',p.access,'walk',p.walk,'interests',p.interests,'destinations',p.destinations,'tickets',p.tickets,'notes',p.notes)) from public.trip_preference p where p.trip_id=p_trip_id),'{}'::jsonb),
    'individual',coalesce((select jsonb_object_agg(b.participant_id,b.amount_cents) from public.trip_person_budget b where b.trip_id=p_trip_id),'{}'::jsonb),
    'todos',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'text',d.reminder,'date',d.reminder_date,'done',d.done) order by d.reminder_date,d.id) from public.trip_todo d where d.trip_id=p_trip_id),'[]'::jsonb),
    'dismissed',coalesce((select jsonb_agg(d.suggestion_id order by d.suggestion_id) from public.trip_dismissed_suggestion d where d.trip_id=p_trip_id),'[]'::jsonb)
  ));
  return result - 'last_write_hash' - 'last_write_id';
end $$;

create function private.load_trip_bundles(p_offset integer default 0,p_limit integer default 500) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to load trips' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(private.trip_bundle(t."tripID") order by t."tripID") from
 (select "tripID" from public.trip where owner_id=auth.uid() order by "tripID" limit least(greatest(p_limit,1),500) offset greatest(p_offset,0))t),'[]'::jsonb);
end $$;

-- Reject missing/null fields before PostgreSQL's nullable legacy columns can accept them.
create function private.require_trip_fields(p_value jsonb,p_fields text[]) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if jsonb_typeof(p_value) is distinct from 'object' or exists(select 1 from unnest(p_fields) f where not (p_value?f) or p_value->f='null'::jsonb) then
   raise exception 'Trip data is missing required fields';
 end if;
end $$;
revoke all on function private.require_trip_fields(jsonb,text[]) from public,anon,authenticated;

create function private.save_trip_bundle(p_trip_id uuid,p_expected_revision integer,p_request_id uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); t public.trip; m jsonb; e jsonb; p jsonb; kv record; role_id uuid; mid uuid; start_day date; end_day date; total bigint; owner_count integer; content_hash text:=md5(p_data::text);
begin
 if actor is null then raise exception 'Sign in to save trips' using errcode='42501'; end if;
 if p_request_id is null or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>2000000 then raise exception 'Invalid or oversized trip'; end if;
 -- Serialize all writers for this trip, including simultaneous creation retries.
 perform pg_advisory_xact_lock(hashtextextended(p_trip_id::text,0));
 select * into t from public.trip where "tripID"=p_trip_id for update;
 if found then
   if t.owner_id is distinct from actor then raise exception 'Trip access denied' using errcode='42501'; end if;
   if t.last_write_hash=content_hash then return private.trip_bundle(p_trip_id); end if;
   if p_expected_revision is null or p_expected_revision<>t.revision then raise exception 'This trip changed in another tab. Reload the saved version before editing.' using errcode='40001'; end if;
 elsif p_expected_revision is not null then raise exception 'This trip was deleted. Your unsaved copy is still available.' using errcode='40001';
 end if;
 perform private.require_trip_fields(p_data,array['title','destinations','start','end','zone','image','budgetMode','members','events','expenses','todos','prefs','individual','dismissed']);
 if not p_data?'budget' or length(p_data->>'image')>2048 then raise exception 'Invalid trip image or budget'; end if;
 start_day:=(p_data->>'start')::date; end_day:=(p_data->>'end')::date;
 if jsonb_typeof(p_data->'members') is distinct from 'array' or jsonb_array_length(p_data->'members') not between 1 and 100
 or jsonb_typeof(p_data->'events') is distinct from 'array' or jsonb_array_length(p_data->'events')>1000
 or jsonb_typeof(p_data->'expenses') is distinct from 'array' or jsonb_array_length(p_data->'expenses')>2000
 or jsonb_typeof(p_data->'todos') is distinct from 'array' or jsonb_array_length(p_data->'todos')>2000
 or jsonb_typeof(p_data->'prefs') is distinct from 'object' or jsonb_typeof(p_data->'individual') is distinct from 'object'
 or jsonb_typeof(p_data->'dismissed') is distinct from 'array' or jsonb_array_length(p_data->'dismissed')>1000 then raise exception 'Invalid trip collections'; end if;
 select count(*) into owner_count from jsonb_array_elements(p_data->'members') x where x->>'role'='Owner' and x->>'id'=actor::text and x->>'status'='accepted';
 if owner_count<>1 or (select count(*) from jsonb_array_elements(p_data->'members')x where x->>'role'='Owner')<>1 then raise exception 'The trip must retain exactly one account owner'; end if;
 if exists(select 1 from public.trip_member where "tripID"=p_trip_id and "userID" is not null and "userID"<>actor) then raise exception 'This trip has linked collaborators and requires membership-aware editing'; end if;
 -- Completed repayments are immutable financial history, including their allocations.
 if exists(select 1 from public.trip_expense old where old.trip_id=p_trip_id and
   exists(select 1 from public.trip_expense_share sh where sh.trip_id=p_trip_id and sh.expense_id=old.id and sh.settled)
   and not exists(select 1 from jsonb_array_elements(p_data->'expenses') proposed where proposed->>'id'=old.id
     and proposed->>'purpose'=old.purpose and (proposed->>'amount')::bigint=old.amount_cents and proposed->>'category'=old.category
     and proposed->>'payer'=old.payer_id::text and (proposed->>'date')::date=old.expense_date
     and proposed->'shares'=(select jsonb_object_agg(sh.participant_id,sh.amount_cents) from public.trip_expense_share sh where sh.trip_id=p_trip_id and sh.expense_id=old.id)
     and not exists(select 1 from public.trip_expense_share sh where sh.trip_id=p_trip_id and sh.expense_id=old.id and sh.settled and not (proposed->'settled')?sh.participant_id::text)))
 then raise exception 'Completed repayments must remain in the financial history'; end if;
 -- Replacing the content is one transaction. FK checks prohibit cross-trip references;
 -- any validation error rolls back both the root and all children.
 if t."tripID" is null then
   insert into public.trip("tripID",created_by,owner_id,trip_name,destination,destinations,start_date,end_date,timezone)
   values(p_trip_id,actor,actor,p_data->>'title',p_data->'destinations'->>0,array(select jsonb_array_elements_text(p_data->'destinations')),start_day,end_day,p_data->>'zone');
 end if;
 delete from public.trip_expense where trip_id=p_trip_id;
 delete from public.event where "tripID"=p_trip_id;
 delete from public.trip_member where "tripID"=p_trip_id;
 delete from public.trip_todo where trip_id=p_trip_id;
 delete from public.trip_dismissed_suggestion where trip_id=p_trip_id;
 for m in select * from jsonb_array_elements(p_data->'members') loop
   perform private.require_trip_fields(m,array['id','name','email','role','status','days']);
   mid:=(m->>'id')::uuid;
   if length(btrim(m->>'name')) not between 1 and 90 or length(m->>'email')>280 or m->>'email' !~ '^[^[:space:]@,]+@[^[:space:]@,]+\.[^[:space:]@,]+$'
     or m->>'status' not in ('accepted','pending','removed') or m->>'role' not in ('Owner','Editor','Viewer','Day Editor') then raise exception 'Invalid traveler details'; end if;
   select "roleID" into strict role_id from public.role where role_name=m->>'role';
   insert into public.trip_member("tripID","userID","roleID",status,planner_id,display_name,invite_email)
   values(p_trip_id,case when mid=actor then actor else null end,role_id,m->>'status',mid,btrim(m->>'name'),lower(btrim(m->>'email')));
   if jsonb_typeof(m->'days') is distinct from 'array' then raise exception 'Invalid assigned days'; end if;
   for p in select * from jsonb_array_elements(m->'days') loop
     if (p#>>'{}')::date not between start_day and end_day then raise exception 'Assigned days must be inside the trip'; end if;
     insert into public.trip_member_day values(p_trip_id,mid,(p#>>'{}')::date);
   end loop;
   if m->>'role'='Day Editor' and jsonb_array_length(m->'days')=0 then raise exception 'Assign at least one editable day'; end if;
 end loop;
 for e in select * from jsonb_array_elements(p_data->'events') loop
   perform private.require_trip_fields(e,array['id','name','place','date','start','end','cost','notes','image','attendees']);
   if jsonb_typeof(e->'attendees') is distinct from 'array' then raise exception 'Invalid event attendees'; end if;
   if length(btrim(e->>'name')) not between 1 and 100 or length(btrim(e->>'place')) not between 1 and 220 or length(e->>'notes')>2200
   or (e->>'date')::date not between start_day and end_day or e->>'start' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or e->>'end' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
   or (e->>'end')::time<=(e->>'start')::time or (e->>'cost')::numeric not between 0 and 9999999 or (e->>'cost')::numeric<>trunc((e->>'cost')::numeric)
   or length(e->>'image')>2048 then raise exception 'Invalid event details, dates, or amount'; end if;
   if exists(select 1 from public.event v where v."tripID"=p_trip_id and v.event_date=(e->>'date')::date and v.start_time<(e->>'end')::time and v.end_time>(e->>'start')::time) then raise exception 'Events cannot overlap'; end if;
   insert into public.event("eventID",created_by,"tripID",title,location,event_date,start_time,end_time,est_cost,notes,image_url)
   values((e->>'id')::uuid,actor,p_trip_id,btrim(e->>'name'),btrim(e->>'place'),(e->>'date')::date,(e->>'start')::time,(e->>'end')::time,(e->>'cost')::integer,e->>'notes',e->>'image');
   for p in select * from jsonb_array_elements(e->'attendees') loop
     insert into public.trip_event_attendee values(p_trip_id,(e->>'id')::uuid,(p#>>'{}')::uuid);
   end loop;
 end loop;
 for e in select * from jsonb_array_elements(p_data->'expenses') loop
   perform private.require_trip_fields(e,array['id','purpose','amount','category','payer','date','source','shares','settled']);
   if jsonb_typeof(e->'shares') is distinct from 'object' or jsonb_typeof(e->'settled') is distinct from 'array' or not isfinite((e->>'date')::date) then raise exception 'Invalid expense details'; end if;
   if (e->>'amount')::numeric<>trunc((e->>'amount')::numeric) then raise exception 'Expense amounts must be whole cents'; end if;
   insert into public.trip_expense values(p_trip_id,e->>'id',e->>'purpose',(e->>'amount')::bigint,e->>'category',(e->>'payer')::uuid,(e->>'date')::date,e->>'source');
   total:=0;
   for kv in select * from jsonb_each_text(e->'shares') loop
     if kv.value::numeric<>trunc(kv.value::numeric) then raise exception 'Expense shares must be whole cents'; end if;
     total:=total+kv.value::bigint;
     insert into public.trip_expense_share values(p_trip_id,e->>'id',kv.key::uuid,kv.value::bigint,(e->'settled')?kv.key);
   end loop;
   if total<>(e->>'amount')::bigint then raise exception 'Expense shares must add up to the full amount'; end if;
   for p in select * from jsonb_array_elements(e->'settled') loop
     if not (e->'shares')?(p#>>'{}') or p#>>'{}'=e->>'payer' then raise exception 'Invalid repayment participant'; end if;
   end loop;
 end loop;
 for kv in select * from jsonb_each_text(p_data->'individual') loop
   if kv.value::numeric<>trunc(kv.value::numeric) then raise exception 'Budget amounts must be whole cents'; end if;
   insert into public.trip_person_budget values(p_trip_id,kv.key::uuid,kv.value::bigint);
 end loop;
 for kv in select * from jsonb_each(p_data->'prefs') loop
   p:=kv.value;
   perform private.require_trip_fields(p,array['diet','food','spending','dining','atmosphere','access','walk','interests','destinations','tickets','notes']);
   if jsonb_typeof(p->'diet') is distinct from 'array' or jsonb_typeof(p->'access') is distinct from 'array' or jsonb_typeof(p->'interests') is distinct from 'array' or (p->>'walk')::numeric<>trunc((p->>'walk')::numeric) then raise exception 'Invalid preferences'; end if;
   if length(p->>'food')>100 or length(p->>'spending')>100 or length(p->>'dining')>100 or length(p->>'atmosphere')>100 or length(p->>'tickets')>100
   or jsonb_array_length(p->'diet')>30 or jsonb_array_length(p->'access')>30 or jsonb_array_length(p->'interests')>30
   or exists(select 1 from jsonb_array_elements_text((p->'diet')||(p->'access')||(p->'interests'))x where length(x)>100) then raise exception 'Invalid preference details'; end if;
   insert into public.trip_preference values(p_trip_id,kv.key::uuid,array(select jsonb_array_elements_text(p->'diet')),p->>'food',p->>'spending',p->>'dining',p->>'atmosphere',array(select jsonb_array_elements_text(p->'access')),(p->>'walk')::integer,array(select jsonb_array_elements_text(p->'interests')),p->>'destinations',p->>'tickets',p->>'notes');
 end loop;
 for p in select * from jsonb_array_elements(p_data->'todos') loop
   perform private.require_trip_fields(p,array['id','text','date','done']);
   if jsonb_typeof(p->'done') is distinct from 'boolean' then raise exception 'Invalid reminder status'; end if;
   if (p->>'date')::date not between start_day and end_day then raise exception 'Reminders must be inside the trip dates'; end if;
   insert into public.trip_todo values(p_trip_id,p->>'id',p->>'text',(p->>'date')::date,(p->>'done')::boolean);
 end loop;
 for p in select * from jsonb_array_elements(p_data->'dismissed') loop
   insert into public.trip_dismissed_suggestion values(p_trip_id,p#>>'{}');
 end loop;
 if p_data->>'budget' is not null and (p_data->>'budget')::numeric<>trunc((p_data->>'budget')::numeric) then raise exception 'Budget must be whole cents'; end if;
 update public.trip set trip_name=p_data->>'title',destinations=array(select jsonb_array_elements_text(p_data->'destinations')),
 start_date=start_day,end_date=end_day,timezone=p_data->>'zone',image_url=p_data->>'image',budget_cents=(p_data->>'budget')::bigint,budget_mode=p_data->>'budgetMode',content_version=1,last_write_id=p_request_id,last_write_hash=content_hash where "tripID"=p_trip_id;
 return private.trip_bundle(p_trip_id);
end $$;

-- Only these specific private entry points are executable by authenticated users.
-- Every privileged entry point validates auth.uid() and trip ownership itself.
revoke all on function private.trip_bundle(uuid),private.load_trip_bundles(integer,integer),private.save_trip_bundle(uuid,integer,uuid,jsonb) from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.load_trip_bundles(integer,integer),private.save_trip_bundle(uuid,integer,uuid,jsonb) to authenticated;
create function public.load_trip_bundles(p_offset integer default 0,p_limit integer default 500) returns jsonb
language sql security invoker set search_path='' as $$ select private.load_trip_bundles(p_offset,p_limit) $$;
create function public.save_trip_bundle(p_trip_id uuid,p_expected_revision integer,p_request_id uuid,p_data jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.save_trip_bundle(p_trip_id,p_expected_revision,p_request_id,p_data) $$;
revoke all on function public.load_trip_bundles(integer,integer),public.save_trip_bundle(uuid,integer,uuid,jsonb) from public,anon;
grant execute on function public.load_trip_bundles(integer,integer),public.save_trip_bundle(uuid,integer,uuid,jsonb) to authenticated;
commit;
