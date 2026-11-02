export const manualPayrollComponentTypes = [
  'referral_bonus',
  'operational_bonus',
  'no_late_reward',
  'cash_advance',
] as const

export type ManualPayrollComponentType = (typeof manualPayrollComponentTypes)[number]

export const manualPayrollComponentLabels: Record<ManualPayrollComponentType, string> = {
  referral_bonus: 'Bonus bawa teman',
  operational_bonus: 'Bonus operasional',
  no_late_reward: 'Reward tidak telat',
  cash_advance: 'Kasbon',
}

export function isManualPayrollComponentType(value: string): value is ManualPayrollComponentType {
  return manualPayrollComponentTypes.includes(value as ManualPayrollComponentType)
}
