'use client'

import { useEffect, useMemo, useState } from 'react'
import { useDialog } from '@/components/ui/DialogProvider'
import { simpanJadwalHariIni } from '@/app/actions/jadwal'
import PageHeader from '@/components/PageHeader'
import Spinner from '@/components/Spinner'
import JamKerjaModal from '@/components/JamKerjaModal'
import JobdeskModal from '@/components/JobdeskModal'
import {
  Crew, CrewScheduleState, getCrewList, getJamKerjaOptions, getJobdeskOptions,
  getPresets, getScheduleStateForDate, JamKerjaOpsi, JamKerjaPreset,
  JobdeskOption, JobdeskTimeBlock, formatMinuteClock,
} from '@/lib/jadwal'

const EMPTY: CrewScheduleState = { jamKerjaOpsiId: 'libur', jobdeskIds: [], jobdeskBlocks: [], existingScheduleId: null }
const DAY_START = 6 * 60
// Kolom terakhir dimulai pukul 00:00 +1 dan mencakup sampai pukul 02:00 +1.
const DAY_END = 26 * 60
const SLOT_MINUTES = 120
const slots = Array.from({ length: (DAY_END - DAY_START) / SLOT_MINUTES }, (_, i) => ({
  start: DAY_START + i * SLOT_MINUTES,
  end: DAY_START + (i + 1) * SLOT_MINUTES,
}))
const hourSlots = Array.from({ length: (DAY_END - DAY_START) / 60 }, (_, i) => ({
  start: DAY_START + i * 60,
  end: DAY_START + (i + 1) * 60,
}))

function shiftMinutes(state: CrewScheduleState, options: JamKerjaOpsi[]) {
  const option = options.find((item) => item.id === state.jamKerjaOpsiId)
  const startText = option?.jam_mulai || state.jamMulaiLama
  const endText = option?.jam_selesai || state.jamSelesaiLama
  if (!startText || !endText || state.jamKerjaOpsiId === 'libur') return null
  const [sh, sm = '0'] = startText.split(':')
  const [eh, em = '0'] = endText.split(':')
  const start = Number(sh) * 60 + Number(sm)
  let end = Number(eh) * 60 + Number(em)
  if (end <= start) end += 1440
  return { start, end }
}

function cellJobdeskIds(state: CrewScheduleState, options: JamKerjaOpsi[], slot: { start: number; end: number }) {
  const shift = shiftMinutes(state, options)
  if (!shift) return []
  const start = Math.max(shift.start, slot.start)
  const end = Math.min(shift.end, slot.end)
  if (end <= start) return []
  const saved = state.jobdeskBlocks.filter((block) => block.mulaiMenit < end && block.selesaiMenit > start)
  return state.jobdeskBlocks.length
    ? [...new Set(saved.flatMap((block) => block.jobdeskIds))]
    : state.jobdeskIds
}

