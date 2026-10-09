begin;

alter table public.shift_swap_request
  add column if not exists tanggal_target date;

create or replace function public.approve_two_date_shift_swap(
  p_request_id bigint,
  p_manager_note text default ''
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  swap_row public.shift_swap_request%rowtype;
  requester_schedule_id integer;
  target_schedule_id integer;
  manager_id uuid := auth.uid();
begin
  if manager_id is null or not exists (
    select 1 from public.users where id = manager_id and role = 'manager'
  ) then
    raise exception 'Hanya manager yang dapat menyetujui tukar shift';
  end if;

  select * into swap_row
  from public.shift_swap_request
  where id = p_request_id
  for update;

  if not found or swap_row.status <> 'pending' then
    raise exception 'Pengajuan tidak ditemukan atau sudah diproses';
  end if;
  if swap_row.target_type <> 'crew' or swap_row.target_id is null or swap_row.tanggal_target is null then
    raise exception 'Pengajuan ini bukan pertukaran dua crew dengan dua tanggal';
  end if;
  if swap_row.tanggal = swap_row.tanggal_target then
    raise exception 'Tanggal shift harus berbeda';
  end if;

  select id into requester_schedule_id
  from public.schedule
  where user_id = swap_row.requester_id and tanggal = swap_row.tanggal
  for update;
  select id into target_schedule_id
  from public.schedule
  where user_id = swap_row.target_id and tanggal = swap_row.tanggal_target
  for update;

  if requester_schedule_id is null or target_schedule_id is null then
    raise exception 'Jadwal sudah berubah; salah satu crew tidak lagi memiliki shift yang dipilih';
  end if;
  if exists (select 1 from public.schedule where user_id = swap_row.target_id and tanggal = swap_row.tanggal)
     or exists (select 1 from public.schedule where user_id = swap_row.requester_id and tanggal = swap_row.tanggal_target) then
    raise exception 'Pertukaran tidak dapat dilakukan karena salah satu crew sudah memiliki jadwal pada tanggal tujuan';
  end if;
  if exists (
    select 1 from public.attendance
    where schedule_id in (requester_schedule_id, target_schedule_id)
  ) then
    raise exception 'Jadwal yang dipilih sudah memiliki data absensi dan tidak dapat ditukar';
  end if;

  update public.schedule set user_id = swap_row.target_id where id = requester_schedule_id;
  update public.schedule set user_id = swap_row.requester_id where id = target_schedule_id;

  update public.shift_swap_request
  set status = 'disetujui', approved_by = manager_id, catatan_manajer = coalesce(p_manager_note, '')
  where id = swap_row.id;
end;
$$;

revoke all on function public.approve_two_date_shift_swap(bigint, text) from public, anon;
grant execute on function public.approve_two_date_shift_swap(bigint, text) to authenticated;

commit;
