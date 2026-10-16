import Link from 'next/link'
import DashboardHeader from '@/components/DashboardHeader'
import AccountMenu from '@/components/AccountMenu'
import { createClient } from '@/lib/supabase/server'
import OvertimeDashboardCard from '@/components/OvertimeDashboardCard'
import ViolationDashboardCard from '@/components/ViolationDashboardCard'
import CorrectionDashboardCard from '@/components/CorrectionDashboardCard'

export default async function FinanceHomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('users').select('nama').eq('id', user!.id).single()

  return (
    <div className="flex min-h-full flex-col bg-cream pb-24">
      <DashboardHeader nama={profile?.nama || ''} role="Manager Keuangan">
        <AccountMenu role="finance" />
      </DashboardHeader>
      <section className="mt-5 space-y-3 px-5">
        <CorrectionDashboardCard href="/finance/koreksi-absensi" manager />
        <OvertimeDashboardCard href="/finance/lembur" />
        <ViolationDashboardCard href="/finance/pelanggaran" manager />
        <Link href="/finance/payroll" className="flex items-center justify-between gap-3 rounded-2xl border border-cream-dim bg-cream-card px-5 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
              <path d="M14 3v5h5M9 12h6M9 16h3" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">Payroll & Rekap Gaji</p>
            <p className="text-xs text-muted">Hitung gaji dari jadwal dan absensi lengkap, lalu ekspor Excel.</p>
          </div>
          <span className="text-brand">→</span>
        </Link>
        <Link href="/finance/crew" className="flex items-center justify-between gap-3 rounded-2xl border border-cream-dim bg-cream-card px-5 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="7" r="3" />
              <path d="M3 21v-2a6 6 0 0 1 12 0v2M19 15V5m-3 3 3-3 3 3" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">Status Tier Crew</p>
            <p className="text-xs text-muted">Atur data awal tier, hari yang sudah ditempuh, dan level Senior+.</p>
          </div>
          <span className="text-brand">→</span>
        </Link>
      </section>
    </div>
  )
}
