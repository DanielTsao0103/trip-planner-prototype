begin;
-- Trip companions can see each other's profile pictures. Nothing else on the profile row is shared.
-- "Companion" means: both accounts are the owner of, or an accepted shared traveler on, the same trip.
-- Pending invitations, removed travelers, and unrelated accounts never see a picture.

-- Google sign-ins have no uploaded file, so the browser records the Google photo link on the
-- account's own profile. Only Google's image hosts are accepted so this cannot point elsewhere.
alter table public."user" add column if not exists google_picture_url text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'user_google_picture_url_format') then
    alter table public."user" add constraint user_google_picture_url_format check (
      google_picture_url is null
      or (length(google_picture_url) <= 2048
          and google_picture_url ~ '^https://[a-z0-9-]+\.googleusercontent\.com/[^[:space:]]+$')
    );
  end if;
end $$;
grant select (google_picture_url) on public."user" to authenticated;

create or replace function public.set_google_picture(p_url text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null then
    raise exception 'Sign in to update your profile' using errcode = '28000';
  end if;
  update public."user" set google_picture_url = p_url where "userID" = actor;
end $$;
revoke all on function public.set_google_picture(text) from public, anon;
grant execute on function public.set_google_picture(text) to authenticated;

-- Pictures for every account that shares a trip with the caller (the caller's own row is included
-- when they share a trip with themselves, so the browser only uses it for other people).
create or replace function public.trip_companion_pictures()
returns table (account_id uuid, picture_path text, google_url text)
language sql stable security definer set search_path = '' as $$
  select distinct u."userID", u.profile_picture_path, u.google_picture_url
  from public.trip t
  join public.trip_member me on me."tripID" = t."tripID"
  join public.trip_member other on other."tripID" = t."tripID"
  join public."user" u on u."userID" = other."userID"
  where auth.uid() is not null
    and me."userID" = auth.uid()
    and me.status = 'accepted' and (me.shared_account or me."userID" = t.owner_id)
    and other.status = 'accepted' and (other.shared_account or other."userID" = t.owner_id)
    and other."userID" <> auth.uid()
    and (u.profile_picture_path is not null or u.google_picture_url is not null);
$$;
revoke all on function public.trip_companion_pictures() from public, anon;
grant execute on function public.trip_companion_pictures() to authenticated;
commit;
