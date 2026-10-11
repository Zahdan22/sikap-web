begin;

-- Keep a saved-day marker even when every crew member has the day off.
create table if not exists public.schedule_day_status (
  tanggal date primary key,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);

-- Preserve dates already scheduled before this feature was introduced.
insert into public.schedule_day_status(tanggal, updated_at)
select tanggal, max(coalesce(updated_at, created_at)) from public.schedule group by tanggal
on conflict (tanggal) do nothing;

alter table public.schedule_day_status enable row level security;
revoke all on public.schedule_day_status from anon, authenticated;
grant select on public.schedule_day_status to authenticated;
drop policy if exists "Managers read saved schedule days" on public.schedule_day_status;
create policy "Managers read saved schedule days" on public.schedule_day_status
for select to authenticated using (
  exists (select 1 from public.users where id = auth.uid() and role = 'manager' and status_aktif)
);

create or replace function public.mark_schedule_day_saved(p_tanggal date)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_updated_at timestamptz := clock_timestamp();
begin
  if not exists (select 1 from public.users where id = auth.uid() and role = 'manager' and status_aktif) then
    raise exception 'Hanya manager penjadwalan aktif yang dapat menyimpan jadwal.';
  end if;
  if p_tanggal is null then raise exception 'Tanggal jadwal wajib diisi.'; end if;
  insert into public.schedule_day_status(tanggal, updated_at, updated_by)
  values (p_tanggal, v_updated_at, auth.uid())
  on conflict (tanggal) do update set updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  return v_updated_at;
end;
$$;
revoke all on function public.mark_schedule_day_saved(date) from public, anon;
grant execute on function public.mark_schedule_day_saved(date) to authenticated;
notify pgrst, 'reload schema';
commit;
