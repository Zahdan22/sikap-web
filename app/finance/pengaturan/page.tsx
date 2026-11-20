import Link from 'next/link'
import PageHeader from '@/components/PageHeader'

type SettingLinkProps = {
  href: string
  title: string
  description: string
  children: React.ReactNode
}

function SettingLink({ href, title, description, children }: SettingLinkProps) {
  return (
    <Link href={href} className="flex items-center gap-4 rounded-2xl border border-cream-dim bg-cream-card p-4 transition-colors hover:border-brand/40">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
        {children}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-muted">{description}</span>
      </span>
      <span aria-hidden="true" className="shrink-0 text-lg text-brand">→</span>
    </Link>
  )
}

export default function FinanceSettingsPage() {
  return (
    <div className="min-h-full bg-cream pb-24">
      <PageHeader title="Pengaturan" backHref="/finance" />
      <main className="space-y-4 px-5 pt-5">
        <section className="rounded-2xl border border-cream-dim bg-cream-card p-4 text-sm leading-relaxed text-muted">
          Atur komponen payroll dan aturan operasional. Perubahan dengan tanggal berlaku hanya memengaruhi payroll draf yang terkait; payroll yang telah difinalisasi tetap aman.
        </section>

        <section className="space-y-3" aria-label="Daftar pengaturan">
          <SettingLink href="/finance/crew" title="Manajemen Status Crew" description="Atur status, kasbon, bonus, reward, dan gelar management setiap crew.">
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="7" r="3" />
              <path d="M3 21v-2a6 6 0 0 1 12 0v2M19 15V5m-3 3 3-3 3 3" />
            </svg>
          </SettingLink>

          <SettingLink href="/finance/crew/tarif" title="Tarif & Tunjangan Masa Kerja" description="Kelola status crew, tarif per jam, serta tunjangan masa kerja dengan tanggal berlaku.">
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6" />
              <path d="M8 10h.01M16 10h.01" />
            </svg>
          </SettingLink>

          <SettingLink href="/finance/pengaturan/poin-denda" title="Aturan Poin & Denda" description="Kelola poin dan nominal denda otomatis, tanpa mengubah batas waktu SOP.">
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a10 10 0 1 0 10 10" />
              <path d="M12 6v6l4 2M19 3v4h-4" />
            </svg>
          </SettingLink>

          <SettingLink href="/outlet" title="Informasi Outlet" description="Atur nama dan titik GPS absensi outlet ini. Perubahan lokasi perlu konfirmasi password.">
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
              <circle cx="12" cy="10" r="2.5" />
            </svg>
          </SettingLink>
        </section>
      </main>
    </div>
  )
}
