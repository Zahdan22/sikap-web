-- Close the remaining legacy paths that could cross the outlet boundary.
-- These policies and triggers protect the database itself, including calls made
-- directly through the Data API.  Tjap Djajakarta and Warkop DKI therefore do
-- not rely only on UI filtering or server-action checks.

create or replace function private.actor_can_access_outlet(p_outlet_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.users actor
    where actor.id = (select auth.uid())
      and actor.status_aktif
      and (actor.role = 'owner' or actor.outlet_id = p_outlet_id)
  );
$$;

create or replace function private.actor_can_read_own_payroll_member(
  p_payroll_period_id bigint,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.users actor
    join public.payroll_periods period on period.id = p_payroll_period_id
    where actor.id = (select auth.uid())
      and actor.id = p_user_id
      and actor.status_aktif
      and actor.outlet_id = period.outlet_id
  );
$$;

create or replace function private.actor_can_read_finance_payroll_member(
  p_payroll_period_id bigint,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.users actor
    join public.payroll_periods period on period.id = p_payroll_period_id
    join public.users subject on subject.id = p_user_id
    where actor.id = (select auth.uid())
      and actor.status_aktif
      and actor.role = 'finance'
      and actor.outlet_id = period.outlet_id
      and subject.outlet_id = period.outlet_id
  );
$$;

create or replace function private.actor_can_manage_draft_payroll_member(
  p_payroll_period_id bigint,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.users actor
    join public.payroll_periods period on period.id = p_payroll_period_id
    join public.users subject on subject.id = p_user_id
    where actor.id = (select auth.uid())
      and actor.status_aktif
      and actor.role = 'finance'
      and actor.outlet_id = period.outlet_id
      and subject.outlet_id = period.outlet_id
      and period.status = 'draft'
  );
$$;

create or replace function private.storage_object_is_in_current_outlet(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.users actor
    join public.users object_owner
      on object_owner.id::text = coalesce((storage.foldername(p_object_name))[1], '')
    where actor.id = (select auth.uid())
      and actor.status_aktif
      and object_owner.outlet_id = actor.outlet_id
  );
$$;

-- No helper can be invoked outside an authenticated policy evaluation.
revoke all on function private.actor_can_access_outlet(uuid) from public, anon;
revoke all on function private.actor_can_read_own_payroll_member(bigint, uuid) from public, anon;
revoke all on function private.actor_can_read_finance_payroll_member(bigint, uuid) from public, anon;
revoke all on function private.actor_can_manage_draft_payroll_member(bigint, uuid) from public, anon;
revoke all on function private.storage_object_is_in_current_outlet(text) from public, anon;
grant execute on function private.actor_can_access_outlet(uuid) to authenticated;
grant execute on function private.actor_can_read_own_payroll_member(bigint, uuid) to authenticated;
grant execute on function private.actor_can_read_finance_payroll_member(bigint, uuid) to authenticated;
grant execute on function private.actor_can_manage_draft_payroll_member(bigint, uuid) to authenticated;
grant execute on function private.storage_object_is_in_current_outlet(text) to authenticated;

-- Prevent malformed or service-role writes from associating a payroll detail
-- with a crew member from another outlet.
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

  if tg_table_name = 'payroll_adjustments' and new.attendance_id is not null
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

  return new;
end;
$$;

create or replace function private.assert_schedule_jobdesk_matches_outlet()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  schedule_outlet_id uuid;
  jobdesk_outlet_id uuid;
begin
  select schedule.outlet_id, jobdesk.outlet_id
    into schedule_outlet_id, jobdesk_outlet_id
  from public.schedule schedule
  join public.jobdesk jobdesk on jobdesk.id = new.jobdesk_id
  where schedule.id = new.schedule_id;

  if schedule_outlet_id is null or jobdesk_outlet_id is null
     or schedule_outlet_id is distinct from jobdesk_outlet_id then
    raise exception 'Jobdesk must belong to the same outlet as its schedule';
  end if;

  return new;
end;
$$;

revoke all on function private.assert_payroll_member_matches_period() from public, anon, authenticated;
revoke all on function private.assert_schedule_jobdesk_matches_outlet() from public, anon, authenticated;

drop trigger if exists payroll_items_same_outlet on public.payroll_items;
create trigger payroll_items_same_outlet
  before insert or update of payroll_period_id, user_id on public.payroll_items
  for each row execute function private.assert_payroll_member_matches_period();

drop trigger if exists payroll_adjustments_same_outlet on public.payroll_adjustments;
create trigger payroll_adjustments_same_outlet
  before insert or update of payroll_period_id, user_id, attendance_id on public.payroll_adjustments
  for each row execute function private.assert_payroll_member_matches_period();

