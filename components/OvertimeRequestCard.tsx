import type { ReactNode } from 'react'
import { overtimeDateLabel, type OvertimeRequest } from '@/lib/overtime'

const statusLabels = { pending: 'Menunggu', disetujui: 'Disetujui', ditolak: 'Ditolak' }
const styles = { pending: 'bg-warning/10 text-warning', disetujui: 'bg-success/10 text-success', ditolak: 'bg-brand/10 text-brand' }
const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })

export default function OvertimeRequestCard({ request, showCrew = false, children }: { request: OvertimeRequest; showCrew?: boolean; children?: ReactNode }) {
  return <article className="rounded-2xl border border-cream-dim bg-cream-card p-4">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        {showCrew && <h2 className="font-semibold text-ink">{request.crew?.nama || 'Crew'} <span className="text-xs font-normal text-muted">@{request.crew?.username}</span></h2>}
        <p className="text-sm font-semibold text-ink">{overtimeDateLabel(request.tanggal)}</p>
      </div>
      <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${styles[request.status]}`}>{statusLabels[request.status]}</span>
    </div>
    <p className="mt-2 text-sm text-muted">{request.jam_mulai.slice(0, 5)}–{request.jam_selesai.slice(0, 5)}{request.jam_selesai < request.jam_mulai ? ' (hari berikutnya)' : ''}</p>
    <p className="mt-1 text-sm font-semibold text-ink">{request.jam_dibayar} jam · {rupiah.format(request.nominal)}</p>
    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted">{request.keterangan}</p>
    {request.status !== 'pending' && <p className="mt-3 text-xs text-muted">{statusLabels[request.status]} oleh {request.reviewer?.nama || 'manager'}{request.reviewed_at ? ` · ${new Date(request.reviewed_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' })}` : ''}</p>}
    {request.catatan_manajer && <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted">Catatan: {request.catatan_manajer}</p>}
    {children}
  </article>
}
