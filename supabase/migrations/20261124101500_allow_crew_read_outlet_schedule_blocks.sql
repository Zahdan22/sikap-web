-- Crew can already read the daily schedule for their own outlet. Allow the
-- same active crew to read its time-based jobdesk blocks so both schedule
-- views render the exact same timeline, while keeping other outlets isolated.
drop policy if exists schedule_jobdesk_blocks_select_own_outlet on public.schedule_jobdesk_block;

create policy schedule_jobdesk_blocks_select_own_outlet on public.schedule_jobdesk_block
  for select to authenticated
  using (
    private.is_active_user()
    and exists (
      select 1
      from public.schedule schedule
      where schedule.id = schedule_jobdesk_block.schedule_id
        and schedule.outlet_id = (select public.current_outlet_id())
    )
  );
