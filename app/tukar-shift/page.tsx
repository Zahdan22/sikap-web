'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createSwapRequest } from '@/app/actions/shift-swap'

type SwapRequest = {
  id: number
  tanggal: string
  alasan: string | null
  status: string
  requester_id: string
  target_id: string | null
  target_type: string
  target_nama_freelance: string | null
  requester: { nama: string } | null
  target: { nama: string } | null
}

type CrewOption = { id: string; nama: string }

const statusStyle: Record<string, string> = {
  pending: 'bg-warning/10 text-warning',
  disetujui: 'bg-success/10 text-success',
  ditolak: 'bg-brand/10 text-brand',
}

export default function TukarShiftPage() {
  const [list, setList] = useState<SwapRequest[]>([])
  const [crewOptions, setCrewOptions] = useState<CrewOption[]>([])
  const [tanggal, setTanggal] = useState('')
  const [targetType, setTargetType] = useState<'crew' | 'freelance'>('crew')
  const [targetId, setTargetId] = useState('')
  const [targetNamaFreelance, setTargetNamaFreelance] = useState('')
  const [alasan, setAlasan] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  async function loadData() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const { data: swapData } = await supabase
      .from('shift_swap_request')
      .select('*, requester:requester_id (nama), target:target_id (nama)')
      .or(`requester_id.eq.${user.id},target_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
    setList((swapData as any) || [])

    const { data: crewData } = await supabase
      .from('users').select('id, nama').eq('role', 'crew').neq('id', user.id).order('nama')
    setCrewOptions(crewData || [])
  }

  useEffect(() => { loadData() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setMessage('')
    const result = await createSwapRequest(
      tanggal,
      targetType,
      targetType === 'crew' ? targetId : null,
      targetType === 'freelance' ? targetNamaFreelance : null,
      alasan
    )
    setSubmitting(false)
    if (!result.success) { setMessage('Error: ' + result.message); return }
    setMessage('Pengajuan tukar shift berhasil dikirim')
    setTanggal(''); setTargetId(''); setTargetNamaFreelance(''); setAlasan('')
    loadData()
  }

  function formatTarget(item: SwapRequest) {
    if (item.target_type === 'freelance') return `Freelance, ${item.target_nama_freelance}`
    return item.target?.nama || '-'
  }

  return (
    <div className="flex min-h-full flex-col bg-cream pb-6">
      <div className="flex items-center gap-3 px-5 pt-6">
        <a href="/dashboard" className="text-brand text-lg">←</a>
        <h1 className="text-lg font-semibold text-ink">Tukar Shift</h1>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 px-5">
        <div className="rounded-2xl border border-cream-dim bg-cream-card p-5">
          <p className="text-sm font-semibold text-ink">Ajukan Tukar Shift</p>

          <div className="mt-4">
            <label className="mb-1 block text-xs font-medium text-muted">Tanggal</label>
            <input
              type="date"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              required
              className="w-full rounded-xl border border-cream-dim bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-brand"
            />
          </div>

          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-muted">Tukar Dengan</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTargetType('crew')}
                className={`flex-1 rounded-xl border py-2 text-xs font-semibold ${
                  targetType === 'crew' ? 'border-brand bg-brand text-white' : 'border-cream-dim bg-white text-ink'
                }`}
              >
                Crew Lain
              </button>
              <button
                type="button"
                onClick={() => setTargetType('freelance')}
                className={`flex-1 rounded-xl border py-2 text-xs font-semibold ${
                  targetType === 'freelance' ? 'border-brand bg-brand text-white' : 'border-cream-dim bg-white text-ink'
                }`}
              >
                Freelance
              </button>
            </div>

            {targetType === 'crew' ? (
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                required
                className="mt-2 w-full rounded-xl border border-cream-dim bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-brand"
              >
                <option value="">-- Pilih Rekan --</option>
                {crewOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.nama}</option>
                ))}
              </select>
            ) : (
              <input
                placeholder="Nama freelance (ketik manual)"
                value={targetNamaFreelance}
                onChange={(e) => setTargetNamaFreelance(e.target.value)}
                required
                className="mt-2 w-full rounded-xl border border-cream-dim bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-brand"
              />
            )}
          </div>

          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-muted">Alasan</label>
            <textarea
              placeholder="Tuliskan alasan tukar shift..."
              value={alasan}
              onChange={(e) => setAlasan(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-cream-dim bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-brand"
            />
          </div>

          {message && <p className="mt-3 text-sm text-brand">{message}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-4 w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {submitting ? 'Mengirim...' : 'Ajukan Tukar Shift'}
          </button>
        </div>
      </form>

      <div className="mt-5 px-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Riwayat</p>
        <div className="mt-2 space-y-2">
          {list.map((item) => (
            <div key={item.id} className="rounded-xl border border-cream-dim bg-cream-card px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-ink">
                  {item.requester?.nama} ↔ {formatTarget(item)}
                </p>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${statusStyle[item.status]}`}>
                  {item.status}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted">
                {item.tanggal} · {item.requester_id === userId ? 'Kamu mengajukan' : 'Kamu diminta'}
              </p>
              {item.alasan && <p className="mt-0.5 text-xs text-muted">"{item.alasan}"</p>}
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}