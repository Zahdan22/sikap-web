-- Keep the same authorization rules, but evaluate session identity once per
-- query instead of once for every returned row.  These are high-traffic
-- tables used by attendance, shift swaps, meal allowance, and payroll.

drop policy if exists crew_payroll_status_select_own_outlet on public.crew_payroll_status;
create policy crew_payroll_status_select_own_outlet on public.crew_payroll_status
  for select to authenticated
  using (
    outlet_id = (select public.current_outlet_id())
    and (
      user_id = (select auth.uid())
      or (select public.current_app_role()) = 'finance'
    )
  );

drop policy if exists crew_payroll_history_select_own_outlet on public.crew_payroll_tier_history;
create policy crew_payroll_history_select_own_outlet on public.crew_payroll_tier_history
  for select to authenticated
  using (
    outlet_id = (select public.current_outlet_id())
    and (
      user_id = (select auth.uid())
      or (select public.current_app_role()) = 'finance'
    )
  );

drop policy if exists overtime_select_own_outlet on public.overtime_requests;
create policy overtime_select_own_outlet on public.overtime_requests
  for select to authenticated
  using (
    outlet_id = (select public.current_outlet_id())
    and (
      user_id = (select auth.uid())
      or (select public.current_app_role()) in ('manager', 'finance')
    )
  );

drop policy if exists shift_swap_select_own_outlet on public.shift_swap_request;
create policy shift_swap_select_own_outlet on public.shift_swap_request
  for select to authenticated
  using (
    outlet_id = (select public.current_outlet_id())
    and (
      requester_id = (select auth.uid())
      or target_id = (select auth.uid())
      or (select public.current_app_role()) = 'manager'
    )
  );

drop policy if exists leave_select_own_outlet on public.leave_request;
create policy leave_select_own_outlet on public.leave_request
  for select to authenticated
  using (
    outlet_id = (select public.current_outlet_id())
    and (
      user_id = (select auth.uid())
      or (select public.current_app_role()) = 'manager'
    )
  );

drop policy if exists meal_claim_select_own_outlet on public.meal_allowance_claims;
create policy meal_claim_select_own_outlet on public.meal_allowance_claims
  for select to authenticated
  using (
    outlet_id = (select public.current_outlet_id())
    and (
      user_id = (select auth.uid())
      or (select public.current_app_role()) = 'finance'
    )
  );

drop policy if exists attendance_select_own_outlet on public.attendance;
create policy attendance_select_own_outlet on public.attendance
  for select to authenticated
  using (
    exists (
      select 1 from public.schedule schedule
      where schedule.id = attendance.schedule_id
        and schedule.outlet_id = (select public.current_outlet_id())
    )
    and (
      user_id = (select auth.uid())
      or (select public.current_app_role()) in ('manager', 'finance')
    )
  );

drop policy if exists corrections_select_own_outlet on public.attendance_corrections;
create policy corrections_select_own_outlet on public.attendance_corrections
  for select to authenticated
  using (
    exists (
      select 1 from public.users user_profile
      where user_profile.id = attendance_corrections.user_id
        and user_profile.outlet_id = (select public.current_outlet_id())
    )
    and (
      user_id = (select auth.uid())
      or (select public.current_app_role()) in ('manager', 'finance')
    )
  );

-- Targeted indexes for the attendance history and payroll lookups that run
-- most often.  Existing business rules and stored values are unchanged.
create index if not exists attendance_user_id_idx on public.attendance(user_id);
create index if not exists crew_payroll_status_outlet_user_idx on public.crew_payroll_status(outlet_id, user_id);
create index if not exists crew_payroll_tier_history_outlet_effective_user_idx
  on public.crew_payroll_tier_history(outlet_id, effective_on, user_id, id);