drop trigger if exists crew_payroll_manual_components_same_outlet on public.crew_payroll_manual_components;
create trigger crew_payroll_manual_components_same_outlet
  before insert or update of payroll_period_id, user_id on public.crew_payroll_manual_components
  for each row execute function private.assert_payroll_member_matches_period();

drop trigger if exists crew_management_titles_same_outlet on public.crew_management_titles;
create trigger crew_management_titles_same_outlet
  before insert or update of payroll_period_id, user_id on public.crew_management_titles
  for each row execute function private.assert_payroll_member_matches_period();

drop trigger if exists schedule_jobdesk_same_outlet on public.schedule_jobdesk;
create trigger schedule_jobdesk_same_outlet
  before insert or update of schedule_id, jobdesk_id on public.schedule_jobdesk
  for each row execute function private.assert_schedule_jobdesk_matches_outlet();

drop trigger if exists schedule_jobdesk_block_same_outlet on public.schedule_jobdesk_block;
create trigger schedule_jobdesk_block_same_outlet
  before insert or update of schedule_id, jobdesk_id on public.schedule_jobdesk_block
  for each row execute function private.assert_schedule_jobdesk_matches_outlet();

-- Schedule jobdesk rows must always inherit the outlet from their parent
-- schedule.  A manager cannot read or modify another outlet's records.
drop policy if exists sj_select_all_authenticated on public.schedule_jobdesk;
drop policy if exists sj_write_manager on public.schedule_jobdesk;
create policy schedule_jobdesk_select_own_outlet on public.schedule_jobdesk
  for select to authenticated
  using (
    private.is_active_user()
    and exists (
      select 1 from public.schedule schedule
      where schedule.id = schedule_jobdesk.schedule_id
        and schedule.outlet_id = (select public.current_outlet_id())
    )
  );
create policy schedule_jobdesk_manage_manager_own_outlet on public.schedule_jobdesk
  for all to authenticated
  using (
    (select public.current_app_role()) = 'manager'
    and exists (
      select 1 from public.schedule schedule
      where schedule.id = schedule_jobdesk.schedule_id
        and schedule.outlet_id = (select public.current_outlet_id())
    )
  )
  with check (
    (select public.current_app_role()) = 'manager'
    and exists (
      select 1 from public.schedule schedule
      where schedule.id = schedule_jobdesk.schedule_id
        and schedule.outlet_id = (select public.current_outlet_id())
    )
  );

drop policy if exists "Crew and managers can read schedule jobdesk blocks" on public.schedule_jobdesk_block;
drop policy if exists "Managers can manage schedule jobdesk blocks" on public.schedule_jobdesk_block;
create policy schedule_jobdesk_blocks_select_own_outlet on public.schedule_jobdesk_block
  for select to authenticated
  using (
    exists (
      select 1 from public.schedule schedule
      where schedule.id = schedule_jobdesk_block.schedule_id
        and schedule.outlet_id = (select public.current_outlet_id())
        and (
          (select public.current_app_role()) = 'manager'
          or (private.is_active_user() and schedule.user_id = (select auth.uid()))
        )
    )
  );
create policy schedule_jobdesk_blocks_manage_manager_own_outlet on public.schedule_jobdesk_block
  for all to authenticated
  using (
    (select public.current_app_role()) = 'manager'
    and exists (
      select 1 from public.schedule schedule
      where schedule.id = schedule_jobdesk_block.schedule_id
        and schedule.outlet_id = (select public.current_outlet_id())
    )
  )
  with check (
    (select public.current_app_role()) = 'manager'
    and exists (
      select 1 from public.schedule schedule
      where schedule.id = schedule_jobdesk_block.schedule_id
        and schedule.outlet_id = (select public.current_outlet_id())
    )
  );

-- Payroll details inherit their outlet from the payroll period.  Finance can
-- access only its own outlet, and crew can only read their own row.
drop policy if exists "Crew can read own payroll items" on public.payroll_items;
drop policy if exists "Finance can delete draft payroll items" on public.payroll_items;
drop policy if exists "Finance can insert draft payroll items" on public.payroll_items;
drop policy if exists "Finance can read payroll items" on public.payroll_items;
drop policy if exists "Finance can update draft payroll items" on public.payroll_items;
create policy payroll_items_read_own_row on public.payroll_items
  for select to authenticated
  using (private.actor_can_read_own_payroll_member(payroll_period_id, user_id));
create policy payroll_items_read_finance_own_outlet on public.payroll_items
  for select to authenticated
  using (private.actor_can_read_finance_payroll_member(payroll_period_id, user_id));
