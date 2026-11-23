-- Warkop already has its own Senior+ levels, but its Senior tier was seeded
-- without the eligibility flag. Enable it in both the current master and its
-- dated history so the crew-status form and payroll agree for this outlet.
-- The original uniqueness index was global, which incorrectly made Tjap's
-- Senior tier block Warkop's separate Senior tier.
drop index if exists public.payroll_tier_rates_one_active_senior_plus_idx;
create unique index payroll_tier_rates_one_active_senior_plus_idx
  on public.payroll_tier_rates (outlet_id)
  where supports_senior_plus and is_active;

update public.payroll_tier_rates as rate
set supports_senior_plus = true,
    updated_at = clock_timestamp()
from public.outlets as outlet
where rate.outlet_id = outlet.id
  and lower(trim(outlet.nama)) = 'warkop dki'
  and rate.tier = 'senior'
  and rate.supports_senior_plus is distinct from true;

update public.payroll_tier_rate_history as history
set supports_senior_plus = true
from public.outlets as outlet
where history.outlet_id = outlet.id
  and lower(trim(outlet.nama)) = 'warkop dki'
  and history.tier = 'senior'
  and history.supports_senior_plus is distinct from true;
