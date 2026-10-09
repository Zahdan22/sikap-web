begin;

create unique index if not exists users_single_finance_manager_idx
  on public.users (role) where role = 'finance';

alter table public.payroll_periods
  add column if not exists finalized_by uuid references public.users(id) on delete set null;

create or replace function public.is_finance_manager()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.users where id = auth.uid() and role = 'finance');
$$;
revoke all on function public.is_finance_manager() from public;
grant execute on function public.is_finance_manager() to authenticated;

drop policy if exists "Finance can read crew profiles for payroll" on public.users;
create policy "Finance can read crew profiles for payroll"
  on public.users for select to authenticated
  using (public.is_finance_manager() and role = 'crew');

drop policy if exists "Finance can read schedules for payroll" on public.schedule;
create policy "Finance can read schedules for payroll"
  on public.schedule for select to authenticated
  using (public.is_finance_manager() and user_id is not null);

drop policy if exists "Finance can read attendance for payroll" on public.attendance;
create policy "Finance can read attendance for payroll"
  on public.attendance for select to authenticated
  using (public.is_finance_manager());

-- Use the security-definer role check in payroll policies so they do not
-- depend on users-table policy recursion or broader profile visibility.
drop policy if exists "Finance can read tier rates" on public.payroll_tier_rates;
create policy "Finance can read tier rates"
  on public.payroll_tier_rates for select to authenticated
  using (public.is_finance_manager());

drop policy if exists "Finance can read senior plus rates" on public.payroll_senior_plus_rates;
create policy "Finance can read senior plus rates"
  on public.payroll_senior_plus_rates for select to authenticated
  using (public.is_finance_manager());

drop policy if exists "Crew can read own payroll tier and finance can manage all" on public.crew_payroll_status;
create policy "Crew can read own payroll tier and finance can manage all"
  on public.crew_payroll_status for select to authenticated
  using (user_id = auth.uid() or public.is_finance_manager());

drop policy if exists "Finance can manage crew payroll status" on public.crew_payroll_status;
create policy "Finance can manage crew payroll status"
  on public.crew_payroll_status for all to authenticated
  using (public.is_finance_manager()) with check (public.is_finance_manager());

drop policy if exists "Finance can manage payroll periods" on public.payroll_periods;
drop policy if exists "Finance can read payroll periods" on public.payroll_periods;
drop policy if exists "Finance can create payroll periods" on public.payroll_periods;
drop policy if exists "Finance can update draft payroll periods" on public.payroll_periods;
drop policy if exists "Finance can delete draft payroll periods" on public.payroll_periods;
create policy "Finance can read payroll periods"
  on public.payroll_periods for select to authenticated using (public.is_finance_manager());
create policy "Finance can create payroll periods"
  on public.payroll_periods for insert to authenticated with check (public.is_finance_manager());
create policy "Finance can update draft payroll periods"
  on public.payroll_periods for update to authenticated
  using (public.is_finance_manager() and status = 'draft')
  with check (public.is_finance_manager());
create policy "Finance can delete draft payroll periods"
  on public.payroll_periods for delete to authenticated
  using (public.is_finance_manager() and status = 'draft');

drop policy if exists "Finance can manage payroll items" on public.payroll_items;
drop policy if exists "Finance can read payroll items" on public.payroll_items;
drop policy if exists "Finance can insert draft payroll items" on public.payroll_items;
drop policy if exists "Finance can update draft payroll items" on public.payroll_items;
drop policy if exists "Finance can delete draft payroll items" on public.payroll_items;
create policy "Finance can read payroll items"
  on public.payroll_items for select to authenticated using (public.is_finance_manager());
create policy "Finance can insert draft payroll items"
  on public.payroll_items for insert to authenticated
  with check (public.is_finance_manager() and exists (
    select 1 from public.payroll_periods p where p.id = payroll_period_id and p.status = 'draft'
  ));
create policy "Finance can update draft payroll items"
  on public.payroll_items for update to authenticated
  using (public.is_finance_manager() and exists (
    select 1 from public.payroll_periods p where p.id = payroll_period_id and p.status = 'draft'
  ))
  with check (public.is_finance_manager() and exists (
    select 1 from public.payroll_periods p where p.id = payroll_period_id and p.status = 'draft'
  ));
create policy "Finance can delete draft payroll items"
  on public.payroll_items for delete to authenticated
  using (public.is_finance_manager() and exists (
    select 1 from public.payroll_periods p where p.id = payroll_period_id and p.status = 'draft'
  ));

drop policy if exists "Finance can manage payroll adjustments" on public.payroll_adjustments;
drop policy if exists "Finance can read payroll adjustments" on public.payroll_adjustments;
drop policy if exists "Finance can insert draft payroll adjustments" on public.payroll_adjustments;
drop policy if exists "Finance can update draft payroll adjustments" on public.payroll_adjustments;
drop policy if exists "Finance can delete draft payroll adjustments" on public.payroll_adjustments;
create policy "Finance can read payroll adjustments"
  on public.payroll_adjustments for select to authenticated using (public.is_finance_manager());
create policy "Finance can insert draft payroll adjustments"
  on public.payroll_adjustments for insert to authenticated
  with check (public.is_finance_manager() and exists (
    select 1 from public.payroll_periods p where p.id = payroll_period_id and p.status = 'draft'
  ));
