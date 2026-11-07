begin;
-- Let an account change its own display name. One call keeps every copy of the name in step:
-- the public profile, the traveler rows on trips the account belongs to, and the Auth metadata
-- the browser reads on sign-in. Doing it in one database function avoids a half-updated name.
create or replace function public.set_account_name(p_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  label text := btrim(coalesce(p_name, ''));
begin
  if actor is null then
    raise exception 'Sign in to update your account' using errcode = '28000';
  end if;
  if label = '' or char_length(label) > 90 then
    raise exception 'Enter a name of 1 to 90 characters' using errcode = '22023';
  end if;
  update public."user" set name = label where "userID" = actor;
  if not found then
    raise exception 'Account profile not found' using errcode = 'P0002';
  end if;
  update public.trip_member set display_name = label where "userID" = actor and planner_id is not null;
  -- Same as the invited-traveler name sync: a renamed traveler must not replay an older saved write.
  update public.trip set last_write_hash = null, last_write_id = null
  where "tripID" in (select "tripID" from public.trip_member where "userID" = actor);
  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('name', label)
  where id = actor;
end $$;
revoke all on function public.set_account_name(text) from public, anon;
grant execute on function public.set_account_name(text) to authenticated;
commit;
