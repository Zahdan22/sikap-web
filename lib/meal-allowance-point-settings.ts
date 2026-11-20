import { isIsoDate } from '@/lib/meal-allowance'

export type MealAllowancePointSetting = {
  isEnabled: boolean
  effectiveFrom: string | null
}

export const mealAllowancePointSettingDefault: MealAllowancePointSetting = {
  isEnabled: false,
  effectiveFrom: null,
}

/**
 * The meal report itself remains available to crew. This only decides whether
 * a missing report becomes an automatic disciplinary-point row.
 */
export function mealAllowancePointsApplyOn(date: string, setting: MealAllowancePointSetting) {
  return setting.isEnabled
    && setting.effectiveFrom !== null
    && isIsoDate(date)
    && date >= setting.effectiveFrom
}
