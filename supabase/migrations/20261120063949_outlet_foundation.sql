-- Foundation for isolating outlet data.  Current records are formally assigned
-- to Tjap Djajakarta; a second outlet can later reuse the same database without
-- sharing users, schedules, periods, or payroll policy masters.

create table if not exists public.outlets (
  id uuid primary key default gen_random_uuid(),
  nama text not null unique,
  alamat text,
  latitude numeric(10, 8) not null,
  longitude numeric(11, 8) not null,
  radius_meter integer not null default 50 check (radius_meter = 50),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (latitude between -90 and 90),
  check (longitude between -180 and 180)
);

-- There are two legacy rows with identical coordinates.  The outlet record is
-- the single source of truth from now on; the old table is left in place for a
-- short backward-compatible deployment window.
insert into public.outlets (nama, latitude, longitude, radius_meter)
select 'Tjap Djajakarta', latitude, longitude, 50
from public.office_location
order by id
limit 1
on conflict (nama) do nothing;

-- Every existing account belongs to the outlet currently in operation.
alter table public.users add column if not exists outlet_id uuid references public.outlets(id);
update public.users
set outlet_id = (select id from public.outlets where nama = 'Tjap Djajakarta')
where outlet_id is null;
alter table public.users alter column outlet_id set not null;
create index if not exists users_outlet_id_idx on public.users (outlet_id);

-- Operational roots.  Detail records remain tied to their user, schedule or
-- payroll-period root, so they inherit the same outlet boundary.
alter table public.schedule add column if not exists outlet_id uuid references public.outlets(id);
update public.schedule
set outlet_id = (select id from public.outlets where nama = 'Tjap Djajakarta')
where outlet_id is null;
alter table public.schedule alter column outlet_id set not null;
create index if not exists schedule_outlet_date_idx on public.schedule (outlet_id, tanggal);

alter table public.periode_kerja add column if not exists outlet_id uuid references public.outlets(id);
update public.periode_kerja
set outlet_id = (select id from public.outlets where nama = 'Tjap Djajakarta')
where outlet_id is null;
alter table public.periode_kerja alter column outlet_id set not null;
create index if not exists periode_kerja_outlet_date_idx on public.periode_kerja (outlet_id, tanggal_mulai, tanggal_selesai);

alter table public.payroll_periods add column if not exists outlet_id uuid references public.outlets(id);
update public.payroll_periods
set outlet_id = (select id from public.outlets where nama = 'Tjap Djajakarta')
where outlet_id is null;
alter table public.payroll_periods alter column outlet_id set not null;
alter table public.payroll_periods drop constraint if exists payroll_periods_period_start_period_end_key;
alter table public.payroll_periods add constraint payroll_periods_outlet_dates_key unique (outlet_id, period_start, period_end);
create index if not exists payroll_periods_outlet_idx on public.payroll_periods (outlet_id, period_start desc, period_end desc);

-- Payroll tier master and history are outlet-specific.  Composite keys let a
-- future outlet have its own `junior`, `senior`, etc. without affecting Tjap.
alter table public.payroll_tier_rates add column if not exists outlet_id uuid references public.outlets(id);
update public.payroll_tier_rates
set outlet_id = (select id from public.outlets where nama = 'Tjap Djajakarta')
where outlet_id is null;
alter table public.payroll_tier_rates alter column outlet_id set not null;

alter table public.payroll_tier_rate_history add column if not exists outlet_id uuid references public.outlets(id);
update public.payroll_tier_rate_history
set outlet_id = (select id from public.outlets where nama = 'Tjap Djajakarta')
where outlet_id is null;
alter table public.payroll_tier_rate_history alter column outlet_id set not null;

alter table public.crew_payroll_status add column if not exists outlet_id uuid references public.outlets(id);
update public.crew_payroll_status
set outlet_id = (select id from public.outlets where nama = 'Tjap Djajakarta')
where outlet_id is null;
alter table public.crew_payroll_status alter column outlet_id set not null;

alter table public.crew_payroll_tier_history add column if not exists outlet_id uuid references public.outlets(id);
update public.crew_payroll_tier_history
set outlet_id = (select id from public.outlets where nama = 'Tjap Djajakarta')
where outlet_id is null;
alter table public.crew_payroll_tier_history alter column outlet_id set not null;

