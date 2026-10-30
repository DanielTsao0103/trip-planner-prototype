begin;
-- Google sign-in creates auth.users rows through the same trigger as email signup.
-- Record the real sign-in provider instead of always 'email', and fall back to the
-- name Google supplies (full_name) when the signup form's name is missing.
-- Only the function body changes: the trigger, its owner, and its grants stay as they were.
create or replace function private.create_account_profile()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is not null and auth.uid() <> new.id then
    raise exception 'Account identity mismatch' using errcode='42501';
  end if;
  insert into public."user" ("userID",name,email,password,provider)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data->>'name'),''),
      nullif(btrim(new.raw_user_meta_data->>'full_name'),''),
      'Traveler'
    ),
    new.email,
    null,
    coalesce(nullif(btrim(new.raw_app_meta_data->>'provider'),''),'email')
  );
  return new;
end $$;
revoke all on function private.create_account_profile() from public,anon,authenticated;
commit;
