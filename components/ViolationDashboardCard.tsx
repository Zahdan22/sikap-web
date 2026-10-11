import Link from 'next/link'

export default function ViolationDashboardCard({ href, manager = false }: { href: string; manager?: boolean }) {
  return <Link href={href} className="flex items-center justify-between gap-3 rounded-2xl border border-cream-dim bg-cream-card px-5 py-4">
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2" /><rect x="9" y="2" width="6" height="4" rx="1" /><path d="M12 10v4m0 3h.01" /></svg></span>
    <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-ink">{manager ? 'Form Pelanggaran Crew' : 'Form Pelanggaran'}</p><p className="text-xs text-muted">{manager ? 'Periksa laporan, poin, dan denda crew' : 'Catat dan lihat pelanggaran crew'}</p></div><span className="text-brand">→</span>
  </Link>
}
