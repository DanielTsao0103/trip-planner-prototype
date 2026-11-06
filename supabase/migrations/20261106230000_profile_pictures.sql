begin;
-- Profile pictures. An uploaded picture lives in the public `profile-pictures` bucket and its
-- object path is stored on the account's own profile row. When the path is null the app falls
-- back to the Google account photo (read from the Auth session in the browser), then to initials.
-- Only the path is stored, never a URL, so the client cannot be tricked into showing another host.

alter table public."user" add column if not exists profile_picture_path text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'user_profile_picture_path_format') then
    -- The path must be "<own userID>/<uuid>.<webp|jpg|png>", so one account can never point at
    -- another account's file.
    alter table public."user" add constraint user_profile_picture_path_format check (
      profile_picture_path is null
      or profile_picture_path ~ ('^' || "userID"::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg|png)$')
    );
  end if;
end $$;

-- Own-row read policy already exists; only the new column needs a column grant.
grant select (profile_picture_path) on public."user" to authenticated;

-- Writes go through one narrow function so the table keeps no direct update access.
create or replace function public.set_profile_picture(p_path text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null then
    raise exception 'Sign in to change your profile picture' using errcode = '28000';
  end if;
  update public."user" set profile_picture_path = p_path where "userID" = actor;
  if not found then
    raise exception 'Account profile not found' using errcode = 'P0002';
  end if;
end $$;
revoke all on function public.set_profile_picture(text) from public, anon;
grant execute on function public.set_profile_picture(text) to authenticated;

-- Public bucket so <img> tags need no signed URLs. The browser shrinks every upload to a small
-- square before sending it, so a 1 MB cap is generous.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-pictures', 'profile-pictures', true, 1048576, array['image/webp','image/jpeg','image/png'])
on conflict (id) do update set public = true, file_size_limit = 1048576,
  allowed_mime_types = array['image/webp','image/jpeg','image/png'];

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Users upload own profile picture') then
    create policy "Users upload own profile picture" on storage.objects for insert to authenticated
    with check (bucket_id = 'profile-pictures'
      and (storage.foldername(name))[1] = (select auth.uid())::text
      and array_length(storage.foldername(name), 1) = 1);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Users remove own profile picture') then
    create policy "Users remove own profile picture" on storage.objects for delete to authenticated
    using (bucket_id = 'profile-pictures' and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;
end $$;
commit;
