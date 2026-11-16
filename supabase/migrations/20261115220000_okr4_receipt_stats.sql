begin;

create function private.okr4_receipt_stats()
returns table (eligible_travelers bigint, repeat_travelers bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  return query
  with eligible_trips as (
    select t."tripID" as trip_id, t.owner_id, t.start_date, t.end_date
    from public.trip t
    where t.owner_id is not null
      and t.start_date <= (now() at time zone 'UTC')::date
  ),
  eligible_members as (
    select t.trip_id, t.owner_id as account_id from eligible_trips t
    union
    select m."tripID", m."userID"
    from public.trip_member m
    join eligible_trips t on t.trip_id = m."tripID"
    where m.shared_account and m.status = 'accepted' and m."userID" is not null
  ),
  repeat_members as (
    select e.trip_id, m."userID" as account_id
    from public.trip_expense e
    join eligible_trips t on t.trip_id = e.trip_id
    join public.trip_member m on m."tripID" = e.trip_id and m.planner_id = e.payer_id
    join eligible_members eligible on eligible.trip_id = e.trip_id and eligible.account_id = m."userID"
    where e.source in ('Receipt photo', 'Receipt scan', 'Receipt scan (photo unavailable)')
      and e.expense_date between t.start_date and least(t.end_date, (now() at time zone 'UTC')::date)
    group by e.trip_id, m."userID"
    having count(*) >= 2
  )
  select (select count(distinct account_id) from eligible_members),
         (select count(distinct account_id) from repeat_members);
end;
$$;

create function public.okr4_receipt_stats()
returns table (eligible_travelers bigint, repeat_travelers bigint)
language sql stable security invoker set search_path = ''
as $$ select * from private.okr4_receipt_stats() $$;

revoke all on function private.okr4_receipt_stats(), public.okr4_receipt_stats() from public, anon, authenticated;
grant execute on function private.okr4_receipt_stats(), public.okr4_receipt_stats() to authenticated;

commit;