alter table public.crew_payroll_status drop constraint if exists crew_payroll_status_tier_fkey;
alter table public.crew_payroll_tier_history drop constraint if exists crew_payroll_tier_history_tier_fkey;
alter table public.payroll_tier_rate_history drop constraint if exists payroll_tier_rate_history_tier_fkey;
alter table public.payroll_tier_rates drop constraint if exists payroll_tier_rates_pkey;
alter table public.payroll_tier_rates add constraint payroll_tier_rates_pkey primary key (outlet_id, tier);
alter table public.payroll_tier_rate_history drop constraint if exists payroll_tier_rate_history_tier_effective_on_key;
alter table public.payroll_tier_rate_history add constraint payroll_tier_rate_history_outlet_tier_effective_key unique (outlet_id, tier, effective_on);
alter table public.crew_payroll_status add constraint crew_payroll_status_outlet_tier_fkey foreign key (outlet_id, tier) references public.payroll_tier_rates(outlet_id, tier) on update cascade on delete restrict;
alter table public.crew_payroll_tier_history add constraint crew_payroll_tier_history_outlet_tier_fkey foreign key (outlet_id, tier) references public.payroll_tier_rates(outlet_id, tier) on update cascade on delete restrict;
alter table public.payroll_tier_rate_history add constraint payroll_tier_rate_history_outlet_tier_fkey foreign key (outlet_id, tier) references public.payroll_tier_rates(outlet_id, tier) on update cascade on delete restrict;
create index if not exists payroll_tier_rate_history_outlet_lookup_idx on public.payroll_tier_rate_history (outlet_id, tier, effective_on desc, id desc);

-- Senior+ master follows the same isolation rule.
alter table public.payroll_senior_plus_rates add column if not exists outlet_id uuid references public.outlets(id);
update public.payroll_senior_plus_rates
set outlet_id = (select id from public.outlets where nama = 'Tjap Djajakarta')
where outlet_id is null;
alter table public.payroll_senior_plus_rates alter column outlet_id set not null;

alter table public.payroll_senior_plus_rate_history add column if not exists outlet_id uuid references public.outlets(id);
update public.payroll_senior_plus_rate_history
set outlet_id = (select id from public.outlets where nama = 'Tjap Djajakarta')
where outlet_id is null;
alter table public.payroll_senior_plus_rate_history alter column outlet_id set not null;

alter table public.payroll_senior_plus_rate_history drop constraint if exists payroll_senior_plus_rate_history_level_fkey;
alter table public.payroll_senior_plus_rates drop constraint if exists payroll_senior_plus_rates_pkey;
alter table public.payroll_senior_plus_rates add constraint payroll_senior_plus_rates_pkey primary key (outlet_id, level);
alter table public.payroll_senior_plus_rate_history drop constraint if exists payroll_senior_plus_rate_history_level_effective_on_key;
alter table public.payroll_senior_plus_rate_history add constraint payroll_senior_plus_rate_history_outlet_level_effective_key unique (outlet_id, level, effective_on);
alter table public.payroll_senior_plus_rate_history add constraint payroll_senior_plus_rate_history_outlet_level_fkey foreign key (outlet_id, level) references public.payroll_senior_plus_rates(outlet_id, level) on update cascade on delete restrict;
create index if not exists payroll_senior_plus_rate_history_outlet_lookup_idx on public.payroll_senior_plus_rate_history (outlet_id, level, effective_on desc, id desc);

-- Attendance-point and deduction rules are set by each outlet's finance role.
alter table public.attendance_penalty_rule_history add column if not exists outlet_id uuid references public.outlets(id);
update public.attendance_penalty_rule_history
set outlet_id = (select id from public.outlets where nama = 'Tjap Djajakarta')
where outlet_id is null;
alter table public.attendance_penalty_rule_history alter column outlet_id set not null;
alter table public.attendance_penalty_rule_history drop constraint if exists attendance_penalty_rule_history_rule_key_effective_on_key;
alter table public.attendance_penalty_rule_history add constraint attendance_penalty_rule_history_outlet_rule_effective_key unique (outlet_id, rule_key, effective_on);
drop index if exists public.attendance_penalty_rule_history_lookup_idx;
create index attendance_penalty_rule_history_lookup_idx on public.attendance_penalty_rule_history (outlet_id, rule_key, effective_on desc, id desc);

-- Read-only helpers used exclusively by RLS.  The explicit search_path avoids
-- search-path injection in these security-definer functions.
create or replace function public.current_outlet_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select outlet_id from public.users where id = auth.uid()
$$;

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role::text from public.users where id = auth.uid() and status_aktif = true
$$;

revoke all on function public.current_outlet_id() from public, anon;
revoke all on function public.current_app_role() from public, anon;
grant execute on function public.current_outlet_id() to authenticated;
grant execute on function public.current_app_role() to authenticated;

-- Authenticated server actions inherit the actor's outlet automatically.  The
-- handful of service-role writes (such as creating a crew account) set the
-- outlet explicitly in application code.
alter table public.schedule alter column outlet_id set default public.current_outlet_id();
alter table public.periode_kerja alter column outlet_id set default public.current_outlet_id();
alter table public.payroll_periods alter column outlet_id set default public.current_outlet_id();
alter table public.payroll_tier_rates alter column outlet_id set default public.current_outlet_id();
alter table public.payroll_tier_rate_history alter column outlet_id set default public.current_outlet_id();
alter table public.payroll_senior_plus_rates alter column outlet_id set default public.current_outlet_id();
alter table public.payroll_senior_plus_rate_history alter column outlet_id set default public.current_outlet_id();
alter table public.crew_payroll_status alter column outlet_id set default public.current_outlet_id();
alter table public.crew_payroll_tier_history alter column outlet_id set default public.current_outlet_id();

