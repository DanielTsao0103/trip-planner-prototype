begin;
-- Roll back only the unused planner persistence added in this session.
-- Abort if someone has since saved real planner content.
do $$ begin
  if exists (select 1 from public.planner_accounts)
     or exists (select 1 from public."user" where planner_owner is not null)
     or exists (select 1 from public.trip where planner_owner is not null)
     or exists (select 1 from public.event where to_jsonb(event)->>'planner_key' is not null)
     or exists (select 1 from public.trip_member where planner_data is not null)
  then raise exception 'Planner data exists: preserve it before rollback'; end if;
end $$;
drop function public.planner_save(jsonb,uuid,uuid);
drop function public.planner_load();
drop policy "Read own planner people" on public."user";
drop policy "Read own planner trips" on public.trip;
drop policy "Read own planner events" on public.event;
drop policy "Read own planner members" on public.trip_member;
drop policy "Read planner roles" on public.role;
drop table public.planner_accounts;
alter table public."user" drop column if exists planner_owner, drop column if exists planner_key, drop column if exists planner_data;
alter table public.trip drop column if exists planner_owner, drop column if exists planner_key, drop column if exists planner_data;
alter table public.event drop column if exists planner_key, drop column if exists planner_data;
alter table public.trip_member drop column if exists planner_data;
-- Exact unused role IDs inserted by the earlier QA transaction, not original roles.
delete from public.role r where (r."roleID",r.role_name) in (
 ('e661fb01-091b-4758-8090-9c509602953c'::uuid,'Owner'),
 ('b09b7a6f-d916-4da3-8f57-e4fa5f338f7f'::uuid,'Day Editor'))
 and not exists (select 1 from public.trip_member m where m."roleID"=r."roleID");
-- These are the two naming differences from Lucidchart Page 1. Values/FKs survive renaming.
alter table public.trip rename column "userID" to created_by;
alter table public.event rename column "userID" to created_by;

-- Supabase Auth owns password storage. The ERD's legacy password field stays unused.
comment on column public."user".password is 'Legacy ERD field; new accounts leave this NULL. Passwords are managed by Supabase Auth.';
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- The Auth service inserts users before a login token exists. Only this trigger
-- can write profiles; it is private, non-callable by clients, and binds NEW.id.
create function private.create_account_profile()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is not null and auth.uid() <> new.id then
    raise exception 'Account identity mismatch' using errcode='42501';
  end if;
  insert into public."user" ("userID",name,email,password,provider)
  values (new.id,coalesce(nullif(btrim(new.raw_user_meta_data->>'name'),''),'Traveler'),new.email,null,'email');
  return new;
end $$;
revoke all on function private.create_account_profile() from public,anon,authenticated;
create trigger trip_planner_account_created after insert on auth.users
for each row execute function private.create_account_profile();

-- Existing group records retain their UUIDs. Only new Auth profiles match auth.uid().
alter table public."user" enable row level security;
revoke all on public."user" from anon,authenticated;
grant select ("userID",name,email,provider) on public."user" to authenticated;
create policy "Read own account profile" on public."user" for select to authenticated
using ("userID"=(select auth.uid()));
-- Trip functionality remains locked; no travel-data policies or RPCs are exposed.
alter table public.trip enable row level security;
alter table public.event enable row level security;
alter table public.role enable row level security;
alter table public.trip_member enable row level security;
commit;
