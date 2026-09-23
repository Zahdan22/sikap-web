'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { respondLeaveRequest } from '@/app/actions/leave'
import { useDialog } from '@/components/ui/DialogProvider'
import PageHeader from '@/components/PageHeader'

type LeaveRequestWithUser = {
  id: number
  jenis: string
  tanggal_mulai: string
  tanggal_selesai: string
  alasan: string | null
  status: string
  users: { nama: string } | null
  pengganti_type: string | null
  pengganti_nama_manual: string | null
  pengganti_user_id: string | null
  bukti_path: string | null
}

type CrewOption = { id: string; nama: string }

const statusStyle: Record<string, string> = {
  pending: 'bg-warning/10 text-warning',
  disetujui: 'bg-success/10 text-success',
  ditolak: 'bg-brand/10 text-brand',
}

export default function ManagerIzinPage() {
  const { toast } = useDialog()
  const [list, setList] = useState<LeaveRequestWithUser[]>([])
  const [crewOptions, setCrewOptions] = useState<CrewOption[]>([])
  const [catatan, setCatatan] = useState<Record<number, string>>({})
  const [openCatatanFor, setOpenCatatanFor] = useState<number | null>(null)

  async function loadData() {
    const supabase = createClient()

    const { data: leaveData } = await supabase
      .from('leave_request')
      .select(
        'id, jenis, tanggal_mulai, tanggal_selesai, alasan, status, users:user_id (nama), pengganti_type, pengganti_nama_manual, pengganti_user_id, bukti_path'
      )
      .order('created_at', { ascending: false })
    setList((leaveData as any) || [])

    const { data: crewData } = await supabase.from('users').select('id, nama')
    setCrewOptions(crewData || [])
  }

  useEffect(() => { loadData() }, [])

  async function handleRespond(id: number, status: 'disetujui' | 'ditolak') {
    const result = await respondLeaveRequest(id, status, catatan[id] || '')
    if (!result.success) { toast('Error: ' + result.message, 'error'); return }
    toast(status === 'disetujui' ? 'Izin disetujui' : 'Izin ditolak', 'success')
    setOpenCatatanFor(null)
    loadData()
  }

  async function handleLihatBukti(buktiPath: string) {
    const supabase = createClient()
    const { data, error } = await supabase.storage.from('leave-attachments').createSignedUrl(buktiPath, 3600)
    if (error || !data) { toast('Gagal buka bukti: ' + error?.message, 'error'); return }
    window.open(data.signedUrl, '_blank')
  }

  function formatPengganti(item: LeaveRequestWithUser) {
    if (item.pengganti_type === 'crew') {
      const crew = crewOptions.find((c) => c.id === item.pengganti_user_id)
      return crew?.nama || '(crew)'
    }
    if (item.pengganti_type === 'freelance') return `Freelance, ${item.pengganti_nama_manual}`
    return '-'
  }

  const pendingList = list.filter((i) => i.status === 'pending')
  const historyList = list.filter((i) => i.status !== 'pending')

  return (
    <div className="flex min-h-full flex-col bg-cream pb-10">
      <PageHeader title="Kelola Izin" backHref="/dashboard" />

      <div className="mt-4 px-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Menunggu Persetujuan ({pendingList.length})
        </p>
        <div className="mt-2 space-y-2">
          {pendingList.map((item) => (
            <div key={item.id} className="rounded-2xl border border-cream-dim bg-cream-card p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-ink">{item.users?.nama}</p>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${statusStyle[item.status]}`}>
                  {item.status}
                </span>
              </div>
              <p className="mt-1 text-xs capitalize text-muted">
                {item.jenis.replace('_', ' ')} · {item.tanggal_mulai} s.d. {item.tanggal_selesai}
              </p>
              {item.alasan && <p className="mt-1 text-xs text-muted">"{item.alasan}"</p>}
              <p className="mt-1 text-xs text-muted">Digantikan: {formatPengganti(item)}</p>

              {item.bukti_path && (
                <button
                  onClick={() => handleLihatBukti(item.bukti_path!)}
                  className="mt-2 text-xs font-semibold text-brand"
                >
                  📎 Lihat Bukti Izin
                </button>
              )}

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
                <p className="text-sm font-medium text-ink">{item.users?.nama}</p>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${statusStyle[item.status]}`}>
                  {item.status}
                </span>
              </div>
              <p className="mt-0.5 text-xs capitalize text-muted">
                {item.jenis.replace('_', ' ')} · {item.tanggal_mulai} s.d. {item.tanggal_selesai}
              </p>
            </div>
          ))}
          {historyList.length === 0 && <p className="text-sm text-muted">Belum ada riwayat.</p>}
        </div>
      </div>
    </div>
  )
}