create policy payroll_items_manage_finance_draft_own_outlet on public.payroll_items
  for all to authenticated
  using (private.actor_can_manage_draft_payroll_member(payroll_period_id, user_id))
  with check (private.actor_can_manage_draft_payroll_member(payroll_period_id, user_id));

drop policy if exists "Finance can delete draft payroll adjustments" on public.payroll_adjustments;
drop policy if exists "Finance can insert draft payroll adjustments" on public.payroll_adjustments;
drop policy if exists "Finance can read payroll adjustments" on public.payroll_adjustments;
drop policy if exists "Finance can update draft payroll adjustments" on public.payroll_adjustments;
create policy payroll_adjustments_read_finance_own_outlet on public.payroll_adjustments
  for select to authenticated
  using (private.actor_can_read_finance_payroll_member(payroll_period_id, user_id));
create policy payroll_adjustments_manage_finance_draft_own_outlet on public.payroll_adjustments
  for all to authenticated
  using (private.actor_can_manage_draft_payroll_member(payroll_period_id, user_id))
  with check (private.actor_can_manage_draft_payroll_member(payroll_period_id, user_id));

drop policy if exists "Crew can read own manual payroll components" on public.crew_payroll_manual_components;
drop policy if exists "Finance can delete draft manual payroll components" on public.crew_payroll_manual_components;
drop policy if exists "Finance can insert draft manual payroll components" on public.crew_payroll_manual_components;
drop policy if exists "Finance can read manual payroll components" on public.crew_payroll_manual_components;
drop policy if exists "Finance can update draft manual payroll components" on public.crew_payroll_manual_components;
create policy crew_payroll_components_read_own_row on public.crew_payroll_manual_components
  for select to authenticated
  using (private.actor_can_read_own_payroll_member(payroll_period_id, user_id));
create policy crew_payroll_components_read_finance_own_outlet on public.crew_payroll_manual_components
  for select to authenticated
  using (private.actor_can_read_finance_payroll_member(payroll_period_id, user_id));
create policy crew_payroll_components_manage_finance_draft_own_outlet on public.crew_payroll_manual_components
  for all to authenticated
  using (private.actor_can_manage_draft_payroll_member(payroll_period_id, user_id))
  with check (private.actor_can_manage_draft_payroll_member(payroll_period_id, user_id));

drop policy if exists "Crew can read own management titles" on public.crew_management_titles;
drop policy if exists "Finance can delete draft crew management titles" on public.crew_management_titles;
drop policy if exists "Finance can insert draft crew management titles" on public.crew_management_titles;
drop policy if exists "Finance can read crew management titles" on public.crew_management_titles;
drop policy if exists "Finance can update draft crew management titles" on public.crew_management_titles;
create policy crew_management_titles_read_own_row on public.crew_management_titles
  for select to authenticated
  using (private.actor_can_read_own_payroll_member(payroll_period_id, user_id));
create policy crew_management_titles_read_finance_own_outlet on public.crew_management_titles
  for select to authenticated
  using (private.actor_can_read_finance_payroll_member(payroll_period_id, user_id));
create policy crew_management_titles_manage_finance_draft_own_outlet on public.crew_management_titles
  for all to authenticated
  using (private.actor_can_manage_draft_payroll_member(payroll_period_id, user_id))
  with check (private.actor_can_manage_draft_payroll_member(payroll_period_id, user_id));

-- This predecessor is no longer read by the application.  It has no outlet
-- key, so denying direct client access is the only safe compatibility mode.
drop policy if exists office_select_all on public.office_location;
drop policy if exists office_write_manager on public.office_location;

-- Private photos use the folder's crew UUID as their owner.  Staff may view
-- only files whose owner belongs to the same outlet; owners retain deliberate
-- company-wide oversight.
drop policy if exists "Finance can view attendance photos" on storage.objects;
drop policy if exists select_own_photo_or_manager on storage.objects;
create policy attendance_photos_read_own_or_scoped_staff on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attendance-photos'
    and (
      (private.is_active_user() and coalesce((storage.foldername(name))[1], '') = (select auth.uid())::text)
      or (select public.current_app_role()) = 'owner'
      or (
        (select public.current_app_role()) in ('manager', 'finance')
        and private.storage_object_is_in_current_outlet(name)
      )
    )
  );

drop policy if exists select_own_bukti_izin_or_manager on storage.objects;
create policy leave_attachments_read_own_or_scoped_staff on storage.objects
  for select to authenticated
  using (
    bucket_id = 'leave-attachments'
    and (
      (private.is_active_user() and coalesce((storage.foldername(name))[1], '') = (select auth.uid())::text)
      or (select public.current_app_role()) = 'owner'
      or (
        (select public.current_app_role()) = 'manager'
        and private.storage_object_is_in_current_outlet(name)
      )
    )
  );
