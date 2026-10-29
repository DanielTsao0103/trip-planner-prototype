-- One owning account; collaborators are separate memberships with role references.
begin;
-- Fail safely if this migration would change any existing account's access.
do $$ begin
  if exists (select 1 from public.trip t join auth.users a on a.id = t.created_by) then
    raise exception 'Existing account trips require an explicit ownership backfill before this migration';
  end if;
end $$;
alter table public.trip add column owner_id uuid references auth.users(id);
create index trip_owner_id_id_idx on public.trip (owner_id, "tripID");
create unique index role_name_unique on public.role (role_name);
insert into public.role ("roleID", role_name, can_edit, can_invite)
values ('ee20a521-1f5d-498e-a6d9-981633d0017f', 'Owner', true, true);
create unique index trip_member_trip_user_unique on public.trip_member ("tripID", "userID");
create unique index trip_member_one_owner on public.trip_member ("tripID")
where "roleID" = 'ee20a521-1f5d-498e-a6d9-981633d0017f';

-- Only this private trigger can create the owner's membership, in the same
-- transaction as the trip. It binds both owner and creator to the JWT identity.
create function private.create_trip_owner_membership()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or new.owner_id is distinct from auth.uid() or new.created_by is distinct from auth.uid() then
    raise exception 'Trip owner must be the signed-in account' using errcode = '42501';
  end if;
  insert into public.trip_member ("tripID", "userID", "roleID", status)
  values (new."tripID", new.owner_id, 'ee20a521-1f5d-498e-a6d9-981633d0017f', 'accepted');
  return new;
end $$;
revoke all on function private.create_trip_owner_membership() from public, anon, authenticated;
create trigger create_trip_owner_membership after insert on public.trip
for each row execute function private.create_trip_owner_membership();

grant insert (owner_id) on public.trip to authenticated;
alter policy "Read own trips" on public.trip using (owner_id = (select auth.uid()));
alter policy "Create own trips" on public.trip with check (owner_id = (select auth.uid()) and created_by = (select auth.uid()));
alter policy "Update own trips" on public.trip using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
alter policy "Delete own trips" on public.trip using (owner_id = (select auth.uid()));

-- Add read access only; invitation and role mutation will be a later slice.
grant select on public.trip_member to authenticated;
create policy "Read own memberships" on public.trip_member for select to authenticated
using ("userID" = (select auth.uid()) or exists (
  select 1 from public.trip t where t."tripID" = trip_member."tripID" and t.owner_id = (select auth.uid())
));
grant select on public.role to authenticated;
create policy "Read role definitions" on public.role for select to authenticated using (true);
comment on column public.trip.owner_id is 'Current owning Auth account. Legacy team rows remain NULL; future collaborators belong in trip_member.';
comment on column public.trip.created_by is 'Original creator profile. Ownership is separate in owner_id.';
commit;
