-- Run once in the Supabase SQL editor. Creates a public storage bucket for
-- question stimulus images (diagrams, graphs, micrographs pulled from past
-- exam papers) and allows the app's anon key to upload/read them.

insert into storage.buckets (id, name, public)
values ('question-images', 'question-images', true)
on conflict (id) do nothing;

create policy "public read question-images"
on storage.objects for select
using (bucket_id = 'question-images');

create policy "anon upload question-images"
on storage.objects for insert
with check (bucket_id = 'question-images');
