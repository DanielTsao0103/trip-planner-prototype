begin;
-- A whole-trip cascade may visit memberships before expenses. Check these links
-- at transaction commit, after all cascading deletes finish. Removing a traveler
-- alone still cannot erase or orphan the financial history.
alter table public.trip_expense alter constraint trip_expense_trip_id_payer_id_fkey deferrable initially deferred;
alter table public.trip_expense_share alter constraint trip_expense_share_trip_id_participant_id_fkey deferrable initially deferred;
commit;
