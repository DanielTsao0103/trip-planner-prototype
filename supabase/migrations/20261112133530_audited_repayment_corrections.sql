-- Corrections append to a protected audit log; original expenses/ever-paid markers stay locked.
begin;
create table public.trip_repayment_history (
  sequence bigint generated always as identity primary key,
  trip_id uuid not null references public.trip("tripID") on delete cascade,
  id uuid not null,
  expense_id text not null,
  debtor_id uuid not null,
  status text not null check(status in ('paid','unpaid')),
  reason text not null check(length(reason)<=220 and (status='paid' or length(btrim(reason))>0)),
  actor_id uuid not null,
  actor_account_id uuid not null,
  recorded_at timestamptz not null default clock_timestamp(),
  unique(trip_id,id),
  -- The existing writer replaces child rows atomically. Deferred, non-cascading
  -- references preserve audit rows while those same expense/member IDs are reinserted.
  foreign key(trip_id,expense_id) references public.trip_expense(trip_id,id) deferrable initially deferred,
  foreign key(trip_id,debtor_id) references public.trip_member("tripID",planner_id) deferrable initially deferred,
  foreign key(trip_id,actor_id) references public.trip_member("tripID",planner_id) deferrable initially deferred
);
create index trip_repayment_history_expense on public.trip_repayment_history(trip_id,expense_id,sequence);
create index trip_repayment_history_debtor on public.trip_repayment_history(trip_id,debtor_id);
create index trip_repayment_history_actor on public.trip_repayment_history(trip_id,actor_id);
alter table public.trip_repayment_history enable row level security;
revoke all on public.trip_repayment_history from public,anon,authenticated;
grant select on public.trip_repayment_history to authenticated;
create policy "Read repayment history for accessible trips" on public.trip_repayment_history
for select to authenticated using (
  exists(select from public.trip t where t."tripID"=trip_id and t.owner_id=(select auth.uid()))
  or private.can_view_shared_trip(trip_id)
);

create function private.expense_repayment_history(p_trip uuid,p_expense text)
returns jsonb language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'debtor',h.debtor_id,'status',h.status,
   'reason',h.reason,'actor',h.actor_id,'recordedAt',h.recorded_at) order by h.sequence),'[]'::jsonb)
 from public.trip_repayment_history h where h.trip_id=p_trip and h.expense_id=p_expense
$$;
revoke all on function private.expense_repayment_history(uuid,text) from public,anon,authenticated;

