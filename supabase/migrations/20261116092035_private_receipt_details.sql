begin;

-- Receipt line items remain private to the payer and do not enter a shared trip bundle.
-- Do not FK to trip_expense: aggregate saves replace those rows within a transaction.
create table public.expense_receipt_details (
  account_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid not null references public.trip("tripID") on delete cascade,
  expense_id text not null check(length(expense_id) between 1 and 100),
  details jsonb not null check(jsonb_typeof(details) = 'object' and octet_length(details::text) <= 60000),
  updated_at timestamptz not null default now(),
  primary key(account_id, trip_id, expense_id)
);
create index expense_receipt_details_trip_idx on public.expense_receipt_details(trip_id);
alter table public.expense_receipt_details enable row level security;
revoke all on public.expense_receipt_details from public, anon, authenticated;
grant select, insert, update, delete on public.expense_receipt_details to authenticated;

create function private.owns_receipt_expense(p_trip uuid, p_expense text) returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.trip_expense e
    join public.trip_member m on m."tripID"=e.trip_id and m.planner_id=e.payer_id
    where e.trip_id=p_trip and e.id=p_expense and m."userID"=(select auth.uid())
      and m.status='accepted'
  );
$$;
revoke all on function private.owns_receipt_expense(uuid,text) from public,anon,authenticated;
grant execute on function private.owns_receipt_expense(uuid,text) to authenticated;

create policy "Payers read their receipt details" on public.expense_receipt_details
for select to authenticated using (
  account_id=(select auth.uid()) and private.owns_receipt_expense(trip_id,expense_id)
);
create policy "Payers attach their receipt details" on public.expense_receipt_details
for insert to authenticated with check (
  account_id=(select auth.uid()) and private.owns_receipt_expense(trip_id,expense_id)
);
create policy "Payers update their receipt details" on public.expense_receipt_details
for update to authenticated using (
  account_id=(select auth.uid()) and private.owns_receipt_expense(trip_id,expense_id)
) with check (
  account_id=(select auth.uid()) and private.owns_receipt_expense(trip_id,expense_id)
);
create policy "Payers remove their receipt details" on public.expense_receipt_details
for delete to authenticated using (account_id=(select auth.uid()));
commit;
