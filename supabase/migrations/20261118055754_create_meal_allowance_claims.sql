-- Jatah makan is kept separate from payroll. A missing report is derived in
-- the violation register, so it never creates a second payroll deduction.
-- `outlet_id` will be added when the outlet-isolation migration is introduced.
create table if not exists public.meal_allowance_claims (
  id uuid primary key default gen_random_uuid(),
  schedule_id integer references public.schedule(id) on delete set null,
  user_id uuid not null references public.users(id) on delete cascade,
  meal_date date not null,
  status text not null check (status in ('claimed', 'not_taken')),
  description text,
  photo_path text,
  submitted_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  version integer not null default 1,
  constraint meal_allowance_claims_one_per_crew_day unique (user_id, meal_date),
  constraint meal_allowance_claims_payload_check check (
    (status = 'claimed'
      and photo_path is not null
      and length(btrim(description)) between 1 and 500)
    or
    (status = 'not_taken'
      and photo_path is null
      and description is null)
  )
);

create index if not exists meal_allowance_claims_date_user_idx
  on public.meal_allowance_claims (meal_date, user_id);
create index if not exists meal_allowance_claims_schedule_idx
  on public.meal_allowance_claims (schedule_id)
  where schedule_id is not null;

alter table public.meal_allowance_claims enable row level security;

-- Browser clients may only read rows appropriate to their role. All writes go
-- through an authenticated Server Action, which checks the current schedule,
-- the WIB deadline, and ownership before using the service key.
revoke all on table public.meal_allowance_claims from anon;
revoke all on table public.meal_allowance_claims from authenticated;
grant select on table public.meal_allowance_claims to authenticated;

drop policy if exists "meal_allowance_claims_read_own_or_staff" on public.meal_allowance_claims;
drop policy if exists "meal_allowance_claims_read_own_or_finance" on public.meal_allowance_claims;
create policy "meal_allowance_claims_read_own_or_finance"
  on public.meal_allowance_claims
  for select
  to authenticated
  using (
    (user_id = (select auth.uid()) and private.is_active_user())
    or private.is_finance_manager()
  );

-- Food photos remain private. No client-side Storage policy is added: uploads
-- and signed URLs are produced only after the Server Action authorizes access.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meal-allowance-photos',
  'meal-allowance-photos',
  false,
  2500000,
  array['image/jpeg']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
