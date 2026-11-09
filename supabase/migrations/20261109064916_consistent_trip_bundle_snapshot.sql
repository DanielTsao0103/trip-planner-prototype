-- The read-only bundle issues several SELECTs. STABLE keeps root revision,
-- child records, ordered zones and attribution on the caller's one MVCC snapshot.
-- Save wrappers remain VOLATILE and call this reader in a subsequent SQL
-- statement after their writes; live contract tests verify immediate readback.
begin;
alter function private.trip_bundle(uuid) stable;
commit;
