-- Cuti is a positive manual payroll component. It remains period-scoped so
-- Finance can correct one payroll period without changing future pay.
alter table public.crew_payroll_manual_components
  drop constraint if exists crew_payroll_manual_components_component_type_check;

alter table public.crew_payroll_manual_components
  add constraint crew_payroll_manual_components_component_type_check
  check (component_type = any (array[
    'referral_bonus'::text,
    'operational_bonus'::text,
    'no_late_reward'::text,
    'cash_advance'::text,
    'leave_pay'::text
  ]));

-- Preserve who last changed a custom addition or deduction. The existing RLS
-- policies already limit writes to Finance on a draft payroll in its outlet.
alter table public.payroll_adjustments
  add column if not exists updated_by uuid references public.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

update public.payroll_adjustments
set updated_by = recorded_by,
    updated_at = coalesce(updated_at, created_at, now())
where updated_by is null;
