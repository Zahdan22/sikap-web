-- A new crew profile is created by a server-side manager action. The action
-- provides the crew's outlet, while the service-role client has no session
-- outlet for `current_outlet_id()` to read. Carry the outlet from the profile
-- into its initial payroll status so no cross-outlet default is ever used.
create or replace function public.initialize_crew_payroll_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'crew' then
    if new.outlet_id is null then
      raise exception 'Crew must have an outlet before payroll status is initialized';
    end if;

    insert into public.crew_payroll_status (
      user_id,
      outlet_id,
      tier,
      completed_days_in_tier
    )
    values (
      new.id,
      new.outlet_id,
      'pra_training',
      0
    )
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

-- The history trigger fires immediately after the initial status is inserted,
-- so it must carry the same outlet as well. This also keeps edits from one
-- outlet from ever touching a history row from another outlet.
create or replace function public.record_crew_payroll_tier_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.crew_payroll_tier_history
      (user_id, outlet_id, tier, senior_plus_level, effective_on, changed_by)
    values
      (new.user_id, new.outlet_id, new.tier, new.senior_plus_level, new.effective_on, new.updated_by);
  elsif new.tier is distinct from old.tier
     or new.senior_plus_level is distinct from old.senior_plus_level
     or new.effective_on is distinct from old.effective_on then
    if new.updated_by is not null then
      delete from public.crew_payroll_tier_history
      where user_id = new.user_id
        and outlet_id = new.outlet_id
        and (
          (changed_by is null and effective_on >= new.effective_on)
          or (changed_by is not null and effective_on = new.effective_on)
        );
    end if;

    insert into public.crew_payroll_tier_history
      (user_id, outlet_id, tier, senior_plus_level, effective_on, changed_by)
    values
      (new.user_id, new.outlet_id, new.tier, new.senior_plus_level, new.effective_on, new.updated_by);
  end if;
  return new;
end;
$$;

-- Preserve the legacy checkout progression function's behaviour while making
-- every lookup explicitly outlet-scoped.
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
    select cps.* into current_status
    from public.crew_payroll_status cps
    join public.schedule s on s.id = new.schedule_id
    where cps.user_id = new.user_id
      and cps.outlet_id = s.outlet_id
    for update of cps;

    if not found or current_status.tier = 'senior' then
      return new;
    end if;

    select work_days_to_next_tier into threshold
    from public.payroll_tier_rates
    where outlet_id = current_status.outlet_id
      and tier = current_status.tier;

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
      where user_id = new.user_id
        and outlet_id = current_status.outlet_id;
    else
      update public.crew_payroll_status
      set completed_days_in_tier = completed_days_in_tier + 1,
          updated_at = now()
      where user_id = new.user_id
        and outlet_id = current_status.outlet_id;
    end if;
  exception when others then
    raise warning 'Payroll tier progression skipped for attendance %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;
