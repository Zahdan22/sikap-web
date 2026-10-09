'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createSwapRequest } from '@/app/actions/shift-swap'
import { useDialog } from '@/components/ui/DialogProvider'
import BackArrow from '@/components/BackArrow'
import PageHeader from '@/components/PageHeader'

type SwapRequest = {
  id: number
  tanggal: string
  tanggal_target: string | null
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
type ScheduleChoice = { id: number; user_id: string; tanggal: string; jam_mulai: string; jam_selesai: string }

function jakartaToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
}

const statusStyle: Record<string, string> = {
  pending: 'bg-warning/10 text-warning',
  disetujui: 'bg-success/10 text-success',
  ditolak: 'bg-brand/10 text-brand',
}

export default function TukarShiftPage() {
  const { toast } = useDialog()
  const [list, setList] = useState<SwapRequest[]>([])
  const [crewOptions, setCrewOptions] = useState<CrewOption[]>([])
  const [scheduleChoices, setScheduleChoices] = useState<ScheduleChoice[]>([])
  const [myName, setMyName] = useState('Kamu')
  const [tanggal, setTanggal] = useState('')
  const [tanggalTarget, setTanggalTarget] = useState('')
  const [targetType, setTargetType] = useState<'crew' | 'freelance'>('crew')
  const [targetId, setTargetId] = useState('')
  const [targetNamaFreelance, setTargetNamaFreelance] = useState('')
  const [alasan, setAlasan] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  async function loadData() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const [{ data: profile }, { data: scheduleData }] = await Promise.all([
      supabase.from('users').select('nama').eq('id', user.id).maybeSingle(),
      supabase.from('schedule').select('id, user_id, tanggal, jam_mulai, jam_selesai').gte('tanggal', jakartaToday()).not('user_id', 'is', null).order('tanggal'),
    ])
    setMyName(profile?.nama || 'Kamu')
    setScheduleChoices((scheduleData || []) as ScheduleChoice[])

    const { data: swapData } = await supabase
      .from('shift_swap_request')
      .select('*, requester:requester_id (nama), target:target_id (nama)')
      .or(`requester_id.eq.${user.id},target_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
    setList((swapData as any) || [])

    const { data: crewData } = await supabase
      .from('users').select('id, nama').eq('role', 'crew').eq('status_aktif', true).neq('id', user.id).order('nama')
    setCrewOptions(crewData || [])
  }

  useEffect(() => { loadData() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const result = await createSwapRequest(
      tanggal,
      targetType === 'crew' ? tanggalTarget : null,
      targetType,
      targetType === 'crew' ? targetId : null,
      targetType === 'freelance' ? targetNamaFreelance : null,
      alasan
    )
    setSubmitting(false)
    if (!result.success) { toast('Error: ' + result.message, 'error'); return }
    toast('Pengajuan tukar shift berhasil dikirim', 'success')
    setTanggal(''); setTanggalTarget(''); setTargetId(''); setTargetNamaFreelance(''); setAlasan('')
    loadData()
  }

  function formatTarget(item: SwapRequest) {
    if (item.target_type === 'freelance') return `Freelance, ${item.target_nama_freelance}`
    return item.target?.nama || '-'
  }

  const myShiftDates = [...new Set(scheduleChoices.filter((item) => item.user_id === userId).map((item) => item.tanggal))]
  const targetWorkDates = [...new Set(scheduleChoices.filter((item) => item.user_id === targetId && item.tanggal !== tanggal)
    .filter((item) => !scheduleChoices.some((own) => own.user_id === userId && own.tanggal === item.tanggal))
    .map((item) => item.tanggal))]
  const eligibleCrewOptions = crewOptions.filter((crew) =>
    scheduleChoices.some((shift) => shift.user_id === crew.id && shift.tanggal !== tanggal
      && !scheduleChoices.some((own) => own.user_id === userId && own.tanggal === shift.tanggal))
    && !scheduleChoices.some((shift) => shift.user_id === crew.id && shift.tanggal === tanggal)
  )
  const targetName = targetType === 'crew' ? crewOptions.find((crew) => crew.id === targetId)?.nama : targetNamaFreelance

  return (
    <div className="flex min-h-full flex-col bg-cream pb-6">
      <PageHeader title="Tukar Shift" backHref="/dashboard" />

      <form onSubmit={handleSubmit} className="mt-4 px-5">
        <div className="rounded-2xl border border-cream-dim bg-cream-card p-5">
          <p className="text-sm font-semibold text-ink">Ajukan Tukar Shift</p>

          <div className="mt-4">
            <label className="mb-1 block text-xs font-medium text-muted">Tanggal shift kamu</label>
            <select value={tanggal} onChange={(e) => { setTanggal(e.target.value); setTargetId(''); setTanggalTarget('') }} required className="w-full rounded-xl border border-cream-dim bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-brand">
              <option value="">-- Pilih tanggal kamu masuk --</option>
              {myShiftDates.map((date) => <option key={date} value={date}>{dateLabel(date)}</option>)}
            </select>
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
                onChange={(e) => { setTargetId(e.target.value); setTanggalTarget('') }}
                required
                disabled={!tanggal}
                className="mt-2 w-full rounded-xl border border-cream-dim bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-brand"
              >
                <option value="">-- Pilih rekan yang bisa bertukar --</option>
                {eligibleCrewOptions.map((c) => (
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

          {targetType === 'crew' && (
            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-muted">Tanggal shift rekan</label>
              <select value={tanggalTarget} onChange={(e) => setTanggalTarget(e.target.value)} required disabled={!targetId} className="w-full rounded-xl border border-cream-dim bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-brand disabled:opacity-60">
                <option value="">-- Pilih tanggal rekan masuk --</option>
                {targetWorkDates.map((date) => <option key={date} value={date}>{dateLabel(date)}</option>)}
              </select>
            </div>
          )}

          {targetType === 'crew' && tanggal && targetId && tanggalTarget && (
            <div className="mt-3 rounded-xl border border-success/20 bg-success/10 p-3 text-xs leading-relaxed text-ink">
              <p className="font-semibold">Perubahan setelah manager menyetujui</p>
              <p className="mt-1">@{targetName} masuk pada {dateLabel(tanggal)}, @{myName} libur. @{myName} masuk pada {dateLabel(tanggalTarget)}, @{targetName} libur.</p>
              <p className="mt-2 text-muted">Jam shift dan jobdesk ikut berpindah bersama jadwal. Kedua jadwal langsung diperbarui setelah disetujui manager.</p>
            </div>
          )}

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
                {item.tanggal_target ? `${item.tanggal} ↔ ${item.tanggal_target}` : item.tanggal} · {item.requester_id === userId ? 'Kamu mengajukan' : 'Kamu diminta'}
              </p>
              {item.alasan && <p className="mt-0.5 text-xs text-muted">"{item.alasan}"</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
