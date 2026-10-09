import Link from 'next/link'
import DashboardHeader from '@/components/DashboardHeader'
import AccountMenu from '@/components/AccountMenu'
import { createClient } from '@/lib/supabase/server'

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
        <Link href="/finance/payroll" className="block rounded-2xl border border-cream-dim bg-cream-card p-5">
          <p className="font-semibold text-ink">Payroll & Rekap Gaji</p>
          <p className="mt-1 text-sm text-muted">Hitung gaji dari jadwal dan absensi lengkap, lalu ekspor Excel.</p>
          <span className="mt-3 block text-sm font-semibold text-brand">Buka payroll →</span>
        </Link>
        <Link href="/finance/crew" className="block rounded-2xl border border-cream-dim bg-cream-card p-5">
          <p className="font-semibold text-ink">Status Tier Crew</p>
          <p className="mt-1 text-sm text-muted">Atur data awal tier, hari yang sudah ditempuh, dan level Senior+.</p>
          <span className="mt-3 block text-sm font-semibold text-brand">Kelola tier →</span>
        </Link>
      </section>
    </div>
  )
}
