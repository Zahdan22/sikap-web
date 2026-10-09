begin;

-- Finance can view private attendance evidence in reports. This policy only
-- grants SELECT for the attendance-photos bucket; upload/delete permissions
-- remain unchanged.
drop policy if exists "Finance can view attendance photos" on storage.objects;
create policy "Finance can view attendance photos"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'attendance-photos'
    and public.is_finance_manager()
  );

commit;
