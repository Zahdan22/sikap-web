-- Warkop DKI has its own attendance policy. These rows intentionally do not
-- reuse Tjap Djajakarta's points, deductions, active state, or history.
-- They are versioned from the Jakarta date this migration is applied.
with target_outlet as (
  select id
  from public.outlets
  where nama = 'Warkop DKI'
), rules (
  rule_key,
  label,
  rule_kind,
  min_minutes,
  max_minutes,
  applies_to,
  payroll_effect,
  points,
  fine,
  is_active
) as (
  values
    ('late_checkin_1_5', 'Telat absen masuk 1–5 menit', 'late_checkin', 1, 5, 'all', 'disciplinary', 3, 0, true),
    ('late_checkin_6_10', 'Telat absen masuk 6–10 menit', 'late_checkin', 6, 10, 'all', 'deduction', 3, 5000, true),
    ('late_checkin_11_15', 'Telat absen masuk 11–15 menit', 'late_checkin', 11, 15, 'all', 'deduction', 3, 5000, true),
    ('late_checkin_16_20', 'Telat absen masuk 16–20 menit', 'late_checkin', 16, 20, 'all', 'deduction', 4, 10000, true),
    ('late_checkin_21_25', 'Telat absen masuk 21–25 menit', 'late_checkin', 21, 25, 'all', 'deduction', 4, 10000, true),
    ('late_checkin_26_30', 'Telat absen masuk 26–30 menit', 'late_checkin', 26, 30, 'all', 'deduction', 4, 10000, true),
    ('late_checkin_31_plus', 'Telat absen masuk ≥31 menit', 'late_checkin', 31, null, 'all', 'unpaid', 8, 0, true),
    -- These three values have not been set for Warkop yet. They are visible
    -- in the Finance settings but cannot affect points or payroll until the
    -- Warkop Finance manager enables and configures them.
    ('missing_checkin', 'Tidak absen masuk', 'missing_checkin', null, null, 'all', 'unpaid', 0, 0, false),
    ('late_checkout', 'Telat absen pulang', 'late_checkout', null, null, 'all', 'deduction', 0, 0, false),
    ('missing_meal', 'Tidak mengisi jatah makan', 'missing_meal', null, null, 'all', 'disciplinary', 0, 0, false)
)
insert into public.attendance_penalty_rule_history (
  outlet_id,
  rule_key,
  label,
  rule_kind,
  min_minutes,
  max_minutes,
  applies_to,
  payroll_effect,
  points,
  fine,
  is_active,
  effective_on
)
select
  target_outlet.id,
  rules.rule_key,
  rules.label,
  rules.rule_kind,
  rules.min_minutes,
  rules.max_minutes,
  rules.applies_to,
  rules.payroll_effect,
  rules.points,
  rules.fine,
  rules.is_active,
  timezone('Asia/Jakarta', clock_timestamp())::date
from target_outlet
cross join rules
on conflict (outlet_id, rule_key, effective_on) do nothing;

-- A disabled setting keeps meal reports available while ensuring no meal
-- violation can be created until Warkop Finance chooses its official date.
insert into public.meal_allowance_point_settings (outlet_id, is_enabled, effective_from)
select id, false, null
from public.outlets
where nama = 'Warkop DKI'
on conflict (outlet_id) do nothing;
