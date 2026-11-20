-- Server-only appeal operations use the service credential, so the outlet is
-- stored explicitly and checked again inside the privileged database function.
alter table public.violation_appeals add column if not exists outlet_id uuid references public.outlets(id);
update public.violation_appeals a
set outlet_id = v.outlet_id
from public.crew_violations v
where v.id = a.violation_id and a.outlet_id is null;
alter table public.violation_appeals alter column outlet_id set not null;
alter table public.violation_appeals alter column outlet_id set default public.current_outlet_id();
create index if not exists violation_appeals_outlet_status_idx on public.violation_appeals (outlet_id, status, created_at desc);

create or replace function public.review_violation_appeal(
  p_actor uuid, p_appeal_id bigint, p_decision text, p_note text,
  p_points integer default null, p_fine numeric default null
)
returns table(user_id uuid, violation_date date)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appeal public.violation_appeals%rowtype;
  v_violation public.crew_violations%rowtype;
  v_points integer;
  v_fine numeric;
  v_now timestamptz := clock_timestamp();
  v_outlet uuid;
begin
  select outlet_id into v_outlet
  from public.users
  where id = p_actor and role = 'finance' and status_aktif is true;
  if v_outlet is null then raise exception 'Akses khusus Manager Keuangan.'; end if;
  if p_decision not in ('approved', 'partially_approved', 'rejected') then raise exception 'Keputusan banding tidak valid.'; end if;
  if p_note is null or length(btrim(p_note)) = 0 or length(btrim(p_note)) > 2000 then raise exception 'Catatan keputusan wajib diisi, maksimal 2.000 karakter.'; end if;
  select * into v_appeal from public.violation_appeals where id = p_appeal_id and outlet_id = v_outlet for update;
  if not found then raise exception 'Pengajuan banding tidak ditemukan.'; end if;
  if v_appeal.status <> 'pending' then raise exception 'Pengajuan banding ini sudah diproses.'; end if;
  select * into v_violation from public.crew_violations where id = v_appeal.violation_id and outlet_id = v_outlet and deleted_at is null for update;
  if not found then raise exception 'Pelanggaran asal sudah tidak tersedia.'; end if;
  if v_violation.user_id <> v_appeal.user_id then raise exception 'Data banding tidak konsisten.'; end if;
  if v_violation.version <> v_appeal.violation_version_at_request then raise exception 'Pelanggaran sudah berubah setelah banding diajukan. Periksa data terbaru terlebih dahulu.'; end if;
  if exists (select 1 from public.payroll_periods where outlet_id = v_outlet and status = 'finalized' and v_violation.tanggal between period_start and period_end) then raise exception 'Payroll periode pelanggaran ini sudah difinalisasi dan terkunci.'; end if;
  if p_decision = 'approved' then
    v_points := 0; v_fine := 0;
  elsif p_decision = 'partially_approved' then
    if p_points is null or p_points < 0 or p_fine is null or p_fine < 0 or p_fine <> trunc(p_fine) or p_points > v_appeal.original_points or p_fine > v_appeal.original_fine then raise exception 'Keputusan sebagian hanya boleh mengurangi poin atau denda dari nilai awal.'; end if;
    v_points := p_points; v_fine := p_fine;
  else
    v_points := null; v_fine := null;
  end if;
  if p_decision in ('approved', 'partially_approved') then
    update public.crew_violations set poin = v_points, denda = v_fine, reviewed_by = p_actor, reviewed_at = v_now, updated_at = v_now, version = version + 1 where id = v_violation.id and outlet_id = v_outlet;
  end if;
  update public.violation_appeals set status = p_decision, manager_note = btrim(p_note), resolved_points = v_points, resolved_fine = v_fine, responded_by = p_actor, responded_at = v_now, updated_at = v_now where id = v_appeal.id and outlet_id = v_outlet;
  return query select v_appeal.user_id, v_violation.tanggal;
end;
$$;
