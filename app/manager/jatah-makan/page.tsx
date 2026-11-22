import { loadMealAllowanceForManager } from '@/app/actions/meal-allowance'
import FinanceMealAllowanceClient from '@/app/finance/jatah-makan/finance-meal-allowance-client'

export default function ManagerMealAllowancePage() {
  return <FinanceMealAllowanceClient backHref="/manager" loadMealAllowance={loadMealAllowanceForManager} />
}
