-- Complete the outlet boundary for the operational data that is managed by
-- Admin 1 and Admin 2. Existing records remain Tjap Djajakarta records.

-- Scheduling masters are independent data roots, so they must carry an outlet
-- themselves. Time options and preset items inherit through their parent.
alter table public.jobdesk add column if not exists outlet_id uuid references public.outlets(id);
update public.jobdesk set outlet_id = (select id from public.outlets where nama = 'Tjap Djajakarta') where outlet_id is null;
alter table public.jobdesk alter column outlet_id set not null;
alter table public.jobdesk alter column outlet_id set default public.current_outlet_id();
create index if not exists jobdesk_outlet_id_idx on public.jobdesk (outlet_id);

alter table public.jam_kerja_preset add column if not exists outlet_id uuid references public.outlets(id);
update public.jam_kerja_preset set outlet_id = (select id from public.outlets where nama = 'Tjap Djajakarta') where outlet_id is null;
alter table public.jam_kerja_preset alter column outlet_id set not null;
alter table public.jam_kerja_preset alter column outlet_id set default public.current_outlet_id();
create index if not exists jam_kerja_preset_outlet_id_idx on public.jam_kerja_preset (outlet_id);

alter table public.jobdesk_preset add column if not exists outlet_id uuid references public.outlets(id);
update public.jobdesk_preset set outlet_id = (select id from public.outlets where nama = 'Tjap Djajakarta') where outlet_id is null;
alter table public.jobdesk_preset alter column outlet_id set not null;
alter table public.jobdesk_preset alter column outlet_id set default public.current_outlet_id();
create index if not exists jobdesk_preset_outlet_id_idx on public.jobdesk_preset (outlet_id);

-- These roots are created or reviewed independently from schedules, so make
-- their outlet explicit too. It also makes manager screens safe once another
-- outlet is added.
alter table public.overtime_requests add column if not exists outlet_id uuid references public.outlets(id);
update public.overtime_requests r set outlet_id = u.outlet_id from public.users u where u.id = r.user_id and r.outlet_id is null;
alter table public.overtime_requests alter column outlet_id set not null;
alter table public.overtime_requests alter column outlet_id set default public.current_outlet_id();
create index if not exists overtime_requests_outlet_id_idx on public.overtime_requests (outlet_id, tanggal desc);

alter table public.shift_swap_request add column if not exists outlet_id uuid references public.outlets(id);
update public.shift_swap_request r set outlet_id = u.outlet_id from public.users u where u.id = r.requester_id and r.outlet_id is null;
alter table public.shift_swap_request alter column outlet_id set not null;
alter table public.shift_swap_request alter column outlet_id set default public.current_outlet_id();
create index if not exists shift_swap_request_outlet_id_idx on public.shift_swap_request (outlet_id, status, tanggal);

alter table public.leave_request add column if not exists outlet_id uuid references public.outlets(id);
update public.leave_request r set outlet_id = u.outlet_id from public.users u where u.id = r.user_id and r.outlet_id is null;
alter table public.leave_request alter column outlet_id set not null;
alter table public.leave_request alter column outlet_id set default public.current_outlet_id();
create index if not exists leave_request_outlet_id_idx on public.leave_request (outlet_id, tanggal_mulai, tanggal_selesai);

alter table public.crew_violations add column if not exists outlet_id uuid references public.outlets(id);
update public.crew_violations r set outlet_id = u.outlet_id from public.users u where u.id = r.user_id and r.outlet_id is null;
alter table public.crew_violations alter column outlet_id set not null;
alter table public.crew_violations alter column outlet_id set default public.current_outlet_id();
create index if not exists crew_violations_outlet_date_idx on public.crew_violations (outlet_id, tanggal, id);

alter table public.meal_allowance_claims add column if not exists outlet_id uuid references public.outlets(id);
update public.meal_allowance_claims r set outlet_id = u.outlet_id from public.users u where u.id = r.user_id and r.outlet_id is null;
alter table public.meal_allowance_claims alter column outlet_id set not null;
alter table public.meal_allowance_claims alter column outlet_id set default public.current_outlet_id();
create index if not exists meal_allowance_claims_outlet_date_idx on public.meal_allowance_claims (outlet_id, meal_date, user_id);

