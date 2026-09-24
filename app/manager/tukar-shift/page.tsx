'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { respondSwapRequest } from '@/app/actions/shift-swap'
import { useDialog } from '@/components/ui/DialogProvider'
import PageHeader from '@/components/PageHeader'

type SwapRequest = {
  id: number
  tanggal: string
  alasan: string | null
  status: string
  target_type: string
  target_nama_freelance: string | null
  requester: { nama: string } | null
  target: { nama: string } | null
}

const statusStyle: Record<string, string> = {
  pending: 'bg-warning/10 text-warning',
  disetujui: 'bg-success/10 text-success',
  ditolak: 'bg-brand/10 text-brand',
}

export default function ManagerTukarShiftPage() {
  const { toast } = useDialog()
  const [list, setList] = useState<SwapRequest[]>([])
  const [catatan, setCatatan] = useState<Record<number, string>>({})
  const [openCatatanFor, setOpenCatatanFor] = useState<number | null>(null)

  async function loadList() {
    const supabase = createClient()
    const { data } = await supabase
      .from('shift_swap_request')
      .select('*, requester:requester_id (nama), target:target_id (nama)')
      .order('created_at', { ascending: false })
    setList((data as any) || [])
  }

  useEffect(() => { loadList() }, [])

  async function handleRespond(id: number, status: 'disetujui' | 'ditolak') {
    const result = await respondSwapRequest(id, status, catatan[id] || '')
    if (!result.success) { toast('Error: ' + result.message, 'error'); return }
    toast(status === 'disetujui' ? 'Tukar shift disetujui' : 'Tukar shift ditolak', 'success')
    setOpenCatatanFor(null)
    loadList()
  }

  function formatTarget(item: SwapRequest) {
    if (item.target_type === 'freelance') return `Freelance, ${item.target_nama_freelance}`
    return item.target?.nama || '-'
  }

  const pendingList = list.filter((i) => i.status === 'pending')
  const historyList = list.filter((i) => i.status !== 'pending')

  return (
    <div className="flex min-h-full flex-col bg-cream pb-24">
      <PageHeader title="Kelola Tukar Shift" backHref="/dashboard" />

      <div className="mt-4 px-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Menunggu Persetujuan ({pendingList.length})
        </p>
        <div className="mt-2 space-y-2">
          {pendingList.map((item) => (
            <div key={item.id} className="rounded-2xl border border-cream-dim bg-cream-card p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-ink">
                  {item.requester?.nama} ↔ {formatTarget(item)}
                </p>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${statusStyle[item.status]}`}>
                  {item.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">{item.tanggal}</p>
              {item.alasan && <p className="mt-1 text-xs text-muted">"{item.alasan}"</p>}

              {openCatatanFor === item.id ? (
                <div className="mt-3">
                  <input
                    placeholder="Catatan (opsional)"
                    value={catatan[item.id] || ''}
                    onChange={(e) => setCatatan((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    className="w-full rounded-xl border border-cream-dim bg-white px-4 py-2 text-sm text-ink outline-none focus:border-brand"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => handleRespond(item.id, 'disetujui')}
                      className="flex-1 rounded-xl bg-success py-2 text-xs font-semibold text-white"
                    >
                      Setujui
                    </button>
                    <button
                      onClick={() => handleRespond(item.id, 'ditolak')}
                      className="flex-1 rounded-xl bg-brand py-2 text-xs font-semibold text-white"
                    >
                      Tolak
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setOpenCatatanFor(item.id)}
                  className="mt-3 w-full rounded-xl border border-brand py-2 text-xs font-semibold text-brand"
                >
                  Proses Pengajuan
                </button>
              )}
            </div>
          ))}
          {pendingList.length === 0 && <p className="text-sm text-muted">Tidak ada pengajuan menunggu.</p>}
        </div>
      </div>

      <div className="mt-6 px-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Riwayat</p>
        <div className="mt-2 space-y-2">
          {historyList.map((item) => (
            <div key={item.id} className="rounded-xl border border-cream-dim bg-cream-card px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-ink">
                  {item.requester?.nama} ↔ {formatTarget(item)}
                </p>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${statusStyle[item.status]}`}>
                  {item.status}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted">{item.tanggal}</p>
            </div>
          ))}
          {historyList.length === 0 && <p className="text-sm text-muted">Belum ada riwayat.</p>}
        </div>
      </div>
    </div>
  )
}