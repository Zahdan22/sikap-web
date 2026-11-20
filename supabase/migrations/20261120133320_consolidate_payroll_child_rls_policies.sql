-- Reading and changing payroll child rows have different authorization rules.
-- Split them by operation so SELECT is evaluated once per table instead of
-- combining a broad ALL policy with additional read policies.

-- payroll_items
drop policy if exists payroll_items_manage_finance_draft_own_outlet on public.payroll_items;
drop policy if exists payroll_items_read_finance_own_outlet on public.payroll_items;
drop policy if exists payroll_items_read_own_row on public.payroll_items;

create policy payroll_items_read_own_outlet
  on public.payroll_items for select to authenticated
  using (
    private.actor_can_read_own_payroll_member(payroll_period_id, user_id)
    or private.actor_can_read_finance_payroll_member(payroll_period_id, user_id)
  );

create policy payroll_items_insert_finance_draft_own_outlet
  on public.payroll_items for insert to authenticated
  with check (private.actor_can_manage_draft_payroll_member(payroll_period_id, user_id));

create policy payroll_items_update_finance_draft_own_outlet
  on public.payroll_items for update to authenticated
  using (private.actor_can_manage_draft_payroll_member(payroll_period_id, user_id))
  with check (private.actor_can_manage_draft_payroll_member(payroll_period_id, user_id));

create policy payroll_items_delete_finance_draft_own_outlet
  on public.payroll_items for delete to authenticated
  using (private.actor_can_manage_draft_payroll_member(payroll_period_id, user_id));

-- payroll_adjustments
drop policy if exists payroll_adjustments_manage_finance_draft_own_outlet on public.payroll_adjustments;
drop policy if exists payroll_adjustments_read_finance_own_outlet on public.payroll_adjustments;

create policy payroll_adjustments_read_finance_own_outlet
  on public.payroll_adjustments for select to authenticated
  using (private.actor_can_read_finance_payroll_member(payroll_period_id, user_id));

create policy payroll_adjustments_insert_finance_draft_own_outlet
  on public.payroll_adjustments for insert to authenticated
  with check (private.actor_can_manage_draft_payroll_member(payroll_period_id, user_id));

create policy payroll_adjustments_update_finance_draft_own_outlet
  on public.payroll_adjustments for update to authenticated
  using (private.actor_can_manage_draft_payroll_member(payroll_period_id, user_id))
  with check (private.actor_can_manage_draft_payroll_member(payroll_period_id, user_id));

create policy payroll_adjustments_delete_finance_draft_own_outlet
  on public.payroll_adjustments for delete to authenticated
  using (private.actor_can_manage_draft_payroll_member(payroll_period_id, user_id));

-- crew_payroll_manual_components
drop policy if exists crew_payroll_components_manage_finance_draft_own_outlet on public.crew_payroll_manual_components;
drop policy if exists crew_payroll_components_read_finance_own_outlet on public.crew_payroll_manual_components;
drop policy if exists crew_payroll_components_read_own_row on public.crew_payroll_manual_components;

create policy crew_payroll_components_read_own_outlet
  on public.crew_payroll_manual_components for select to authenticated
  using (
    private.actor_can_read_own_payroll_member(payroll_period_id, user_id)
    or private.actor_can_read_finance_payroll_member(payroll_period_id, user_id)
  );

create policy crew_payroll_components_insert_finance_draft_own_outlet
  on public.crew_payroll_manual_components for insert to authenticated
  with check (private.actor_can_manage_draft_payroll_member(payroll_period_id, user_id));

create policy crew_payroll_components_update_finance_draft_own_outlet
  on public.crew_payroll_manual_components for update to authenticated
  using (private.actor_can_manage_draft_payroll_member(payroll_period_id, user_id))
  with check (private.actor_can_manage_draft_payroll_member(payroll_period_id, user_id));

create policy crew_payroll_components_delete_finance_draft_own_outlet
  on public.crew_payroll_manual_components for delete to authenticated
  using (private.actor_can_manage_draft_payroll_member(payroll_period_id, user_id));

-- crew_management_titles
drop policy if exists crew_management_titles_manage_finance_draft_own_outlet on public.crew_management_titles;
drop policy if exists crew_management_titles_read_finance_own_outlet on public.crew_management_titles;
drop policy if exists crew_management_titles_read_own_row on public.crew_management_titles;

create policy crew_management_titles_read_own_outlet
  on public.crew_management_titles for select to authenticated
  using (
    private.actor_can_read_own_payroll_member(payroll_period_id, user_id)
    or private.actor_can_read_finance_payroll_member(payroll_period_id, user_id)
  );

create policy crew_management_titles_insert_finance_draft_own_outlet
  on public.crew_management_titles for insert to authenticated
  with check (private.actor_can_manage_draft_payroll_member(payroll_period_id, user_id));

create policy crew_management_titles_update_finance_draft_own_outlet
  on public.crew_management_titles for update to authenticated
  using (private.actor_can_manage_draft_payroll_member(payroll_period_id, user_id))
  with check (private.actor_can_manage_draft_payroll_member(payroll_period_id, user_id));

create policy crew_management_titles_delete_finance_draft_own_outlet
  on public.crew_management_titles for delete to authenticated
  using (private.actor_can_manage_draft_payroll_member(payroll_period_id, user_id));
