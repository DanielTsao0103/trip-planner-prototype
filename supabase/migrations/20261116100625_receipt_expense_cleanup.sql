begin;

-- The trip writer replaces expense rows inside a transaction. Defer cleanup so
-- a row reinserted by that writer keeps its private receipt details.
create function private.cleanup_deleted_expense_receipt() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.trip_expense e where e.trip_id=old.trip_id and e.id=old.id
  ) then
    delete from public.expense_receipt_details d
    where d.trip_id=old.trip_id and d.expense_id=old.id;
  end if;
  return null;
end;
$$;
revoke all on function private.cleanup_deleted_expense_receipt() from public,anon,authenticated;
create constraint trigger cleanup_deleted_expense_receipt
  after delete on public.trip_expense
  deferrable initially deferred
  for each row execute function private.cleanup_deleted_expense_receipt();

commit;