export default function JadwalPage() {
  const { toast } = useDialog()
  const [date, setDate] = useState(() => new Date())
  const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const [crews, setCrews] = useState<Crew[]>([])
  const [presets, setPresets] = useState<JamKerjaPreset[]>([])
  const [presetId, setPresetId] = useState<number | null>(null)
  const [shifts, setShifts] = useState<JamKerjaOpsi[]>([])
  const [jobdesks, setJobdesks] = useState<JobdeskOption[]>([])
  const [states, setStates] = useState<Record<string, CrewScheduleState>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<{ crewId: string; slot: { start: number; end: number } } | null>(null)
  const [showMenu, setShowMenu] = useState(false)
  const [showJamKerjaModal, setShowJamKerjaModal] = useState(false)
  const [showJobdeskModal, setShowJobdeskModal] = useState(false)

  useEffect(() => {
    Promise.all([getCrewList(), getPresets(), getJobdeskOptions()]).then(([crewRows, presetRows, jobdeskRows]) => {
      setCrews(crewRows)
      setPresets(presetRows)
      setPresetId(presetRows[0]?.id ?? null)
      setJobdesks(jobdeskRows)
      if (crewRows.length === 0) setLoading(false)
    }).catch((error) => toast('Gagal memuat data jadwal: ' + (error as Error).message, 'error'))
  }, [toast])

  useEffect(() => {
    let cancelled = false
    if (!crews.length) return
    getScheduleStateForDate(dateString, crews, shifts).then((data) => {
      if (!cancelled) setStates(data)
    }).catch((error) => {
      if (!cancelled) toast('Gagal memuat jadwal. Pastikan migrasi pembagian jobdesk sudah diterapkan: ' + (error as Error).message, 'error')
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [dateString, crews, shifts, presetId, toast])

  // Load active shift choices when the selected preset changes.
  useEffect(() => {
    if (!presetId) return
    getJamKerjaOptions(presetId).then(setShifts).catch((error) => toast('Gagal memuat shift: ' + (error as Error).message, 'error'))
  }, [presetId, toast])

  const dayLabel = useMemo(() => new Date(`${dateString}T00:00:00`).toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }), [dateString])

  function changeShift(crewId: string, value: string) {
    setStates((previous) => ({
      ...previous,
      [crewId]: { ...(previous[crewId] || EMPTY), jamKerjaOpsiId: value === 'libur' ? 'libur' : value === 'jadwal-lama' ? 'jadwal-lama' : Number(value) },
    }))
  }

  function toggleJobdesk(jobdeskId: number) {
    if (!editing) return
    const state = states[editing.crewId] || EMPTY
    const shift = shiftMinutes(state, shifts)
    if (!shift) return
    const start = Math.max(shift.start, editing.slot.start)
    const end = Math.min(shift.end, editing.slot.end)
    setStates((previous) => {
      const current = previous[editing.crewId] || EMPTY
      const ids = cellJobdeskIds(current, shifts, editing.slot)
      const nextIds = ids.includes(jobdeskId) ? ids.filter((id) => id !== jobdeskId) : [...ids, jobdeskId]
      const blocks = current.jobdeskBlocks.length
        ? current.jobdeskBlocks.filter((block) => !(block.mulaiMenit < end && block.selesaiMenit > start))
        : slots.flatMap((slot) => {
          const slotStart = Math.max(shift.start, slot.start)
          const slotEnd = Math.min(shift.end, slot.end)
          if (slotEnd <= slotStart || !(slotStart < start || slotEnd > end) || current.jobdeskIds.length === 0) return []
          return [{ mulaiMenit: slotStart, selesaiMenit: slotEnd, jobdeskIds: [...current.jobdeskIds] }]
        })
      if (nextIds.length) blocks.push({ mulaiMenit: start, selesaiMenit: end, jobdeskIds: nextIds })
      return { ...previous, [editing.crewId]: { ...current, jobdeskIds: [], jobdeskBlocks: blocks.sort((a, b) => a.mulaiMenit - b.mulaiMenit) } }
    })
  }

  async function saveDay() {
    setSaving(true)
    try {
      const payload = crews.map((crew) => {
        const state = states[crew.id] || EMPTY
        const shift = shiftMinutes(state, shifts)
        const blocks: JobdeskTimeBlock[] = shift ? slots.flatMap((slot) => {
          const start = Math.max(slot.start, shift.start)
          const end = Math.min(slot.end, shift.end)
          if (end <= start) return []
          const ids = cellJobdeskIds(state, shifts, slot)
          return ids.length ? [{ mulaiMenit: start, selesaiMenit: end, jobdeskIds: ids }] : []
        }) : []
        return { userId: crew.id, jamKerjaOpsiId: state.jamKerjaOpsiId, jobdeskIds: [...new Set(blocks.flatMap((block) => block.jobdeskIds))], jobdeskBlocks: blocks }
      })
      const result = await simpanJadwalHariIni(dateString, payload)
      if (!result.success) throw new Error(result.message)
      toast(`Jadwal ${dayLabel} berhasil disimpan`, 'success')
    } catch (error) {
      toast('Gagal menyimpan jadwal: ' + (error as Error).message, 'error')
    } finally { setSaving(false) }
  }

  return (
    <div className="flex min-h-full flex-col bg-cream pb-24">
      <div className="relative">
        <PageHeader title="Kelola Jadwal" backHref="/dashboard" rightSlot={<button onClick={() => setShowMenu((value) => !value)} className="text-xl text-white" aria-label="Pengaturan jadwal">⋮</button>} />
        {showMenu && <div className="absolute right-5 top-16 z-30 w-48 rounded-xl border border-cream-dim bg-cream-card p-2 shadow-md">
          <button onClick={() => { setShowJamKerjaModal(true); setShowMenu(false) }} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-cream-dim">Kelola Jam Kerja</button>
          <button onClick={() => { setShowJobdeskModal(true); setShowMenu(false) }} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-cream-dim">Kelola Jobdesk</button>
        </div>}
      </div>
      <section className="mt-4 space-y-3 px-5">
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] font-medium text-muted">Tanggal
            <input type="date" value={dateString} onChange={(event) => { const [y, m, d] = event.target.value.split('-').map(Number); setLoading(true); setDate(new Date(y, m - 1, d)) }} className="mt-1 w-full rounded-xl border border-cream-dim bg-cream-card px-3 py-2.5 text-sm text-ink" />
          </label>
          <label className="text-[11px] font-medium text-muted">Preset shift
            <select value={presetId ?? ''} onChange={(event) => { setShifts([]); setPresetId(Number(event.target.value) || null) }} className="mt-1 w-full rounded-xl border border-cream-dim bg-cream-card px-3 py-2.5 text-sm text-ink">
              {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.nama}</option>)}
            </select>
          </label>
        </div>
        <div className="flex items-center justify-between rounded-2xl border border-cream-dim bg-cream-card px-4 py-3">
          <button onClick={() => { setLoading(true); setDate((current) => new Date(current.getFullYear(), current.getMonth(), current.getDate() - 1)) }} className="px-2 text-xl text-brand" aria-label="Hari sebelumnya">‹</button>
          <div className="text-center"><p className="text-xs font-semibold capitalize text-ink">{dayLabel}</p><p className="mt-0.5 text-[10px] text-muted">Klik sel waktu untuk mengatur jobdesk</p></div>
          <button onClick={() => { setLoading(true); setDate((current) => new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1)) }} className="px-2 text-xl text-brand" aria-label="Hari berikutnya">›</button>
        </div>
      </section>

      <section className="mt-4 px-5">
        <div className="flex items-center justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-muted">Jadwal Harian</p><p className="mt-1 text-[11px] text-muted">Baris = crew · kolom = jam berurutan · jobdesk diatur per 2 jam dan mengikuti batas shift</p></div>
          <button onClick={saveDay} disabled={saving || loading || crews.length === 0} className="shrink-0 rounded-xl bg-brand px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">{saving ? 'Menyimpan…' : 'Simpan hari'}</button>
        </div>

        {loading ? <div className="mt-4"><Spinner /></div> : crews.length === 0 ? <p className="mt-3 rounded-xl border border-cream-dim bg-cream-card p-4 text-sm text-muted">Belum ada crew aktif.</p> : (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-cream-dim bg-cream-card">
            <table className="border-separate border-spacing-0 text-left">
              <thead><tr>
                <th className="sticky left-0 z-20 min-w-36 border-b border-r border-cream-dim bg-cream-card px-3 py-3 text-[10px] uppercase text-muted">Crew / Shift</th>
                {hourSlots.map((hour) => <th key={hour.start} aria-label={formatMinuteClock(hour.start)} className="min-w-16 border-b border-r border-cream-dim px-1 py-3 text-center text-[10px] font-semibold text-muted">{formatMinuteClock(hour.start).replace(' +1', '')}</th>)}
              </tr></thead>
              <tbody>{crews.map((crew) => {
                const state = states[crew.id] || EMPTY
                return <tr key={crew.id}>
                  <th className="sticky left-0 z-10 min-w-36 border-b border-r border-cream-dim bg-cream-card p-2 align-top">
                    <p className="truncate text-xs font-semibold text-ink">{crew.nama}</p>
                    <select value={state.jamKerjaOpsiId} onChange={(event) => changeShift(crew.id, event.target.value)} className="mt-1 w-full rounded-lg border border-cream-dim bg-white px-2 py-1.5 text-[10px] text-ink">
                      <option value="libur">Libur</option>
                      {state.jamKerjaOpsiId === 'jadwal-lama' && <option value="jadwal-lama">Lama · {state.jamMulaiLama?.slice(0, 5)}–{state.jamSelesaiLama?.slice(0, 5)}</option>}
                      {shifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.label} · {shift.jam_mulai.slice(0, 5)}–{shift.jam_selesai.slice(0, 5)}</option>)}
                    </select>
                  </th>
                  {slots.flatMap((slot) => {
                    const shift = shiftMinutes(state, shifts)
                    const activeStart = shift ? Math.max(slot.start, shift.start) : slot.start
                    const activeEnd = shift ? Math.min(slot.end, shift.end) : slot.end
                    const active = shift && activeStart < activeEnd
                    const ids = active ? cellJobdeskIds(state, shifts, slot) : []
                    const blockHours = hourSlots.filter((hour) => hour.start >= slot.start && hour.start < slot.end)
                    const button = (start: number, end: number, widthPercent = 100) => <button onClick={() => setEditing({ crewId: crew.id, slot })} className="absolute inset-y-0 flex w-full flex-wrap content-center justify-center gap-1 overflow-hidden rounded-lg bg-amber-100 px-1 py-1 text-center hover:ring-2 hover:ring-brand/30" style={{ left: 0, width: `${widthPercent}%` }} title={`${formatMinuteClock(start)}–${formatMinuteClock(end)} · ${ids.length ? ids.map((id) => jobdesks.find((jobdesk) => jobdesk.id === id)?.singkatan || '—').join(', ') : 'Belum diatur'}`}>
                      {ids.length ? ids.map((id) => <span key={id} className="rounded bg-white/70 px-1 py-1 text-[9px] font-semibold text-ink">{jobdesks.find((jobdesk) => jobdesk.id === id)?.singkatan || '—'}</span>) : <span className="text-[9px] text-muted">+ Jobdesk</span>}
                    </button>

                    if (active && activeStart <= slot.start && activeEnd >= slot.end) {
                      return <td key={slot.start} colSpan={blockHours.length} className="h-20 min-w-16 border-b border-r border-cream-dim p-1">
                        <div className="relative h-full w-full">{button(activeStart, activeEnd)}</div>
                      </td>
                    }

                    return blockHours.map((hour) => {
                      const hourStart = shift ? Math.max(hour.start, shift.start) : hour.start
                      const hourEnd = shift ? Math.min(hour.end, shift.end) : hour.end
                      const hourActive = Boolean(shift && hourStart < hourEnd)
                      const widthPercent = hourActive ? ((hourEnd - hourStart) / (hour.end - hour.start)) * 100 : 0
                      return <td key={hour.start} className={`h-20 min-w-16 border-b border-r border-cream-dim p-1 ${hourActive ? '' : 'bg-black/[0.025]'}`}>
                        <div className="relative h-full w-full">{hourActive && button(hourStart, hourEnd, widthPercent)}</div>
                      </td>
                    })
                  })}
                </tr>
              })}</tbody>
            </table>
          </div>
        )}
      </section>

      {editing && <div onClick={() => setEditing(null)} className="fixed inset-0 z-50 flex items-end bg-ink/40 sm:items-center sm:justify-center sm:p-6">
        <div onClick={(event) => event.stopPropagation()} className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-cream-card p-5 sm:max-w-md sm:rounded-3xl">
          <p className="text-sm font-semibold text-ink">Atur Jobdesk</p>
          <p className="mt-1 text-xs text-muted">{crews.find((crew) => crew.id === editing.crewId)?.nama} · {formatMinuteClock(Math.max(editing.slot.start, shiftMinutes(states[editing.crewId] || EMPTY, shifts)?.start || 0))}–{formatMinuteClock(Math.min(editing.slot.end, shiftMinutes(states[editing.crewId] || EMPTY, shifts)?.end || editing.slot.end))}</p>
          <div className="mt-4 space-y-2">{jobdesks.map((jobdesk) => <label key={jobdesk.id} className="flex items-center justify-between rounded-xl border border-cream-dim bg-white px-4 py-3">
            <span className="text-sm text-ink">{jobdesk.nama} <span className="text-muted">({jobdesk.singkatan})</span></span>
            <input type="checkbox" checked={cellJobdeskIds(states[editing.crewId] || EMPTY, shifts, editing.slot).includes(jobdesk.id)} onChange={() => toggleJobdesk(jobdesk.id)} className="h-4 w-4 accent-brand" />
          </label>)}</div>
          <button onClick={() => setEditing(null)} className="mt-4 w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white">Selesai</button>
        </div>
      </div>}

      {showJamKerjaModal && <JamKerjaModal onClose={() => setShowJamKerjaModal(false)} onChanged={async () => {
        const updatedPresets = await getPresets()
        setPresets(updatedPresets)
        if (!updatedPresets.some((preset) => preset.id === presetId)) setPresetId(updatedPresets[0]?.id ?? null)
        const updatedShifts = await getJamKerjaOptions(presetId)
        setShifts(updatedShifts)
      }} />}
      {showJobdeskModal && <JobdeskModal onClose={() => {
        setShowJobdeskModal(false)
        getJobdeskOptions().then(setJobdesks).catch((error) => toast('Gagal memuat jobdesk: ' + (error as Error).message, 'error'))
      }} />}
    </div>
  )
}