-- Invoked only inside the existing revision-checked transaction and advisory lock.
create function private.append_repayment_history(p_trip uuid,p_data jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare e jsonb; proposed jsonb; prior jsonb; entry jsonb; i integer;
  actor_person uuid; debtor uuid; previous_status text; next_status text; item_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to update repayments' using errcode='42501'; end if;
  select m.planner_id into actor_person from public.trip_member m
    where m."tripID"=p_trip and m."userID"=auth.uid() and m.status='accepted';
  if actor_person is null and exists(select from public.trip t where t."tripID"=p_trip and t.owner_id=auth.uid())
    then actor_person:=auth.uid(); end if;
  for e in select value from jsonb_array_elements(p_data->'expenses') loop
    prior:=private.expense_repayment_history(p_trip,e->>'id');
    proposed:=coalesce(e->'repaymentHistory','[]'::jsonb);
    if jsonb_typeof(proposed) is distinct from 'array' or jsonb_array_length(proposed)>1000
      or jsonb_array_length(proposed)<jsonb_array_length(prior) then
      raise exception 'Repayment history must be preserved. Refresh the app before saving.';
    end if;
    for i in 0..jsonb_array_length(proposed)-1 loop
      entry:=proposed->i;
      perform private.assert_trip_keys(entry,array['id','debtor','status','reason','actor','recordedAt'],'repayment history');
      perform private.require_trip_fields(entry,array['id','debtor','status','reason','actor']);
      if i<jsonb_array_length(prior) then
        -- Server timestamps are authoritative. Pending queued edits may not yet
        -- have received them; client-supplied timestamps never overwrite history.
        if entry-'recordedAt' is distinct from (prior->i)-'recordedAt' then
          raise exception 'Earlier repayment records cannot be changed';
        end if;
        continue;
      end if;
      if actor_person is null or e->>'payer' is distinct from actor_person::text
        or entry->>'actor' is distinct from actor_person::text then
        raise exception 'Only the payer can update this repayment.' using errcode='42501';
      end if;
      if jsonb_typeof(entry->'status') is distinct from 'string' or entry->>'status' not in ('paid','unpaid')
        or jsonb_typeof(entry->'reason') is distinct from 'string' or length(entry->>'reason')>220
        or (entry->>'status'='unpaid' and length(btrim(entry->>'reason'))=0) then
        raise exception 'Enter a reason for this correction (up to 220 characters).';
      end if;
      debtor:=(entry->>'debtor')::uuid; item_id:=(entry->>'id')::uuid; next_status:=entry->>'status';
      if debtor=actor_person or not coalesce((e->'shares')?debtor::text,false)
        or not coalesce((e->'shares'->>debtor::text)::bigint>0,false)
        or not coalesce((e->'settled')?debtor::text,false) then raise exception 'Invalid repayment participant'; end if;
      select h.status into previous_status from public.trip_repayment_history h
        where h.trip_id=p_trip and h.expense_id=e->>'id' and h.debtor_id=debtor order by h.sequence desc limit 1;
      if previous_status is null then
        previous_status:=case when exists(select from public.trip_expense_share s
          where s.trip_id=p_trip and s.expense_id=e->>'id' and s.participant_id=debtor and s.settled)
          then 'paid' else 'unpaid' end;
      end if;
      if previous_status=next_status then raise exception 'This repayment changed. Reload its current status.' using errcode='PT409'; end if;
      insert into public.trip_repayment_history(trip_id,id,expense_id,debtor_id,status,reason,actor_id,actor_account_id)
        values(p_trip,item_id,e->>'id',debtor,next_status,btrim(entry->>'reason'),actor_person,auth.uid());
    end loop;
  end loop;
end $$;
revoke all on function private.append_repayment_history(uuid,jsonb) from public,anon,authenticated;

-- Extend the deployed functions without replacing unrelated permission/timezone/map logic.
do $migration$
declare body text; fragment text;
begin
  body:=pg_get_functiondef('private.validate_trip_contract(jsonb)'::regprocedure);
  fragment:='''source'',''settled''],''expense''';
  if strpos(body,fragment)=0 then raise exception 'Unexpected expense contract'; end if;
  execute replace(body,fragment,'''source'',''settled'',''repaymentHistory''],''expense''');

  body:=pg_get_functiondef('private.persist_trip_bundle(uuid,integer,uuid,jsonb,uuid)'::regprocedure);
  fragment:='and proposed->>''payer''=old.payer_id::text';
  if strpos(body,fragment)=0 then raise exception 'Unexpected locked-expense guard'; end if;
  body:=replace(body,fragment,fragment || ' and proposed->>''source''=old.source');
  fragment:='delete from public.trip_expense where trip_id=p_trip_id;';
  if strpos(body,fragment)=0 then raise exception 'Unexpected trip writer'; end if;
  execute replace(body,fragment,'perform private.append_repayment_history(p_trip_id,p_data);' || E'\n ' || fragment);

  body:=pg_get_functiondef('private.trip_bundle(uuid)'::regprocedure);
  fragment:='return (result - ''last_write_hash'' - ''last_write_id'')';
  if strpos(body,fragment)=0 then raise exception 'Unexpected trip reader'; end if;
  execute replace(body,fragment,$replacement$
  result:=jsonb_set(result,'{content,expenses}',coalesce((select jsonb_agg(
    case when jsonb_array_length(private.expense_repayment_history(p_trip_id,expense->>'id'))>0
      then expense || jsonb_build_object('repaymentHistory',private.expense_repayment_history(p_trip_id,expense->>'id'))
      else expense end order by position)
    from jsonb_array_elements(result->'content'->'expenses') with ordinality items(expense,position)),'[]'::jsonb));
  return (result - 'last_write_hash' - 'last_write_id')$replacement$);
end $migration$;
notify pgrst,'reload schema';
commit;
