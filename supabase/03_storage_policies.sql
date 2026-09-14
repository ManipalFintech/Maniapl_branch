-- Branch Attendance - Storage bucket policies.
-- BEFORE running this: create the bucket first in the Supabase Dashboard ->
-- Storage -> New bucket -> name it exactly "attendance-photos" -> Public: ON.
-- Then run this file in the SQL Editor.

-- Employees can upload their own selfies into a folder named after their own
-- user id: attendance-photos/<their-uid>/<filename>.jpg
create policy "employees upload own photos"
on storage.objects for insert
with check (
  bucket_id = 'attendance-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Anyone signed in can read (bucket is public anyway, this just governs the
-- authenticated API path; public bucket already allows anonymous reads of
-- the file URLs directly, which is what the dashboard/calendar uses).
create policy "read own or team photos"
on storage.objects for select
using (
  bucket_id = 'attendance-photos'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or my_role() = 'admin'
    or (my_role() = 'manager' and is_my_report(((storage.foldername(name))[1])::uuid))
  )
);
