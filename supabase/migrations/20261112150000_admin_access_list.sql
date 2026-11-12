begin;
-- Admin page access list. An account is an admin when it signed in with Google and the Google-verified
-- email is on this list. Email/password signups are not email-verified in this prototype, so a typed
-- address alone never grants access. Admins can read, add and remove list entries from the Admin page.

create table public.admin_email (
  email text primary key
    check (email = lower(btrim(email)) and char_length(email) <= 280
           and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  added_by uuid references auth.users(id) on delete set null default auth.uid(),
  added_at timestamptz not null default now()
);
alter table public.admin_email enable row level security;

-- True only for the signed-in account's own Google-verified email being on the list.
create function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1
    from auth.identities i
    join public.admin_email a on a.email = lower(btrim(i.identity_data->>'email'))
    where i.user_id = (select auth.uid()) and i.provider = 'google'
  )
$$;
create function public.is_admin() returns boolean language sql stable security invoker set search_path=''
as $$ select private.is_admin() $$;

create policy admin_email_select on public.admin_email
  for select to authenticated using (private.is_admin());
create policy admin_email_insert on public.admin_email
  for insert to authenticated with check (private.is_admin());
create policy admin_email_delete on public.admin_email
  for delete to authenticated using (private.is_admin());

-- The list can never become empty, even if two removals arrive at the same moment.
create function private.keep_one_admin() returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtext('public.admin_email.delete'));
  if not exists (select 1 from public.admin_email where email <> old.email) then
    raise exception 'The admin list must keep at least one email.' using errcode = 'PT422';
  end if;
  return old;
end $$;
create trigger admin_email_keep_one before delete on public.admin_email
  for each row execute function private.keep_one_admin();

revoke all on public.admin_email from public, anon, authenticated;
grant select, insert, delete on public.admin_email to authenticated;
revoke all on function private.is_admin(), private.keep_one_admin(), public.is_admin() from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_admin(), public.is_admin() to authenticated;

insert into public.admin_email (email, added_by) values
  ('ivysanford13@gmail.com', null),
  ('danieljuntsao@gmail.com', null),
  ('thefergusondrew@gmail.com', null),
  ('sethshireman@gmail.com', null);
commit;
