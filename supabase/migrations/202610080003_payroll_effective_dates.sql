begin;

alter table public.crew_payroll_status
  add column if not exists effective_on date not null
  default ((now() at time zone 'Asia/Jakarta')::date);

-- Finance may choose the date an existing crew member entered the recorded
-- tier. New accounts still begin at their account creation date.
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
      (new.user_id, new.tier, new.senior_plus_level, new.effective_on, new.updated_by);
  elsif new.tier is distinct from old.tier
     or new.senior_plus_level is distinct from old.senior_plus_level
     or new.effective_on is distinct from old.effective_on then
    insert into public.crew_payroll_tier_history
      (user_id, tier, senior_plus_level, effective_on, changed_by)
    values
      (new.user_id, new.tier, new.senior_plus_level, new.effective_on, new.updated_by);
  end if;
  return new;
end;
$$;

drop trigger if exists crew_payroll_status_history on public.crew_payroll_status;
create trigger crew_payroll_status_history
after insert or update of tier, senior_plus_level, effective_on on public.crew_payroll_status
for each row execute function public.record_crew_payroll_tier_history();

-- Future work-period choices mirror the report page's read-only period list.
drop policy if exists "Finance can read work periods" on public.periode_kerja;
create policy "Finance can read work periods"
  on public.periode_kerja for select to authenticated
  using (public.is_finance_manager());

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
  next_effective_on date;
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
      select coalesce(s.tanggal + 1, (now() at time zone 'Asia/Jakarta')::date + 1)
        into next_effective_on
      from public.schedule s where s.id = new.schedule_id;
      next_effective_on := coalesce(next_effective_on, (now() at time zone 'Asia/Jakarta')::date + 1);

      update public.crew_payroll_status
      set tier = next_tier,
          completed_days_in_tier = 0,
          senior_plus_level = 0,
          effective_on = next_effective_on,
          updated_by = null,
          updated_at = now()
      where user_id = new.user_id;
    else
      update public.crew_payroll_status
      set completed_days_in_tier = completed_days_in_tier + 1,
          updated_at = now()
      where user_id = new.user_id;
    end if;
  exception when others then
    -- Payroll tracking must not turn a successfully recorded checkout into a
    -- failed attendance transaction. The repairable issue is logged instead.
    raise warning 'Payroll tier progression skipped for attendance %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

commit;
