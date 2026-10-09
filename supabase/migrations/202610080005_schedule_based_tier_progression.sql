begin;

-- Tier progress is a workday count from assigned schedules, regardless of
-- attendance. Keep one credited record per crew and scheduled date.
create table if not exists public.crew_payroll_counted_workdays (
  user_id uuid not null references public.users(id) on delete cascade,
  work_date date not null,
  schedule_id integer not null references public.schedule(id) on delete cascade,
  counted_at timestamptz not null default now(),
  primary key (user_id, work_date),
  unique (schedule_id)
);

alter table public.crew_payroll_counted_workdays enable row level security;
revoke all on public.crew_payroll_counted_workdays from anon, authenticated;

-- Existing complete attendance rows were already credited by the old
-- checkout trigger; seed them to prevent counting them twice.
insert into public.crew_payroll_counted_workdays (user_id, work_date, schedule_id)
select distinct on (s.user_id, s.tanggal) s.user_id, s.tanggal, s.id
from public.schedule s
join public.attendance a on a.schedule_id = s.id and a.user_id = s.user_id
where s.user_id is not null
  and a.jam_masuk_aktual is not null
  and a.jam_pulang_aktual is not null
order by s.user_id, s.tanggal, s.id
on conflict do nothing;

drop trigger if exists attendance_advances_payroll_tier on public.attendance;

create or replace function public.sync_crew_payroll_tier_progress()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_status public.crew_payroll_status%rowtype;
  workday record;
  threshold integer;
  next_tier text;
  today_jakarta date := (now() at time zone 'Asia/Jakarta')::date;
begin
  if not public.is_finance_manager() then
    raise exception 'Finance manager access required';
  end if;

  for current_status in
    select * from public.crew_payroll_status order by user_id for update
  loop
    for workday in
      select s.id as schedule_id, s.user_id, s.tanggal
      from public.schedule s
      where s.user_id = current_status.user_id
        and s.tanggal >= current_status.effective_on
        and s.tanggal <= today_jakarta
      order by s.tanggal, s.id
    loop
      insert into public.crew_payroll_counted_workdays (user_id, work_date, schedule_id)
      values (workday.user_id, workday.tanggal, workday.schedule_id)
      on conflict do nothing;
      if not found then
        continue;
      end if;

      select * into current_status
      from public.crew_payroll_status
      where user_id = workday.user_id
      for update;
      if current_status.tier = 'senior' or workday.tanggal < current_status.effective_on then
        continue;
      end if;

      select work_days_to_next_tier into threshold
      from public.payroll_tier_rates where tier = current_status.tier;
      if threshold is null then
        continue;
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
            effective_on = workday.tanggal + 1,
            updated_by = null,
            updated_at = now()
        where user_id = workday.user_id;
      else
        update public.crew_payroll_status
        set completed_days_in_tier = completed_days_in_tier + 1,
            updated_at = now()
        where user_id = workday.user_id;
      end if;
    end loop;
  end loop;
end;
$$;

revoke all on function public.sync_crew_payroll_tier_progress() from public, anon;
grant execute on function public.sync_crew_payroll_tier_progress() to authenticated;

commit;