-- A date may be marked as saved independently by each outlet.
alter table public.schedule_day_status add column if not exists outlet_id uuid references public.outlets(id);
update public.schedule_day_status set outlet_id = (select id from public.outlets where nama = 'Tjap Djajakarta') where outlet_id is null;
alter table public.schedule_day_status alter column outlet_id set not null;
alter table public.schedule_day_status alter column outlet_id set default public.current_outlet_id();
alter table public.schedule_day_status drop constraint if exists schedule_day_status_pkey;
alter table public.schedule_day_status add constraint schedule_day_status_pkey primary key (outlet_id, tanggal);

-- A future outlet may use the same tier names but never its own manager to
-- read or write Tjap's operational data. Replace broad legacy RLS policies.
do $$
declare item record;
begin
  for item in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any (array[
        'jobdesk', 'jobdesk_preset', 'jobdesk_preset_item', 'jam_kerja_preset',
        'jam_kerja_opsi', 'schedule_day_status', 'overtime_requests',
        'shift_swap_request', 'leave_request', 'crew_violations',
        'meal_allowance_claims', 'attendance', 'attendance_corrections'
      ])
  loop
    execute format('drop policy if exists %I on %I.%I', item.policyname, item.schemaname, item.tablename);
  end loop;
end $$;

alter table public.jobdesk enable row level security;
alter table public.jobdesk_preset enable row level security;
alter table public.jobdesk_preset_item enable row level security;
alter table public.jam_kerja_preset enable row level security;
alter table public.jam_kerja_opsi enable row level security;
alter table public.schedule_day_status enable row level security;
alter table public.overtime_requests enable row level security;
alter table public.shift_swap_request enable row level security;
alter table public.leave_request enable row level security;
alter table public.crew_violations enable row level security;
alter table public.meal_allowance_claims enable row level security;

create policy jobdesk_select_own_outlet on public.jobdesk for select to authenticated
  using (outlet_id = public.current_outlet_id());
create policy jobdesk_manage_manager_own_outlet on public.jobdesk for all to authenticated
  using (outlet_id = public.current_outlet_id() and public.current_app_role() = 'manager')
  with check (outlet_id = public.current_outlet_id() and public.current_app_role() = 'manager');

create policy jam_preset_select_own_outlet on public.jam_kerja_preset for select to authenticated
  using (outlet_id = public.current_outlet_id());
create policy jam_preset_manage_manager_own_outlet on public.jam_kerja_preset for all to authenticated
  using (outlet_id = public.current_outlet_id() and public.current_app_role() = 'manager')
  with check (outlet_id = public.current_outlet_id() and public.current_app_role() = 'manager');
create policy jam_option_select_own_outlet on public.jam_kerja_opsi for select to authenticated
  using (exists (select 1 from public.jam_kerja_preset p where p.id = preset_id and p.outlet_id = public.current_outlet_id()));
create policy jam_option_manage_manager_own_outlet on public.jam_kerja_opsi for all to authenticated
  using (public.current_app_role() = 'manager' and exists (select 1 from public.jam_kerja_preset p where p.id = preset_id and p.outlet_id = public.current_outlet_id()))
  with check (public.current_app_role() = 'manager' and exists (select 1 from public.jam_kerja_preset p where p.id = preset_id and p.outlet_id = public.current_outlet_id()));

create policy jobdesk_preset_select_own_outlet on public.jobdesk_preset for select to authenticated
  using (outlet_id = public.current_outlet_id() and public.current_app_role() = 'manager');
create policy jobdesk_preset_manage_manager_own_outlet on public.jobdesk_preset for all to authenticated
  using (outlet_id = public.current_outlet_id() and public.current_app_role() = 'manager')
  with check (outlet_id = public.current_outlet_id() and public.current_app_role() = 'manager');
create policy jobdesk_preset_item_select_own_outlet on public.jobdesk_preset_item for select to authenticated
  using (exists (select 1 from public.jobdesk_preset p where p.id = preset_id and p.outlet_id = public.current_outlet_id() and public.current_app_role() = 'manager'));