alter table public.outlets enable row level security;

-- Replace broad legacy policies with policies that can only see the session's
-- own outlet.  Server-only actions still validate role and outlet explicitly.
do $$
declare item record;
begin
  for item in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any (array[
        'users', 'schedule', 'periode_kerja', 'payroll_periods',
        'payroll_tier_rates', 'payroll_tier_rate_history',
        'payroll_senior_plus_rates', 'payroll_senior_plus_rate_history',
        'crew_payroll_status', 'crew_payroll_tier_history'
      ])
  loop
    execute format('drop policy if exists %I on %I.%I', item.policyname, item.schemaname, item.tablename);
  end loop;
end $$;

create policy outlets_select_own on public.outlets for select to authenticated using (id = public.current_outlet_id());
create policy outlets_update_manager_or_finance on public.outlets for update to authenticated using (id = public.current_outlet_id() and public.current_app_role() in ('manager', 'finance')) with check (id = public.current_outlet_id() and public.current_app_role() in ('manager', 'finance'));

create policy users_select_own_outlet on public.users for select to authenticated using (outlet_id = public.current_outlet_id());

create policy schedule_select_own_outlet on public.schedule for select to authenticated using (outlet_id = public.current_outlet_id());
create policy schedule_manage_manager_own_outlet on public.schedule for all to authenticated using (outlet_id = public.current_outlet_id() and public.current_app_role() = 'manager') with check (outlet_id = public.current_outlet_id() and public.current_app_role() = 'manager');

create policy period_select_own_outlet on public.periode_kerja for select to authenticated using (outlet_id = public.current_outlet_id());
create policy period_manage_staff_own_outlet on public.periode_kerja for all to authenticated using (outlet_id = public.current_outlet_id() and public.current_app_role() in ('manager', 'finance')) with check (outlet_id = public.current_outlet_id() and public.current_app_role() in ('manager', 'finance'));

create policy tier_rate_select_own_outlet on public.payroll_tier_rates for select to authenticated using (outlet_id = public.current_outlet_id());
create policy tier_rate_manage_finance_own_outlet on public.payroll_tier_rates for all to authenticated using (outlet_id = public.current_outlet_id() and public.current_app_role() = 'finance') with check (outlet_id = public.current_outlet_id() and public.current_app_role() = 'finance');
create policy tier_rate_history_select_own_outlet on public.payroll_tier_rate_history for select to authenticated using (outlet_id = public.current_outlet_id());
create policy tier_rate_history_manage_finance_own_outlet on public.payroll_tier_rate_history for all to authenticated using (outlet_id = public.current_outlet_id() and public.current_app_role() = 'finance') with check (outlet_id = public.current_outlet_id() and public.current_app_role() = 'finance');

create policy senior_plus_rate_select_own_outlet on public.payroll_senior_plus_rates for select to authenticated using (outlet_id = public.current_outlet_id());
create policy senior_plus_rate_manage_finance_own_outlet on public.payroll_senior_plus_rates for all to authenticated using (outlet_id = public.current_outlet_id() and public.current_app_role() = 'finance') with check (outlet_id = public.current_outlet_id() and public.current_app_role() = 'finance');
create policy senior_plus_rate_history_select_own_outlet on public.payroll_senior_plus_rate_history for select to authenticated using (outlet_id = public.current_outlet_id());
create policy senior_plus_rate_history_manage_finance_own_outlet on public.payroll_senior_plus_rate_history for all to authenticated using (outlet_id = public.current_outlet_id() and public.current_app_role() = 'finance') with check (outlet_id = public.current_outlet_id() and public.current_app_role() = 'finance');

create policy crew_payroll_status_select_own_outlet on public.crew_payroll_status for select to authenticated using (outlet_id = public.current_outlet_id() and (user_id = auth.uid() or public.current_app_role() = 'finance'));
create policy crew_payroll_status_manage_finance_own_outlet on public.crew_payroll_status for all to authenticated using (outlet_id = public.current_outlet_id() and public.current_app_role() = 'finance') with check (outlet_id = public.current_outlet_id() and public.current_app_role() = 'finance');
create policy crew_payroll_history_select_own_outlet on public.crew_payroll_tier_history for select to authenticated using (outlet_id = public.current_outlet_id() and (user_id = auth.uid() or public.current_app_role() = 'finance'));
create policy crew_payroll_history_manage_finance_own_outlet on public.crew_payroll_tier_history for all to authenticated using (outlet_id = public.current_outlet_id() and public.current_app_role() = 'finance') with check (outlet_id = public.current_outlet_id() and public.current_app_role() = 'finance');

create policy payroll_period_select_own_outlet on public.payroll_periods for select to authenticated using (outlet_id = public.current_outlet_id());
create policy payroll_period_manage_finance_own_outlet on public.payroll_periods for all to authenticated using (outlet_id = public.current_outlet_id() and public.current_app_role() = 'finance') with check (outlet_id = public.current_outlet_id() and public.current_app_role() = 'finance');
