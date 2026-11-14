begin;
-- OKR #2 (Help Trip Planners save and share trips with friends): the share of trips with more than one
-- account. A trip counts as shared when its owner plus at least one other signed-in account that accepted
-- an invite are on it. Pending invites and guest travelers without an account do not count.
-- Admin only, and it returns counts, never trip or account details.

create function private.okr2_sharing_stats() returns table (total_trips bigint, shared_trips bigint)
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  return query
  select
    count(*)::bigint,
    count(*) filter (where exists (
      select 1 from public.trip_member m
      where m."tripID" = t."tripID"
        and m.shared_account
        and m.status = 'accepted'
        and m."userID" is not null
        and m."userID" <> t.owner_id
    ))::bigint
  from public.trip t
  where t.owner_id is not null;
end
$$;

create function public.okr2_sharing_stats() returns table (total_trips bigint, shared_trips bigint)
language sql stable security invoker set search_path=''
as $$ select * from private.okr2_sharing_stats() $$;

revoke all on function private.okr2_sharing_stats(), public.okr2_sharing_stats() from public, anon, authenticated;
grant execute on function private.okr2_sharing_stats(), public.okr2_sharing_stats() to authenticated;
commit;