create policy jobdesk_preset_item_manage_manager_own_outlet on public.jobdesk_preset_item for all to authenticated
  using (public.current_app_role() = 'manager' and exists (select 1 from public.jobdesk_preset p where p.id = preset_id and p.outlet_id = public.current_outlet_id()))
  with check (public.current_app_role() = 'manager' and exists (select 1 from public.jobdesk_preset p where p.id = preset_id and p.outlet_id = public.current_outlet_id()));

create policy schedule_day_status_select_manager_own_outlet on public.schedule_day_status for select to authenticated
  using (outlet_id = public.current_outlet_id() and public.current_app_role() = 'manager');

create policy overtime_select_own_outlet on public.overtime_requests for select to authenticated
  using (outlet_id = public.current_outlet_id() and (user_id = auth.uid() or public.current_app_role() in ('manager', 'finance')));
create policy shift_swap_select_own_outlet on public.shift_swap_request for select to authenticated
  using (outlet_id = public.current_outlet_id() and (requester_id = auth.uid() or target_id = auth.uid() or public.current_app_role() = 'manager'));
create policy shift_swap_update_manager_own_outlet on public.shift_swap_request for update to authenticated
  using (outlet_id = public.current_outlet_id() and public.current_app_role() = 'manager')
  with check (outlet_id = public.current_outlet_id() and public.current_app_role() = 'manager');
create policy leave_select_own_outlet on public.leave_request for select to authenticated
  using (outlet_id = public.current_outlet_id() and (user_id = auth.uid() or public.current_app_role() = 'manager'));
create policy leave_update_manager_own_outlet on public.leave_request for update to authenticated
  using (outlet_id = public.current_outlet_id() and public.current_app_role() = 'manager')
  with check (outlet_id = public.current_outlet_id() and public.current_app_role() = 'manager');
create policy violation_select_own_outlet on public.crew_violations for select to authenticated
  using (outlet_id = public.current_outlet_id() and deleted_at is null and public.current_app_role() is not null);
create policy meal_claim_select_own_outlet on public.meal_allowance_claims for select to authenticated
  using (outlet_id = public.current_outlet_id() and (user_id = auth.uid() or public.current_app_role() = 'finance'));

-- Attendance and attendance-correction rows inherit their outlet from their
-- schedule/user. Managers and finance can only read rows inside their outlet.
create policy attendance_select_own_outlet on public.attendance for select to authenticated
  using (exists (select 1 from public.schedule s where s.id = schedule_id and s.outlet_id = public.current_outlet_id())
    and (user_id = auth.uid() or public.current_app_role() in ('manager', 'finance')));
create policy corrections_select_own_outlet on public.attendance_corrections for select to authenticated
  using (exists (select 1 from public.users u where u.id = user_id and u.outlet_id = public.current_outlet_id())
    and (user_id = auth.uid() or public.current_app_role() in ('manager', 'finance')));

