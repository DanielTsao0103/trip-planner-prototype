begin;
-- Admin access no longer requires a Google login. An account is an admin when the email on its Stir Crazy
-- account (email/password or Google) is on the admin list. Email confirmation is off in this prototype,
-- so a typed address is not proof of ownership: anyone who signs up with a listed address gets access.
-- Re-enable email confirmation before this is used for anything beyond the class prototype.

create or replace function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1
    from auth.users u
    join public.admin_email a on a.email = lower(btrim(u.email))
    where u.id = (select auth.uid())
  )
$$;
commit;
