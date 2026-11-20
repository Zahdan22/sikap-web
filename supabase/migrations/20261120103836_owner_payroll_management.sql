-- Owner and non-operational payroll foundation.
-- Operational data stays outlet-bound; owner payroll has no outlet_id and
-- therefore never mixes with a Tjap Djajakarta or Warkop DKI payroll period.

-- These two application roles are intentionally stable permissions.  Labels
-- such as "Payroll Marketing" are stored in payroll_roles, never in users.role.
alter table public.users drop constraint if exists users_role_check;
alter table public.users
  add constraint users_role_check
  check (role in ('crew', 'manager', 'finance', 'owner', 'payroll_staff'));

alter table public.users alter column outlet_id drop not null;
alter table public.users drop constraint if exists users_outlet_scope_check;
alter table public.users
  add constraint users_outlet_scope_check check (
    (role in ('owner', 'payroll_staff') and outlet_id is null)
    or
    (role not in ('owner', 'payroll_staff') and outlet_id is not null)
  );

-- A forthcoming outlet may be provisioned first, then receive its physical
-- attendance location before going live.  It cannot be marked active without
-- a valid GPS point.
alter table public.outlets alter column latitude drop not null;
alter table public.outlets alter column longitude drop not null;
alter table public.outlets add column if not exists setup_complete boolean not null default true;
alter table public.outlets drop constraint if exists outlets_active_location_check;
alter table public.outlets
  add constraint outlets_active_location_check check (
    not is_active or (latitude is not null and longitude is not null)
  );

-- Warkop DKI is deliberately provisioned as inactive until its real GPS point
-- is entered by its own Admin 1 or Admin 2.  No placeholder coordinates are
-- ever used for attendance validation.
insert into public.outlets (nama, alamat, latitude, longitude, radius_meter, is_active, setup_complete)
values ('Warkop DKI', 'Lokasi belum diatur', null, null, 50, false, false)
on conflict (nama) do nothing;

-- Owners must be able to see the bounded account directory and every outlet,
-- while ordinary operational users remain restricted to their own outlet.
drop policy if exists users_select_own_outlet on public.users;
create policy users_select_own_outlet_or_owner on public.users
  for select to authenticated
  using (
    id = (select auth.uid())
    or outlet_id = public.current_outlet_id()
    or public.current_app_role() = 'owner'
  );

drop policy if exists outlets_select_own on public.outlets;
create policy outlets_select_own_or_owner on public.outlets
  for select to authenticated
  using (id = public.current_outlet_id() or public.current_app_role() = 'owner');

-- Labels for payroll outside of operations.  They are descriptive categories,
-- not application permissions.
create table public.payroll_roles (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  is_active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_roles_nama_not_blank check (length(btrim(nama)) between 2 and 100)
);
create unique index payroll_roles_nama_unique_idx on public.payroll_roles (lower(nama));

create table public.payroll_staff_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  payroll_role_id uuid not null references public.payroll_roles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payroll_staff_profiles_role_idx on public.payroll_staff_profiles(payroll_role_id);

create table public.management_payroll_periods (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  period_start date not null,
  period_end date not null,
  status text not null default 'draft',
  created_by uuid references public.users(id) on delete set null,
  finalized_by uuid references public.users(id) on delete set null,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint management_payroll_periods_dates_check check (period_end >= period_start),
  constraint management_payroll_periods_status_check check (status in ('draft', 'finalized')),
  constraint management_payroll_periods_dates_unique unique (period_start, period_end)
);
create index management_payroll_periods_date_idx on public.management_payroll_periods(period_end desc, period_start desc);

create table public.management_payroll_items (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.management_payroll_periods(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete restrict,
  role_label_snapshot text not null,
  gaji_pokok numeric(14, 0) not null default 0,
  tunjangan numeric(14, 0) not null default 0,
  bonus_komisi numeric(14, 0) not null default 0,
  potongan numeric(14, 0) not null default 0,
  catatan text,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint management_payroll_items_amounts_check check (
    gaji_pokok >= 0 and tunjangan >= 0 and bonus_komisi >= 0 and potongan >= 0
  ),
  constraint management_payroll_items_note_length check (catatan is null or length(catatan) <= 2000),
  constraint management_payroll_items_unique_person unique (period_id, user_id)
);
create index management_payroll_items_user_period_idx on public.management_payroll_items(user_id, period_id);

-- Finalized payroll may be corrected directly by the owner.  Each write is
-- append-only in this audit table, preserving the before/after values.
create table public.management_payroll_events (
  id bigint generated always as identity primary key,
  item_id uuid references public.management_payroll_items(id) on delete set null,
  period_id uuid not null references public.management_payroll_periods(id) on delete cascade,
  actor_id uuid references public.users(id) on delete set null,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  note text,
  created_at timestamptz not null default now(),
  constraint management_payroll_events_action_check check (action in ('created', 'updated', 'deleted', 'finalized', 'reopened')),
  constraint management_payroll_events_note_length check (note is null or length(note) <= 2000)
);
create index management_payroll_events_period_idx on public.management_payroll_events(period_id, created_at desc);
create index management_payroll_events_item_idx on public.management_payroll_events(item_id, created_at desc);

alter table public.payroll_roles enable row level security;
alter table public.payroll_staff_profiles enable row level security;
alter table public.management_payroll_periods enable row level security;
alter table public.management_payroll_items enable row level security;
alter table public.management_payroll_events enable row level security;

grant select, insert, update, delete on public.payroll_roles to authenticated;
grant select, insert, update, delete on public.payroll_staff_profiles to authenticated;
grant select, insert, update, delete on public.management_payroll_periods to authenticated;
grant select, insert, update, delete on public.management_payroll_items to authenticated;
grant select, insert, update, delete on public.management_payroll_events to authenticated;
grant usage, select on sequence public.management_payroll_events_id_seq to authenticated;

create policy payroll_roles_owner_manage on public.payroll_roles
  for all to authenticated
  using (public.current_app_role() = 'owner')
  with check (public.current_app_role() = 'owner');
create policy payroll_roles_staff_select_assigned on public.payroll_roles
  for select to authenticated
  using (exists (
    select 1 from public.payroll_staff_profiles profile
    where profile.payroll_role_id = payroll_roles.id and profile.user_id = (select auth.uid())
  ));

create policy payroll_staff_profiles_owner_manage on public.payroll_staff_profiles
  for all to authenticated
  using (public.current_app_role() = 'owner')
  with check (public.current_app_role() = 'owner');
create policy payroll_staff_profiles_self_select on public.payroll_staff_profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy management_payroll_periods_owner_manage on public.management_payroll_periods
  for all to authenticated
  using (public.current_app_role() = 'owner')
  with check (public.current_app_role() = 'owner');
create policy management_payroll_periods_staff_select_own on public.management_payroll_periods
  for select to authenticated
  using (exists (
    select 1 from public.management_payroll_items item
    where item.period_id = management_payroll_periods.id and item.user_id = (select auth.uid())
  ));

create policy management_payroll_items_owner_manage on public.management_payroll_items
  for all to authenticated
  using (public.current_app_role() = 'owner')
  with check (public.current_app_role() = 'owner');
create policy management_payroll_items_staff_select_own on public.management_payroll_items
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy management_payroll_events_owner_select on public.management_payroll_events
  for select to authenticated
  using (public.current_app_role() = 'owner');
create policy management_payroll_events_owner_insert on public.management_payroll_events
  for insert to authenticated
  with check (public.current_app_role() = 'owner');
