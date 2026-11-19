-- Keep only confirmed missing-meal violations after the temporary meal
-- reports and food photos for a finished work period are purged. These rows
-- are deliberately separate from crew_violations: they remain automatic,
-- non-editable, and never participate in payroll deductions.
create table if not exists public.meal_allowance_missing_violations (
  schedule_id integer primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  tanggal date not null,
  poin integer not null default 4 check (poin = 4),
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists meal_allowance_missing_violations_date_user_idx
  on public.meal_allowance_missing_violations (tanggal, user_id);

alter table public.meal_allowance_missing_violations enable row level security;
revoke all on table public.meal_allowance_missing_violations from anon, authenticated;

-- A completed snapshot prevents a retry from interpreting already-purged
-- claims as new missing reports. It is service-role only, just like the
-- cleanup process itself.
create table if not exists public.meal_allowance_period_cleanups (
  period_id integer primary key,
  snapshot_completed_at timestamptz not null default clock_timestamp(),
  claims_deleted_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);

alter table public.meal_allowance_period_cleanups enable row level security;
revoke all on table public.meal_allowance_period_cleanups from anon, authenticated;
