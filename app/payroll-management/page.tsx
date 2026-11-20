import { redirect } from 'next/navigation'
import PageHeader from '@/components/PageHeader'
import { loadMyManagementPayroll } from '@/app/actions/owner-payroll'

const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
const asNumber = (value: string | number) => Number(value) || 0

export default async function PayrollManagementPage() {
  const data = await loadMyManagementPayroll()
  if (!data.success) redirect('/login')
  return <div className="min-h-full bg-cream pb-10"><PageHeader title="Slip Gaji Saya" backHref="/" /><main className="space-y-4 px-5 py-5">{data.items.length === 0 ? <section className="rounded-2xl border border-cream-dim bg-cream-card p-5 text-sm leading-relaxed text-muted">Belum ada slip payroll manajemen yang dibagikan untuk akun ini.</section> : data.items.map((item) => { const period = Array.isArray(item.period) ? item.period[0] : item.period; const net = asNumber(item.gaji_pokok) + asNumber(item.tunjangan) + asNumber(item.bonus_komisi) - asNumber(item.potongan); return <section key={item.id} className="rounded-2xl border border-cream-dim bg-cream-card p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold text-ink">{period?.nama || 'Periode Payroll'}</p><p className="mt-1 text-xs text-muted">{period?.period_start} s.d. {period?.period_end} · {item.role_label_snapshot}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${period?.status === 'finalized' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>{period?.status === 'finalized' ? 'Final' : 'Draf'}</span></div><dl className="mt-4 space-y-2 border-t border-cream-dim pt-4 text-sm"><Row label="Gaji pokok" value={asNumber(item.gaji_pokok)} /><Row label="Tunjangan" value={asNumber(item.tunjangan)} /><Row label="Bonus / komisi" value={asNumber(item.bonus_komisi)} positive /><Row label="Potongan" value={asNumber(item.potongan)} negative /><div className="flex items-center justify-between border-t border-cream-dim pt-3 font-bold text-brand"><dt>Gaji bersih</dt><dd>{rupiah.format(net)}</dd></div></dl>{item.catatan && <p className="mt-4 rounded-xl bg-cream px-3 py-3 text-xs leading-relaxed text-muted">Catatan: {item.catatan}</p>}</section>})}</main></div>
}

function Row({ label, value, positive, negative }: { label: string; value: number; positive?: boolean; negative?: boolean }) { return <div className="flex items-center justify-between"><dt className="text-muted">{label}</dt><dd className={positive ? 'text-success' : negative ? 'text-brand' : 'text-ink'}>{negative && value > 0 ? '−' : ''}{rupiah.format(value)}</dd></div> }

