-- Lets an account sort a forwarded booking into one of its trips. The booking row only remembers
-- which trip it was sorted into. The event itself is added through the normal trip save, so sharing
-- and edit permissions work exactly as they do for any other event.
begin;

alter table public.forwarded_booking
  add column trip_id uuid references public.trip("tripID") on delete set null,
  add column added_at timestamptz;
create index forwarded_booking_trip_idx on public.forwarded_booking (trip_id) where trip_id is not null;

-- Browsers may change only these two columns, and only on their own rows.
grant update (trip_id, added_at) on public.forwarded_booking to authenticated;
create policy "Sort own forwarded bookings" on public.forwarded_booking for update to authenticated
using (owner_id = (select auth.uid()))
with check (
  owner_id = (select auth.uid())
  -- This subquery runs with the caller's access, so it only matches trips the account can already see.
  and (trip_id is null or exists (select 1 from public.trip t where t."tripID" = trip_id))
);

commit;
