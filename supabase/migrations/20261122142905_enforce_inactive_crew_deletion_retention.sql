-- A crew account is retained for two calendar months after it is disabled.
-- The timestamp also lets the app distinguish a reversible deactivation from a
-- deliberate, permanent removal.
alter table public.users
  add column if not exists deactivated_at timestamptz;

-- Older inactive crew did not have a separate timestamp.  Their last profile
-- update is the closest available record of when they were made inactive.
update public.users
set deactivated_at = updated_at
where role = 'crew'
  and status_aktif = false
  and deactivated_at is null;

alter table public.users
  drop constraint if exists users_crew_deactivation_state_check;

alter table public.users
  add constraint users_crew_deactivation_state_check
  check (
    role <> 'crew'
    or (status_aktif = true and deactivated_at is null)
    or (status_aktif = false and deactivated_at is not null)
  );

create index if not exists users_inactive_crew_deactivated_at_idx
  on public.users (outlet_id, deactivated_at)
  where role = 'crew' and status_aktif = false;

-- A permanently removed crew no longer needs their operational/payroll data.
-- These relationships intentionally cascade only when the crew profile itself
-- is removed; the app limits that action to a deactivated crew in the same
-- outlet after the retention window has passed.
alter table public.attendance_correction_events
  drop constraint if exists attendance_correction_events_correction_id_fkey;
alter table public.attendance_correction_events
  add constraint attendance_correction_events_correction_id_fkey
  foreign key (correction_id) references public.attendance_corrections(id) on delete cascade;

alter table public.attendance_corrections
  drop constraint if exists attendance_corrections_user_id_fkey,
  drop constraint if exists attendance_corrections_submitted_by_fkey;
alter table public.attendance_corrections
  add constraint attendance_corrections_user_id_fkey
    foreign key (user_id) references public.users(id) on delete cascade,
  add constraint attendance_corrections_submitted_by_fkey
    foreign key (submitted_by) references public.users(id) on delete cascade;

alter table public.crew_management_titles
  drop constraint if exists crew_management_titles_user_id_fkey;
alter table public.crew_management_titles
  add constraint crew_management_titles_user_id_fkey
  foreign key (user_id) references public.users(id) on delete cascade;

alter table public.crew_payroll_manual_components
  drop constraint if exists crew_payroll_manual_components_user_id_fkey;
alter table public.crew_payroll_manual_components
  add constraint crew_payroll_manual_components_user_id_fkey
  foreign key (user_id) references public.users(id) on delete cascade;

alter table public.crew_payroll_status
  drop constraint if exists crew_payroll_status_user_id_fkey;
alter table public.crew_payroll_status
  add constraint crew_payroll_status_user_id_fkey
  foreign key (user_id) references public.users(id) on delete cascade;

alter table public.crew_payroll_tier_history
  drop constraint if exists crew_payroll_tier_history_user_id_fkey;
alter table public.crew_payroll_tier_history
  add constraint crew_payroll_tier_history_user_id_fkey
  foreign key (user_id) references public.users(id) on delete cascade;

alter table public.crew_violations
  drop constraint if exists crew_violations_user_id_fkey,
  drop constraint if exists crew_violations_created_by_fkey;
alter table public.crew_violations
  add constraint crew_violations_user_id_fkey
    foreign key (user_id) references public.users(id) on delete cascade,
  add constraint crew_violations_created_by_fkey
    foreign key (created_by) references public.users(id) on delete cascade;

alter table public.violation_appeals
  drop constraint if exists violation_appeals_user_id_fkey,
  drop constraint if exists violation_appeals_violation_id_fkey;
alter table public.violation_appeals
  add constraint violation_appeals_user_id_fkey
    foreign key (user_id) references public.users(id) on delete cascade,
  add constraint violation_appeals_violation_id_fkey
    foreign key (violation_id) references public.crew_violations(id) on delete cascade;

alter table public.overtime_requests
  drop constraint if exists overtime_requests_user_id_fkey;
alter table public.overtime_requests
  add constraint overtime_requests_user_id_fkey
  foreign key (user_id) references public.users(id) on delete cascade;

alter table public.payroll_adjustments
  drop constraint if exists payroll_adjustments_user_id_fkey;
alter table public.payroll_adjustments
  add constraint payroll_adjustments_user_id_fkey
  foreign key (user_id) references public.users(id) on delete cascade;

alter table public.payroll_items
  drop constraint if exists payroll_items_user_id_fkey;
alter table public.payroll_items
  add constraint payroll_items_user_id_fkey
  foreign key (user_id) references public.users(id) on delete cascade;
