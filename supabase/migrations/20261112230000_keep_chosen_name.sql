begin;
-- A name chosen on the Account page must survive Google sign-ins. Google rewrites the
-- sign-in profile name every time someone logs in, which put the Google name back into the
-- app and then into saved trips. The chosen name is now kept under its own key, and a
-- trigger re-applies it whenever the sign-in profile is rewritten.
create function private.keep_chosen_name() returns trigger
language plpgsql security definer set search_path = '' as $$
declare chosen text := nullif(btrim(coalesce(
  new.raw_user_meta_data->>'display_name', old.raw_user_meta_data->>'display_name', '')), '');
begin
  if chosen is not null then
    new.raw_user_meta_data := coalesce(new.raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('display_name', chosen, 'name', chosen, 'full_name', chosen);
  end if;
  return new;
end $$;
revoke all on function private.keep_chosen_name() from public, anon, authenticated;
create trigger keep_chosen_name before update of raw_user_meta_data on auth.users
for each row execute function private.keep_chosen_name();

-- Renaming also bumps each trip's revision. Without that, another person's open copy of a
-- trip still looks current and its next save writes the old name back over the new one.
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
  update public.trip set revision = revision + 1, last_write_hash = null, last_write_id = null
  where "tripID" in (select "tripID" from public.trip_member where "userID" = actor);
  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object('name', label, 'full_name', label, 'display_name', label)
  where id = actor;
end $$;
revoke all on function public.set_account_name(text) from public, anon;
grant execute on function public.set_account_name(text) to authenticated;

-- Accounts that already renamed themselves (profile name differs from the sign-in name) keep
-- the name they chose. Their trip traveler rows are put back the same way a rename would.
-- The sign-in profile is updated last, because the other steps find these accounts by the
-- mismatch between their profile name and their sign-in name.
update public.trip_member m set display_name = btrim(u.name)
from public."user" u join auth.users a on a.id = u."userID"
where m."userID" = u."userID" and m.planner_id is not null and a.invited_at is null
  and btrim(u.name) <> '' and btrim(u.name) is distinct from btrim(coalesce(a.raw_user_meta_data->>'name', ''))
  and m.display_name is distinct from btrim(u.name);
update public.trip set revision = revision + 1, last_write_hash = null, last_write_id = null
where "tripID" in (
  select m."tripID" from public.trip_member m
  join public."user" u on u."userID" = m."userID" join auth.users a on a.id = u."userID"
  where a.invited_at is null and btrim(u.name) <> ''
    and btrim(u.name) is distinct from btrim(coalesce(a.raw_user_meta_data->>'name', '')));
update auth.users a
set raw_user_meta_data = coalesce(a.raw_user_meta_data, '{}'::jsonb)
  || jsonb_build_object('name', btrim(u.name), 'full_name', btrim(u.name), 'display_name', btrim(u.name))
from public."user" u
where u."userID" = a.id and a.invited_at is null and btrim(u.name) <> ''
  and btrim(u.name) is distinct from btrim(coalesce(a.raw_user_meta_data->>'name', ''));
commit;
