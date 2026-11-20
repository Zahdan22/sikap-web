import PageHeader from '@/components/PageHeader'
import OwnerPayrollClient from '@/components/OwnerPayrollClient'
import { loadOwnerPayrollData } from '@/app/actions/owner-payroll'

export default async function OwnerPayrollPage() {
  const data = await loadOwnerPayrollData()
  return <div className="min-h-full bg-cream pb-10"><PageHeader title="Payroll Manajemen" backHref="/owner" />{data.success ? <OwnerPayrollClient roles={data.roles} users={data.users} periods={data.periods} items={data.items} /> : <p className="px-5 pt-5 text-sm text-brand">{data.message}</p>}</div>
}

