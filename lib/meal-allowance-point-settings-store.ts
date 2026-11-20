import 'server-only'

import { supabaseAdmin } from '@/lib/supabase-admin'
import { mealAllowancePointSettingDefault, type MealAllowancePointSetting } from '@/lib/meal-allowance-point-settings'

type MealAllowancePointSettingRow = {
  is_enabled: boolean
  effective_from: string | null
}

/** Server-only: the policy is outlet data, not browser-readable data. */
export async function loadMealAllowancePointSetting(outletId: string) {
  const { data, error } = await supabaseAdmin
    .from('meal_allowance_point_settings')
    .select('is_enabled,effective_from')
    .eq('outlet_id', outletId)
    .maybeSingle()

  if (error) return { data: mealAllowancePointSettingDefault, error }
  if (!data) return { data: mealAllowancePointSettingDefault, error: null }

  const row = data as MealAllowancePointSettingRow
  const setting: MealAllowancePointSetting = {
    isEnabled: row.is_enabled === true,
    effectiveFrom: row.effective_from,
  }
  return { data: setting, error: null }
}
