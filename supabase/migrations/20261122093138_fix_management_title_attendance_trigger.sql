-- This trigger protects several payroll-detail tables. Only payroll
-- adjustments have an attendance_id; management-title rows do not. Keep the
-- common crew/period outlet check for every table, then run the attendance
-- check exclusively for payroll adjustments.
create or replace function private.assert_payroll_member_matches_period()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  period_outlet_id uuid;
  subject_outlet_id uuid;
begin
  select period.outlet_id, subject.outlet_id
    into period_outlet_id, subject_outlet_id
  from public.payroll_periods period
  join public.users subject on subject.id = new.user_id
  where period.id = new.payroll_period_id;

  if period_outlet_id is null or subject_outlet_id is null
     or period_outlet_id is distinct from subject_outlet_id then
    raise exception 'Payroll record must use a crew member from the same outlet as its payroll period';
  end if;

  if tg_table_name = 'payroll_adjustments' then
    if new.attendance_id is not null
       and not exists (
         select 1
         from public.attendance attendance
         join public.schedule schedule on schedule.id = attendance.schedule_id
         where attendance.id = new.attendance_id
           and attendance.user_id = new.user_id
           and schedule.outlet_id = period_outlet_id
       ) then
      raise exception 'Payroll adjustment attendance must belong to the same crew member and outlet';
    end if;
  end if;

  return new;
end;
$$;
