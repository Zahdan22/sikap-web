-- Admin 2 is unique within an outlet, not across the entire company.
-- This preserves the existing Tjap rule while allowing Warkop DKI to have
-- its own financial manager.
drop index if exists public.users_single_finance_manager_idx;
create unique index users_single_finance_manager_per_outlet_idx
  on public.users(outlet_id)
  where role = 'finance' and status_aktif is true;