create policy "Finance can update draft payroll adjustments"
  on public.payroll_adjustments for update to authenticated
  using (public.is_finance_manager() and exists (
    select 1 from public.payroll_periods p where p.id = payroll_period_id and p.status = 'draft'
  ))
  with check (public.is_finance_manager() and exists (
    select 1 from public.payroll_periods p where p.id = payroll_period_id and p.status = 'draft'
  ));
create policy "Finance can delete draft payroll adjustments"
  on public.payroll_adjustments for delete to authenticated
  using (public.is_finance_manager() and exists (
    select 1 from public.payroll_periods p where p.id = payroll_period_id and p.status = 'draft'
  ));

-- Tier snapshots make historical payroll calculations stable when a crew is
-- promoted or when finance applies a manual Senior+ change later.
create table if not exists public.crew_payroll_tier_history (
  id bigint generated by default as identity primary key,
  user_id uuid not null references public.users(id) on delete restrict,
  tier text not null references public.payroll_tier_rates(tier) on update cascade on delete restrict,
  senior_plus_level smallint not null default 0 check (senior_plus_level between 0 and 5),
  effective_on date not null,
  changed_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (tier = 'senior' or senior_plus_level = 0)
);

create index if not exists crew_payroll_tier_history_user_effective_idx
  on public.crew_payroll_tier_history (user_id, effective_on, id);

insert into public.crew_payroll_tier_history
  (user_id, tier, senior_plus_level, effective_on, changed_by)
select s.user_id, s.tier, s.senior_plus_level, (now() at time zone 'Asia/Jakarta')::date, s.updated_by
from public.crew_payroll_status s
where not exists (
  select 1 from public.crew_payroll_tier_history h where h.user_id = s.user_id
);

create or replace function public.record_crew_payroll_tier_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.crew_payroll_tier_history
      (user_id, tier, senior_plus_level, effective_on, changed_by)
    values
      (new.user_id, new.tier, new.senior_plus_level, (now() at time zone 'Asia/Jakarta')::date, new.updated_by);
  elsif new.tier is distinct from old.tier
     or new.senior_plus_level is distinct from old.senior_plus_level then
    insert into public.crew_payroll_tier_history
      (user_id, tier, senior_plus_level, effective_on, changed_by)
    values
      (new.user_id, new.tier, new.senior_plus_level, (now() at time zone 'Asia/Jakarta')::date, new.updated_by);
  end if;
  return new;
end;
$$;

drop trigger if exists crew_payroll_status_history on public.crew_payroll_status;
create trigger crew_payroll_status_history
after insert or update of tier, senior_plus_level on public.crew_payroll_status
for each row execute function public.record_crew_payroll_tier_history();

-- Completed workday means an assigned schedule with both attendance timestamps.
-- Promotion is effective the following calendar day so the shift just completed
-- remains paid at the tier held when that shift began.
create or replace function public.advance_crew_payroll_tier_after_checkout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status public.crew_payroll_status%rowtype;
  threshold integer;
  next_tier text;
begin
  if old.jam_pulang_aktual is not null
     or new.jam_pulang_aktual is null
     or new.jam_masuk_aktual is null
     or not exists (
       select 1 from public.schedule s
       where s.id = new.schedule_id and s.user_id = new.user_id
     ) then
    return new;
  end if;

  begin
  select * into current_status
  from public.crew_payroll_status
  where user_id = new.user_id
  for update;

  if not found or current_status.tier = 'senior' then
    return new;
  end if;

  select work_days_to_next_tier into threshold
  from public.payroll_tier_rates
  where tier = current_status.tier;

  if threshold is null then
    return new;
  end if;

  if current_status.completed_days_in_tier + 1 >= threshold then
    next_tier := case current_status.tier
      when 'pra_training' then 'training'
      when 'training' then 'junior'
      when 'junior' then 'senior'
      else current_status.tier
    end;

    update public.crew_payroll_status
    set tier = next_tier,
        completed_days_in_tier = 0,
        senior_plus_level = 0,
        updated_by = null,
        updated_at = now()
    where user_id = new.user_id;

    update public.crew_payroll_tier_history
    set effective_on = coalesce(
      (select s.tanggal + 1 from public.schedule s where s.id = new.schedule_id),
      (now() at time zone 'Asia/Jakarta')::date + 1
    )
    where id = (
      select h.id from public.crew_payroll_tier_history h
      where h.user_id = new.user_id
      order by h.id desc limit 1
    );
  else
    update public.crew_payroll_status
    set completed_days_in_tier = completed_days_in_tier + 1,
        updated_at = now()
    where user_id = new.user_id;
  end if;
  exception when others then
    -- Keep a successfully recorded check-out successful if payroll metadata
    -- needs repair; the warning remains visible in the Postgres logs.
    raise warning 'Payroll tier progression skipped for attendance %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists attendance_advances_payroll_tier on public.attendance;
create trigger attendance_advances_payroll_tier
after update of jam_pulang_aktual on public.attendance
for each row execute function public.advance_crew_payroll_tier_after_checkout();

alter table public.crew_payroll_tier_history enable row level security;
grant select on public.crew_payroll_tier_history to authenticated;
grant usage, select on sequence public.crew_payroll_tier_history_id_seq to authenticated;

drop policy if exists "Crew can read own tier history and finance can read all"
  on public.crew_payroll_tier_history;
create policy "Crew can read own tier history and finance can read all"
  on public.crew_payroll_tier_history for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_finance_manager()
  );

commit;
