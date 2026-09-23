'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createLeaveRequest } from '@/app/actions/leave'
import { useDialog } from '@/components/ui/DialogProvider'
import BottomNav from '@/components/BottomNav'
import BackArrow from '@/components/BackArrow'
import PageHeader from '@/components/PageHeader'

type LeaveRequest = {
  id: number
  jenis: string
  tanggal_mulai: string
  tanggal_selesai: string
  alasan: string | null
  status: string
  catatan_manajer: string | null
  pengganti_type: string | null
  pengganti_nama_manual: string | null
  pengganti_user_id: string | null
}

type CrewOption = { id: string; nama: string }

const statusStyle: Record<string, string> = {
  pending: 'bg-warning/10 text-warning',
  disetujui: 'bg-success/10 text-success',
  ditolak: 'bg-brand/10 text-brand',
}

export default function IzinPage() {
  const { toast } = useDialog()
  const [list, setList] = useState<LeaveRequest[]>([])
  const [crewOptions, setCrewOptions] = useState<CrewOption[]>([])
  const [jenis, setJenis] = useState<'sakit' | 'keperluan_pribadi'>('sakit')
  const [tanggalMulai, setTanggalMulai] = useState('')
  const [tanggalSelesai, setTanggalSelesai] = useState('')
  const [alasan, setAlasan] = useState('')
  const [penggantiType, setPenggantiType] = useState<'crew' | 'freelance'>('crew')
  const [penggantiUserId, setPenggantiUserId] = useState('')
  const [penggantiNamaManual, setPenggantiNamaManual] = useState('')
  const [buktiFile, setBuktiFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function loadData() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: leaveData } = await supabase
      .from('leave_request')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    setList(leaveData || [])

    const { data: crewData } = await supabase
      .from('users')
      .select('id, nama')
      .eq('role', 'crew')
      .eq('status_aktif', true)
      .neq('id', user.id)
      .order('nama')
    setCrewOptions(crewData || [])
  }

  useEffect(() => { loadData() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)

    let buktiPath: string | null = null

    if (buktiFile) {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const fileName = `${user.id}/${Date.now()}-${buktiFile.name}`
      const { error: uploadError } = await supabase.storage.from('leave-attachments').upload(fileName, buktiFile)
      if (uploadError) {
        toast('Error upload bukti: ' + uploadError.message, 'error')
        setSubmitting(false)
        return
      }
      buktiPath = fileName
    }

    const result = await createLeaveRequest(
      jenis,
      tanggalMulai,
      tanggalSelesai,
      alasan,
      penggantiType,
      penggantiType === 'crew' ? penggantiUserId : null,
      penggantiType === 'freelance' ? penggantiNamaManual : null,
      buktiPath
    )

    setSubmitting(false)
    if (!result.success) { toast('Error: ' + result.message, 'error'); return }
    toast('Pengajuan berhasil dikirim', 'success')
    setTanggalMulai('')
    setTanggalSelesai('')
    setAlasan('')
    setPenggantiUserId('')
    setPenggantiNamaManual('')
    setBuktiFile(null)
    loadData()
  }

  function formatPengganti(item: LeaveRequest) {
    if (item.pengganti_type === 'crew') {
      const crew = crewOptions.find((c) => c.id === item.pengganti_user_id)
      return crew?.nama || '(crew)'
    }
    if (item.pengganti_type === 'freelance') return `Freelance, ${item.pengganti_nama_manual}`
    return '-'
  }

  const lastRequest = list[0]

  return (
    <div className="flex min-h-full flex-col bg-cream pb-6">
      <PageHeader title="Pengajuan Izin" backHref="/dashboard" />

      {lastRequest && (
        <div className="mt-4 px-5">
          <div className="rounded-2xl border border-cream-dim bg-cream-card px-5 py-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-muted">Pengajuan Terakhir</p>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize ${statusStyle[lastRequest.status]}`}>
                {lastRequest.status}
              </span>
            </div>
            <p className="mt-1 text-sm font-semibold capitalize text-ink">{lastRequest.jenis.replace('_', ' ')}</p>
            <p className="text-xs text-muted">{lastRequest.tanggal_mulai} - {lastRequest.tanggal_selesai}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-4 px-5">
        <div className="rounded-2xl border border-cream-dim bg-cream-card p-5">
          <p className="text-sm font-semibold text-ink">Ajukan Izin Baru</p>

          <div className="mt-4">
            <label className="mb-1 block text-xs font-medium text-muted">Jenis Izin</label>
            <select
              value={jenis}
              onChange={(e) => setJenis(e.target.value as any)}
              className="w-full rounded-xl border border-cream-dim bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-brand"
            >
              <option value="sakit">Sakit</option>
              <option value="keperluan_pribadi">Keperluan Pribadi</option>
            </select>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Tanggal Mulai</label>
              <input
                type="date"
                value={tanggalMulai}
                onChange={(e) => setTanggalMulai(e.target.value)}
                required
                className="w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Tanggal Selesai</label>
              <input
                type="date"
                value={tanggalSelesai}
                onChange={(e) => setTanggalSelesai(e.target.value)}
                required
                className="w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
              />
            </div>
          </div>

          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-muted">Alasan / Keterangan</label>
            <textarea
              placeholder="Tuliskan alasan izin Anda secara singkat..."
              value={alasan}
              onChange={(e) => setAlasan(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-cream-dim bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-brand"
            />
          </div>

          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-muted">Digantikan Dengan</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPenggantiType('crew')}
                className={`flex-1 rounded-xl border py-2 text-xs font-semibold ${
                  penggantiType === 'crew' ? 'border-brand bg-brand text-white' : 'border-cream-dim bg-white text-ink'
                }`}
              >
                Crew Lain
              </button>
              <button
                type="button"
                onClick={() => setPenggantiType('freelance')}
                className={`flex-1 rounded-xl border py-2 text-xs font-semibold ${
                  penggantiType === 'freelance' ? 'border-brand bg-brand text-white' : 'border-cream-dim bg-white text-ink'
                }`}
              >
                Freelance
              </button>
            </div>

            {penggantiType === 'crew' ? (
              <select
                value={penggantiUserId}
                onChange={(e) => setPenggantiUserId(e.target.value)}
                required
                className="mt-2 w-full rounded-xl border border-cream-dim bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-brand"
              >
                <option value="">-- Pilih Crew --</option>
                {crewOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.nama}</option>
                ))}
              </select>
            ) : (
              <input
                placeholder="Nama freelance (ketik manual)"
                value={penggantiNamaManual}
                onChange={(e) => setPenggantiNamaManual(e.target.value)}
                required
                className="mt-2 w-full rounded-xl border border-cream-dim bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-brand"
              />
            )}
          </div>

          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-muted">Bukti Izin (opsional)</label>
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => setBuktiFile(e.target.files?.[0] || null)}
              className="w-full text-xs text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-brand/10 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-brand"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="mt-4 w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {submitting ? 'Mengirim...' : 'Ajukan Sekarang'}
          </button>
        </div>
      </form>

      <div className="mt-5 px-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Riwayat Pengajuan</p>
        <div className="mt-2 space-y-2">
          {list.map((item) => (
            <div key={item.id} className="rounded-xl border border-cream-dim bg-cream-card px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium capitalize text-ink">{item.jenis.replace('_', ' ')}</p>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${statusStyle[item.status]}`}>
                  {item.status}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted">{item.tanggal_mulai} s.d. {item.tanggal_selesai}</p>
              <p className="mt-0.5 text-xs text-muted">Digantikan: {formatPengganti(item)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}