-- SECURITY DEFINER functions need their own outlet checks because they bypass
-- RLS. Keeping this validation in the database protects the API even if a
-- caller tampers with an identifier in the browser.
create or replace function public.violation_crew_directory()
returns table(id uuid, nama text, username text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not private.is_violation_staff() then raise exception 'Akses tidak diizinkan.'; end if;
  return query select u.id, u.nama::text, u.username::text
    from public.users u
    where u.role = 'crew' and u.status_aktif is true and u.outlet_id = public.current_outlet_id()
    order by u.nama;
end;
$$;

create or replace function public.save_jobdesk_preset(p_id bigint, p_nama text, p_jobdesk_ids bigint[])
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare v_id bigint; v_outlet uuid := public.current_outlet_id();
begin
  if v_outlet is null or not exists (select 1 from public.users where id = auth.uid() and role = 'manager' and status_aktif and outlet_id = v_outlet) then
    raise exception 'Hanya manager penjadwalan aktif yang dapat mengatur preset jobdesk.';
  end if;
  if p_nama is null or length(trim(p_nama)) = 0 then raise exception 'Nama preset wajib diisi.'; end if;
  if p_jobdesk_ids is null or cardinality(p_jobdesk_ids) not between 1 and 5 then raise exception 'Pilih 1–5 jobdesk untuk satu sel jadwal.'; end if;
  if (select count(distinct id) from unnest(p_jobdesk_ids) as ids(id)) <> cardinality(p_jobdesk_ids)
     or (select count(*) from public.jobdesk where id = any(p_jobdesk_ids) and outlet_id = v_outlet) <> cardinality(p_jobdesk_ids) then
    raise exception 'Pilihan jobdesk tidak valid atau bukan milik outlet ini.';
  end if;
  if p_id is null then
    insert into public.jobdesk_preset(nama, dibuat_oleh, outlet_id) values (trim(p_nama), auth.uid(), v_outlet) returning id into v_id;
  else
    update public.jobdesk_preset set nama = trim(p_nama), updated_at = clock_timestamp()
      where id = p_id and outlet_id = v_outlet returning id into v_id;
    if not found then raise exception 'Preset tidak ditemukan. Muat ulang daftar.'; end if;
    delete from public.jobdesk_preset_item where preset_id = v_id;
  end if;
  insert into public.jobdesk_preset_item(preset_id, jobdesk_id, urutan)
    select v_id, id, (position - 1)::integer from unnest(p_jobdesk_ids) with ordinality as ids(id, position);
  return v_id;
end;
$$;

create or replace function public.mark_schedule_day_saved(p_tanggal date)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare v_updated_at timestamptz := clock_timestamp(); v_outlet uuid := public.current_outlet_id();
begin
  if v_outlet is null or not exists (select 1 from public.users where id = auth.uid() and role = 'manager' and status_aktif and outlet_id = v_outlet) then
    raise exception 'Hanya manager penjadwalan aktif yang dapat menyimpan jadwal.';
  end if;
  if p_tanggal is null then raise exception 'Tanggal jadwal wajib diisi.'; end if;
  insert into public.schedule_day_status(outlet_id, tanggal, updated_at, updated_by)
    values (v_outlet, p_tanggal, v_updated_at, auth.uid())
    on conflict (outlet_id, tanggal) do update set updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  return v_updated_at;
end;
$$;

create or replace function public.submit_overtime_request(p_tanggal date, p_jam_mulai time, p_jam_selesai time, p_keterangan text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid := auth.uid(); v_outlet uuid; v_start timestamp; v_end timestamp; v_id bigint;
begin
  select outlet_id into v_outlet from public.users where id = v_user and role = 'crew' and status_aktif;
  if v_outlet is null then raise exception 'Hanya crew aktif yang dapat mengajukan lembur.'; end if;
  if p_tanggal is null or p_jam_mulai is null or p_jam_selesai is null or p_keterangan is null or length(trim(p_keterangan)) not between 1 and 1000 or extract(second from p_jam_mulai) <> 0 or extract(second from p_jam_selesai) <> 0 then raise exception 'Lengkapi tanggal, jam, dan keterangan lembur yang valid.'; end if;
  v_start := p_tanggal + p_jam_mulai;
  v_end := p_tanggal + p_jam_selesai + case when p_jam_selesai < p_jam_mulai then interval '1 day' else interval '0 day' end;
  if v_end - v_start < interval '1 hour' then raise exception 'Lembur kurang dari 1 jam. Minimal lembur 1 jam.'; end if;
  perform pg_advisory_xact_lock(20261011, 1);
  if exists (select 1 from public.payroll_periods where outlet_id = v_outlet and status = 'finalized' and p_tanggal between period_start and period_end) then raise exception 'Payroll tanggal ini sudah difinalisasi. Pengajuan lembur tidak dapat ditambahkan.'; end if;
  if exists (select 1 from public.overtime_requests where outlet_id = v_outlet and user_id = v_user and status in ('pending', 'disetujui') and start_at < v_end and end_at > v_start) then raise exception 'Rentang waktu ini bertabrakan dengan pengajuan lembur yang menunggu atau sudah disetujui.'; end if;
  insert into public.overtime_requests(user_id, outlet_id, tanggal, jam_mulai, jam_selesai, keterangan) values (v_user, v_outlet, p_tanggal, p_jam_mulai, p_jam_selesai, trim(p_keterangan)) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.review_overtime_request(p_id bigint, p_status text, p_catatan text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_request public.overtime_requests%rowtype; v_outlet uuid := public.current_outlet_id();
begin
  if v_outlet is null or not exists (select 1 from public.users where id = auth.uid() and role in ('manager', 'finance') and status_aktif and outlet_id = v_outlet) then raise exception 'Hanya manager aktif yang dapat memproses pengajuan lembur.'; end if;
  if p_status is null or p_status not in ('disetujui', 'ditolak') or length(coalesce(p_catatan, '')) > 1000 then raise exception 'Keputusan atau catatan manager tidak valid.'; end if;
  perform pg_advisory_xact_lock(20261011, 1);
  select * into v_request from public.overtime_requests where id = p_id and outlet_id = v_outlet for update;
  if not found then raise exception 'Pengajuan lembur tidak ditemukan.'; end if;
  if v_request.status <> 'pending' then raise exception 'Pengajuan lembur sudah diproses oleh manager lain. Muat ulang daftar.'; end if;
  if p_status = 'disetujui' and exists (select 1 from public.payroll_periods where outlet_id = v_outlet and status = 'finalized' and v_request.tanggal between period_start and period_end) then raise exception 'Payroll tanggal ini sudah difinalisasi. Lembur tidak dapat disetujui.'; end if;
  update public.overtime_requests set status = p_status, reviewed_by = auth.uid(), reviewed_at = now(), catatan_manajer = nullif(trim(coalesce(p_catatan, '')), '') where id = p_id and outlet_id = v_outlet;
end;
$$;

create or replace function public.save_crew_violation(
  p_id bigint, p_user_id uuid, p_tanggal date, p_kesalahan text,
  p_poin integer default null, p_denda numeric default null, p_version integer default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare v_role text; v_outlet uuid; v_manager boolean; v_old public.crew_violations%rowtype; v_id bigint;
begin
  select role::text, outlet_id into v_role, v_outlet from public.users where id = auth.uid() and status_aktif;
  if v_role is null or v_outlet is null or v_role not in ('crew', 'manager', 'finance') then raise exception 'Akses tidak diizinkan.'; end if;
  v_manager := v_role in ('manager', 'finance');
  if not v_manager and (p_id is not null or p_user_id is distinct from auth.uid() or p_poin is not null or p_denda is not null) then raise exception 'Crew hanya dapat melaporkan kesalahannya sendiri tanpa mengisi poin atau denda.'; end if;
  if p_tanggal is null or p_tanggal > (now() at time zone 'Asia/Jakarta')::date or p_kesalahan is null or length(trim(p_kesalahan)) = 0 then raise exception 'Isi tanggal kejadian yang valid dan keterangan kesalahan.'; end if;
  if not exists (select 1 from public.users where id = p_user_id and role = 'crew' and status_aktif is true and outlet_id = v_outlet) then raise exception 'Crew tidak ditemukan atau bukan milik outlet ini.'; end if;
  if v_manager and (p_poin is null or p_poin < 0 or p_denda is null or p_denda < 0 or p_denda >= 1000000000000 or p_denda <> trunc(p_denda)) then raise exception 'Poin dan denda harus berupa angka bulat nol atau lebih.'; end if;
  perform pg_advisory_xact_lock(20261011, 1);
  if p_id is not null then
    select * into v_old from public.crew_violations where id = p_id and deleted_at is null and outlet_id = v_outlet for update;
    if not found then raise exception 'Laporan pelanggaran tidak ditemukan.'; end if;
    if p_version is distinct from v_old.version then raise exception 'Laporan sudah diubah manager lain. Muat ulang sebelum menyimpan.'; end if;
  end if;
  if exists (select 1 from public.payroll_periods where outlet_id = v_outlet and status = 'finalized' and (p_tanggal between period_start and period_end or v_old.tanggal between period_start and period_end)) then raise exception 'Payroll tanggal ini sudah difinalisasi. Laporan pelanggaran tidak dapat diubah.'; end if;
  if p_id is null then
    insert into public.crew_violations(user_id, outlet_id, tanggal, kesalahan, poin, denda, created_by, reviewed_by, reviewed_at)
    values (p_user_id, v_outlet, p_tanggal, trim(p_kesalahan), coalesce(p_poin, 0), coalesce(p_denda, 0), auth.uid(), case when v_manager then auth.uid() end, case when v_manager then clock_timestamp() end)
    returning id into v_id;
  else
    update public.crew_violations set user_id = p_user_id, tanggal = p_tanggal, kesalahan = trim(p_kesalahan), poin = p_poin, denda = p_denda, reviewed_by = auth.uid(), reviewed_at = clock_timestamp(), updated_at = clock_timestamp(), version = version + 1
      where id = p_id and outlet_id = v_outlet returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.delete_crew_violation(p_id bigint, p_version integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_old public.crew_violations%rowtype; v_outlet uuid := public.current_outlet_id();
begin
  if v_outlet is null or not exists (select 1 from public.users where id = auth.uid() and status_aktif and role in ('manager', 'finance') and outlet_id = v_outlet) then raise exception 'Akses khusus manager.'; end if;
  perform pg_advisory_xact_lock(20261011, 1);
  select * into v_old from public.crew_violations where id = p_id and deleted_at is null and outlet_id = v_outlet for update;
  if not found then raise exception 'Laporan pelanggaran tidak ditemukan.'; end if;
  if p_version is distinct from v_old.version then raise exception 'Laporan sudah diubah manager lain. Muat ulang dahulu.'; end if;
  if exists (select 1 from public.payroll_periods where outlet_id = v_outlet and status = 'finalized' and v_old.tanggal between period_start and period_end) then raise exception 'Payroll sudah difinalisasi. Laporan pelanggaran tidak dapat dihapus.'; end if;
  update public.crew_violations set deleted_at = clock_timestamp(), deleted_by = auth.uid(), version = version + 1 where id = p_id and outlet_id = v_outlet;
end;
$$;

create or replace function public.approve_two_date_shift_swap(p_request_id bigint, p_manager_note text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  swap_row public.shift_swap_request%rowtype;
  requester_schedule_id integer; target_schedule_id integer; manager_id uuid := auth.uid(); v_outlet uuid := public.current_outlet_id();
  requester_start time; requester_end time; requester_duration numeric;
  target_start time; target_end time; target_duration numeric;
  requester_jobdesk_ids bigint[]; target_jobdesk_ids bigint[];
  requester_block_jobdesk_ids bigint[]; requester_block_starts integer[]; requester_block_ends integer[];
  target_block_jobdesk_ids bigint[]; target_block_starts integer[]; target_block_ends integer[];
begin
  if v_outlet is null or manager_id is null or not exists (select 1 from public.users where id = manager_id and role = 'manager' and status_aktif and outlet_id = v_outlet) then raise exception 'Hanya manager aktif yang dapat menyetujui tukar shift'; end if;
  select * into swap_row from public.shift_swap_request where id = p_request_id and outlet_id = v_outlet for update;
  if not found or swap_row.status <> 'pending' then raise exception 'Pengajuan tidak ditemukan atau sudah diproses'; end if;
  if swap_row.target_type <> 'crew' or swap_row.target_id is null or swap_row.tanggal_target is null then raise exception 'Pengajuan ini bukan pertukaran dua crew'; end if;
  if swap_row.requester_id = swap_row.target_id then raise exception 'Crew tidak dapat bertukar shift dengan dirinya sendiri'; end if;
  if swap_row.tanggal < (pg_catalog.now() at time zone 'Asia/Jakarta')::date or swap_row.tanggal_target < (pg_catalog.now() at time zone 'Asia/Jakarta')::date then raise exception 'Tanggal pertukaran sudah lewat'; end if;
  if not exists (select 1 from public.users where id = swap_row.requester_id and role = 'crew' and status_aktif and outlet_id = v_outlet) or not exists (select 1 from public.users where id = swap_row.target_id and role = 'crew' and status_aktif and outlet_id = v_outlet) then raise exception 'Salah satu crew sudah tidak aktif atau bukan milik outlet ini'; end if;
  select id into requester_schedule_id from public.schedule where user_id = swap_row.requester_id and tanggal = swap_row.tanggal and outlet_id = v_outlet for update;
  select id into target_schedule_id from public.schedule where user_id = swap_row.target_id and tanggal = swap_row.tanggal_target and outlet_id = v_outlet for update;
  if requester_schedule_id is null or target_schedule_id is null then raise exception 'Jadwal sudah berubah; salah satu crew tidak lagi memiliki shift yang dipilih'; end if;
  if exists (select 1 from public.attendance where schedule_id in (requester_schedule_id, target_schedule_id)) then raise exception 'Jadwal yang dipilih sudah memiliki data absensi dan tidak dapat ditukar'; end if;
  if swap_row.tanggal = swap_row.tanggal_target then
    select jam_mulai, jam_selesai, durasi_jam into requester_start, requester_end, requester_duration from public.schedule where id = requester_schedule_id;
    select jam_mulai, jam_selesai, durasi_jam into target_start, target_end, target_duration from public.schedule where id = target_schedule_id;
    select coalesce(array_agg(jobdesk_id::bigint order by id), array[]::bigint[]) into requester_jobdesk_ids from public.schedule_jobdesk where schedule_id = requester_schedule_id;
    select coalesce(array_agg(jobdesk_id::bigint order by id), array[]::bigint[]) into target_jobdesk_ids from public.schedule_jobdesk where schedule_id = target_schedule_id;
    select coalesce(array_agg(jobdesk_id order by id), array[]::bigint[]), coalesce(array_agg(mulai_menit order by id), array[]::integer[]), coalesce(array_agg(selesai_menit order by id), array[]::integer[]) into requester_block_jobdesk_ids, requester_block_starts, requester_block_ends from public.schedule_jobdesk_block where schedule_id = requester_schedule_id;
    select coalesce(array_agg(jobdesk_id order by id), array[]::bigint[]), coalesce(array_agg(mulai_menit order by id), array[]::integer[]), coalesce(array_agg(selesai_menit order by id), array[]::integer[]) into target_block_jobdesk_ids, target_block_starts, target_block_ends from public.schedule_jobdesk_block where schedule_id = target_schedule_id;
    update public.schedule set jam_mulai = target_start, jam_selesai = target_end, durasi_jam = target_duration where id = requester_schedule_id and outlet_id = v_outlet;
    update public.schedule set jam_mulai = requester_start, jam_selesai = requester_end, durasi_jam = requester_duration where id = target_schedule_id and outlet_id = v_outlet;
    delete from public.schedule_jobdesk where schedule_id in (requester_schedule_id, target_schedule_id);
    insert into public.schedule_jobdesk(schedule_id, jobdesk_id) select requester_schedule_id, item.jobdesk_id::integer from unnest(target_jobdesk_ids) as item(jobdesk_id);
    insert into public.schedule_jobdesk(schedule_id, jobdesk_id) select target_schedule_id, item.jobdesk_id::integer from unnest(requester_jobdesk_ids) as item(jobdesk_id);
    delete from public.schedule_jobdesk_block where schedule_id in (requester_schedule_id, target_schedule_id);
    insert into public.schedule_jobdesk_block(schedule_id, jobdesk_id, mulai_menit, selesai_menit) select requester_schedule_id, item.jobdesk_id, item.mulai_menit, item.selesai_menit from unnest(target_block_jobdesk_ids, target_block_starts, target_block_ends) as item(jobdesk_id, mulai_menit, selesai_menit);
    insert into public.schedule_jobdesk_block(schedule_id, jobdesk_id, mulai_menit, selesai_menit) select target_schedule_id, item.jobdesk_id, item.mulai_menit, item.selesai_menit from unnest(requester_block_jobdesk_ids, requester_block_starts, requester_block_ends) as item(jobdesk_id, mulai_menit, selesai_menit);
  else
    if exists (select 1 from public.schedule where user_id = swap_row.target_id and tanggal = swap_row.tanggal and outlet_id = v_outlet) or exists (select 1 from public.schedule where user_id = swap_row.requester_id and tanggal = swap_row.tanggal_target and outlet_id = v_outlet) then raise exception 'Pertukaran tidak dapat dilakukan karena salah satu crew sudah memiliki jadwal pada tanggal tujuan'; end if;
    update public.schedule set user_id = swap_row.target_id where id = requester_schedule_id and outlet_id = v_outlet;
    update public.schedule set user_id = swap_row.requester_id where id = target_schedule_id and outlet_id = v_outlet;
  end if;
  update public.shift_swap_request set status = 'disetujui', approved_by = manager_id, catatan_manajer = coalesce(p_manager_note, '') where id = swap_row.id and outlet_id = v_outlet;
end;
$$;
