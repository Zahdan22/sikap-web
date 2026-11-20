-- Controls when an outlet starts applying disciplinary points for a missing
-- meal report. The report form itself stays available regardless of this
-- setting; only its automatic violation row is controlled here.
create table if not exists public.meal_allowance_point_settings (
  outlet_id uuid primary key references public.outlets(id) on delete cascade,
  is_enabled boolean not null default false,
  effective_from date,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint meal_allowance_point_settings_effective_date_check
    check (not is_enabled or effective_from is not null)
);

alter table public.meal_allowance_point_settings enable row level security;
revoke all on table public.meal_allowance_point_settings from anon, authenticated;

-- The settings are returned only by Finance-authorized Server Actions. Keeping
-- the table inaccessible to browser clients prevents a crew account from
-- learning or changing outlet-level enforcement dates.

-- Finished-period violations were originally keyed only by schedule. Add the
-- outlet explicitly so pruning and every server-side lookup remain isolated
-- even when two outlets have similar periods or schedules.
alter table public.meal_allowance_missing_violations
  add column if not exists outlet_id uuid references public.outlets(id);

update public.meal_allowance_missing_violations violation
set outlet_id = coalesce(
  (select schedule.outlet_id from public.schedule schedule where schedule.id = violation.schedule_id),
  crew.outlet_id
)
from public.users crew
where violation.user_id = crew.id
  and violation.outlet_id is null;

alter table public.meal_allowance_missing_violations
  alter column outlet_id set not null;

alter table public.meal_allowance_missing_violations
  alter column outlet_id set default public.current_outlet_id();

create index if not exists meal_allowance_missing_violations_outlet_date_idx
  on public.meal_allowance_missing_violations (outlet_id, tanggal, user_id);

-- A later effective date removes only automatic rows before the new date. If
-- the rule is disabled, all automatic meal-point rows for that outlet are
-- removed. This runs in the same transaction as the setting update.
create or replace function private.prune_meal_allowance_missing_violations()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not new.is_enabled then
    delete from public.meal_allowance_missing_violations
      where outlet_id = new.outlet_id;
  elsif new.effective_from is not null then
    delete from public.meal_allowance_missing_violations
      where outlet_id = new.outlet_id
        and tanggal < new.effective_from;
  end if;
  return new;
end;
$$;

revoke all on function private.prune_meal_allowance_missing_violations() from public;

drop trigger if exists meal_allowance_point_settings_prune_violations
  on public.meal_allowance_point_settings;
create trigger meal_allowance_point_settings_prune_violations
  after insert or update of is_enabled, effective_from
  on public.meal_allowance_point_settings
  for each row execute function private.prune_meal_allowance_missing_violations();

-- Preserve the original Tjap rollout until its Finance manager chooses a
-- different official date. Warkop starts disabled until its own Finance
-- manager enables the policy, so the outlets stay independent.
insert into public.meal_allowance_point_settings (outlet_id, is_enabled, effective_from)
select id,
  case when nama = 'Tjap Djajakarta' then true else false end,
  case when nama = 'Tjap Djajakarta' then date '2026-11-19' else null end
from public.outlets
on conflict (outlet_id) do nothing;
