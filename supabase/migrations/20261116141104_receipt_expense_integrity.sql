begin;

-- Coordinate details with the canonical expense at commit, including concurrent
-- writes. A deferred NO ACTION foreign key permits the aggregate trip writer's
-- delete/reinsert transaction without keeping receipts for deleted expenses.
lock table public.trip_expense, public.expense_receipt_details in access exclusive mode;

-- Existing cleanup must run before PostgreSQL's deferred RI constraint triggers.
-- Trigger names fire alphabetically; the uppercase A sorts before RI_Constraint.
alter trigger cleanup_deleted_expense_receipt on public.trip_expense
  rename to "A_cleanup_deleted_expense_receipt";

-- The prior concurrent insert/delete race could leave inaccessible orphans.
delete from public.expense_receipt_details d
where not exists (
  select 1 from public.trip_expense e where e.trip_id=d.trip_id and e.id=d.expense_id
);

alter table public.expense_receipt_details
  add constraint expense_receipt_details_expense_fk
  foreign key(trip_id,expense_id) references public.trip_expense(trip_id,id)
  on delete no action deferrable initially deferred;

commit;
