-- SUPABASE ONLY: private storage bucket for career documents.
-- The local runner skips files ending in .supabase.sql (local files are stored on disk).
-- Objects are stored as <user_id>/<document_id>/<filename>; users can only touch their own folder.

insert into storage.buckets (id, name, public, file_size_limit)
values ('career-documents', 'career-documents', false, 15728640)
on conflict (id) do update set public = false;

create policy "career_documents_own_read" on storage.objects for select to authenticated
  using (bucket_id = 'career-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "career_documents_own_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'career-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "career_documents_own_update" on storage.objects for update to authenticated
  using (bucket_id = 'career-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "career_documents_own_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'career-documents' and (storage.foldername(name))[1] = auth.uid()::text);
