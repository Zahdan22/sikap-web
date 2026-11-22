-- Each outlet owns its own overtime-rate timeline. A request receives an
-- immutable rate snapshot when it is submitted, so later SOP changes never
-- rewrite pending, approved, draft, or finalized payroll history.
create table if not exists public.overtime_rate_history (
  id bigint generated always as identity primary key,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  hourly_rate integer not null check (hourly_rate >= 0 and hourly_rate <= 100000000),
  effective_on date not null,
  recorded_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint overtime_rate_history_outlet_effective_key unique (outlet_id, effective_on)
);

create index if not exists overtime_rate_history_outlet_effective_idx
  on public.overtime_rate_history (outlet_id, effective_on desc, id desc);

-- `nominal` used to be a generated value with a system-wide Rp8.000 rate.
-- Keep every historical amount, then add the rate that produced it.
alter table public.overtime_requests
  alter column nominal drop expression;

alter table public.overtime_requests
  add column if not exists hourly_rate_snapshot integer;

update public.overtime_requests
set hourly_rate_snapshot = case
  when jam_dibayar > 0 then nominal / jam_dibayar
  else 0
end
where hourly_rate_snapshot is null;

alter table public.overtime_requests
  alter column nominal set not null,
  alter column hourly_rate_snapshot set not null;

alter table public.overtime_requests
  add constraint overtime_requests_hourly_rate_snapshot_check
  check (hourly_rate_snapshot >= 0 and hourly_rate_snapshot <= 100000000),
  add constraint overtime_requests_nominal_matches_rate_check
  check (nominal = jam_dibayar * hourly_rate_snapshot);

-- Preserve the established Rp8.000/hour rule as the initial history for every
-- outlet, including outlets added before this feature existed.
insert into public.overtime_rate_history (outlet_id, hourly_rate, effective_on)
select id, 8000, date '1900-01-01'
from public.outlets
on conflict (outlet_id, effective_on) do nothing;

alter table public.overtime_rate_history enable row level security;

create policy overtime_rate_history_select_own_outlet
  on public.overtime_rate_history for select to authenticated
  using (outlet_id = (select public.current_outlet_id()));

create policy overtime_rate_history_manage_finance_own_outlet
  on public.overtime_rate_history for all to authenticated
  using (outlet_id = (select public.current_outlet_id()) and (select public.current_app_role()) = 'finance')
  with check (outlet_id = (select public.current_outlet_id()) and (select public.current_app_role()) = 'finance');

create or replace function public.submit_overtime_request(
  p_tanggal date,
  p_jam_mulai time without time zone,
  p_jam_selesai time without time zone,
  p_keterangan text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_outlet uuid;
  v_start timestamp;
  v_end timestamp;
  v_paid_hours integer;
  v_hourly_rate integer;
  v_id bigint;
begin
  select outlet_id into v_outlet
  from public.users
  where id = v_user and role = 'crew' and status_aktif;
  if v_outlet is null then raise exception 'Hanya crew aktif yang dapat mengajukan lembur.'; end if;

  if p_tanggal is null or p_jam_mulai is null or p_jam_selesai is null or p_keterangan is null
    or length(trim(p_keterangan)) not between 1 and 1000
    or extract(second from p_jam_mulai) <> 0 or extract(second from p_jam_selesai) <> 0 then
    raise exception 'Lengkapi tanggal, jam, dan keterangan lembur yang valid.';
  end if;

  v_start := p_tanggal + p_jam_mulai;
  v_end := p_tanggal + p_jam_selesai + case when p_jam_selesai < p_jam_mulai then interval '1 day' else interval '0 day' end;
  v_paid_hours := floor(extract(epoch from (v_end - v_start)) / 3600)::integer;
  if v_paid_hours < 1 then raise exception 'Lembur kurang dari 1 jam. Minimal lembur 1 jam.'; end if;

  select hourly_rate into v_hourly_rate
  from public.overtime_rate_history
  where outlet_id = v_outlet and effective_on <= p_tanggal
  order by effective_on desc, id desc
  limit 1;
  if v_hourly_rate is null then raise exception 'Tarif lembur belum diatur untuk tanggal tersebut. Hubungi Manager Keuangan.'; end if;

  perform pg_advisory_xact_lock(20261011, 1);
  if exists (
    select 1 from public.payroll_periods
    where outlet_id = v_outlet and status = 'finalized' and p_tanggal between period_start and period_end
  ) then raise exception 'Payroll tanggal ini sudah difinalisasi. Pengajuan lembur tidak dapat ditambahkan.'; end if;
  if exists (
    select 1 from public.overtime_requests
    where outlet_id = v_outlet and user_id = v_user and status in ('pending', 'disetujui') and start_at < v_end and end_at > v_start
  ) then raise exception 'Rentang waktu ini bertabrakan dengan pengajuan lembur yang menunggu atau sudah disetujui.'; end if;

  insert into public.overtime_requests (
    user_id, outlet_id, tanggal, jam_mulai, jam_selesai, keterangan, hourly_rate_snapshot, nominal
  ) values (
    v_user, v_outlet, p_tanggal, p_jam_mulai, p_jam_selesai, trim(p_keterangan), v_hourly_rate, v_paid_hours * v_hourly_rate
  ) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.submit_overtime_request(date, time without time zone, time without time zone, text) from public, anon;
grant execute on function public.submit_overtime_request(date, time without time zone, time without time zone, text) to authenticated;
revoke all on function public.review_overtime_request(bigint, text, text) from public, anon;
grant execute on function public.review_overtime_request(bigint, text, text) to authenticated;
