begin;
-- Supabase Storage must be able to see an object before it will delete it. Without this policy,
-- removing or replacing a profile picture cleared the database path but left the old file behind.
-- The bucket is public, so this does not change who can view pictures; it only lets each account
-- find (and therefore delete) files in its own folder.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Users see own profile picture files') then
    create policy "Users see own profile picture files" on storage.objects for select to authenticated
    using (bucket_id = 'profile-pictures' and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;
end $$;
commit;
