-- Public image URLs are used by the existing trip image_url field.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trip-photos', 'trip-photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Trip owners upload photos') then
    create policy "Trip owners upload photos" on storage.objects for insert to authenticated
    with check (bucket_id = 'trip-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Trip owners remove photos') then
    create policy "Trip owners remove photos" on storage.objects for delete to authenticated
    using (bucket_id = 'trip-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;
end $$;

create table if not exists public.trip_photo_credit (
  trip_id uuid primary key references public.trip("tripID") on delete cascade,
  owner_id uuid not null references auth.users(id),
  source text not null check (source in ('unsplash', 'upload')),
  photographer_name text,
  photographer_profile_url text,
  photo_url text,
  check (source = 'upload' or (photographer_name is not null and photographer_profile_url is not null and photo_url is not null))
);
alter table public.trip_photo_credit enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'trip_photo_credit' and policyname = 'Owners read photo credit') then
    create policy "Owners read photo credit" on public.trip_photo_credit for select to authenticated
    using (owner_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'trip_photo_credit' and policyname = 'Owners add photo credit') then
    create policy "Owners add photo credit" on public.trip_photo_credit for insert to authenticated
    with check (owner_id = (select auth.uid()) and exists (
      select 1 from public.trip t where t."tripID" = trip_id and t.owner_id = (select auth.uid())));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'trip_photo_credit' and policyname = 'Owners change photo credit') then
    create policy "Owners change photo credit" on public.trip_photo_credit for update to authenticated
    using (owner_id = (select auth.uid())) with check (
      owner_id = (select auth.uid()) and exists (
        select 1 from public.trip t where t."tripID" = trip_id and t.owner_id = (select auth.uid())));
  end if;
end $$;
grant select, insert, update on public.trip_photo_credit to authenticated;
