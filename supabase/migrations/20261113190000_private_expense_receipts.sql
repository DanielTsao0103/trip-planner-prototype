insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expense-receipts', 'expense-receipts', false, 10485760, array['image/jpeg','image/png','image/webp']);

-- The payer uploads to their own account folder. The trip segment must identify
-- a trip they own or actively share. Receipt images are readable only by the uploader.
create policy "Payers attach private receipts" on storage.objects
for insert to authenticated with check (
  bucket_id = 'expense-receipts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and array_length(storage.foldername(name), 1) = 2
  and (
    exists (select 1 from public.trip t
      where t."tripID"::text = (storage.foldername(name))[2]
        and t.owner_id = (select auth.uid()))
    or exists (select 1 from public.trip_member m
      where m."tripID"::text = (storage.foldername(name))[2]
        and m."userID" = (select auth.uid())
        and m.shared_account and m.status = 'accepted')
  )
);

create policy "Payers read private receipts" on storage.objects
for select to authenticated using (
  bucket_id = 'expense-receipts' and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy "Payers remove private receipts" on storage.objects
for delete to authenticated using (
  bucket_id = 'expense-receipts' and (storage.foldername(name))[1] = (select auth.uid())::text
);
