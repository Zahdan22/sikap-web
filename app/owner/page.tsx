import DashboardHeader from '@/components/DashboardHeader'
import AccountMenu from '@/components/AccountMenu'
import OwnerHomeClient from '@/components/OwnerHomeClient'
import { loadOwnerPayrollData } from '@/app/actions/owner-payroll'
import { requireOwner } from '@/lib/owner-auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export default async function OwnerPage() {
  const access = await requireOwner()
  if (!access.ok) return null
  const [{ data: profile }, dashboard] = await Promise.all([
    supabaseAdmin.from('users').select('nama').eq('id', access.userId).maybeSingle(),
    loadOwnerPayrollData(),
  ])
  return <div className="min-h-full bg-cream pb-10"><DashboardHeader nama={profile?.nama || 'Owner'} role="Owner"><AccountMenu role="owner" /></DashboardHeader>{dashboard.success ? <OwnerHomeClient outlets={dashboard.outlets} users={dashboard.users} /> : <p className="px-5 pt-5 text-sm text-brand">{dashboard.message}</p>}</div>
}

