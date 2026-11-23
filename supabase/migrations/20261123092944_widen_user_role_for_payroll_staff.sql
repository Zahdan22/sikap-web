-- `payroll_staff` is an application permission, not merely a display label.
-- It is longer than the legacy varchar(10) used before Owner payroll accounts
-- existed, so profile creation previously failed after Auth had created the
-- user. Keep the role column wide enough for stable permission names.
alter table public.users
  alter column role type varchar(32);
