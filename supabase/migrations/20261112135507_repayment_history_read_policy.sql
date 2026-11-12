-- Membership is private; an authenticated reader cannot call the internal bundle helper.
-- A narrow RLS helper checks only the caller's current access, with a fixed search path.
begin;
create function private.can_read_repayment_history(p_trip uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and (
    exists(select from public.trip t where t."tripID"=p_trip and t.owner_id=auth.uid())
    or exists(select from public.trip_member m where m."tripID"=p_trip
      and m."userID"=auth.uid() and m.shared_account and m.status='accepted')
  )
$$;
revoke all on function private.can_read_repayment_history(uuid) from public,anon;
grant execute on function private.can_read_repayment_history(uuid) to authenticated;
drop policy "Read repayment history for accessible trips" on public.trip_repayment_history;
create policy "Read repayment history for accessible trips" on public.trip_repayment_history
  for select to authenticated using (private.can_read_repayment_history(trip_id));
notify pgrst,'reload schema';
commit;
