begin;

grant select, insert, delete on public.periode_kerja to authenticated;

drop policy if exists "Finance can insert work periods" on public.periode_kerja;
create policy "Finance can insert work periods"
  on public.periode_kerja for insert to authenticated
  with check (public.is_finance_manager());

drop policy if exists "Finance can delete work periods" on public.periode_kerja;
create policy "Finance can delete work periods"
  on public.periode_kerja for delete to authenticated
  using (public.is_finance_manager());

commit;
