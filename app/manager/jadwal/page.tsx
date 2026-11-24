'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDialog } from '@/components/ui/DialogProvider'
import { simpanJadwalHariIni } from '@/app/actions/jadwal'
import PageHeader from '@/components/PageHeader'
import Spinner from '@/components/Spinner'
import JamKerjaModal from '@/components/JamKerjaModal'
import JobdeskModal from '@/components/JobdeskModal'
import JobdeskPresetModal from '@/components/JobdeskPresetModal'
import { loadJobdeskPresets } from '@/app/actions/jobdesk-presets'
import type { JobdeskPreset } from '@/lib/jobdesk-presets'
import {
  Crew, CrewScheduleState, getCrewList, getJamKerjaOptions, getJobdeskOptions,
  getPresets, getScheduleStateForDate, getScheduleDayStatus, getScheduleWorkspaceConfig, JamKerjaOpsi, JamKerjaPreset,
  JobdeskOption, JobdeskTimeBlock, formatMinuteClock,
} from '@/lib/jadwal'
import { normalizeJobdeskBlocks, replaceJobdeskBlockRange } from '@/lib/jobdesk-blocks'

const EMPTY: CrewScheduleState = { jamKerjaOpsiId: 'libur', jobdeskIds: [], jobdeskBlocks: [], existingScheduleId: null }
const DAY_START = 6 * 60
// Kolom terakhir dimulai pukul 00:00 +1 dan mencakup sampai pukul 02:00 +1.
const DAY_END = 26 * 60
const FIXED_SLOT_MINUTES = 120
const FLEXIBLE_SLOT_MINUTES = 30
const PREVIEW_BAR_COLORS = [
  'border-amber-300 bg-amber-200',
  'border-cyan-300 bg-cyan-200',
  'border-emerald-300 bg-emerald-200',
  'border-pink-300 bg-pink-200',
  'border-violet-300 bg-violet-200',
  'border-orange-300 bg-orange-200',
]
function createSlots(minutes: number) {
  return Array.from({ length: (DAY_END - DAY_START) / minutes }, (_, i) => ({
    start: DAY_START + i * minutes,
    end: DAY_START + (i + 1) * minutes,
  }))
}
const fixedSlots = createSlots(FIXED_SLOT_MINUTES)
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

function blocksForShift(state: CrewScheduleState, shift: { start: number; end: number }) {
  if (state.jobdeskBlocks.length > 0) return normalizeJobdeskBlocks(state.jobdeskBlocks)
  return state.jobdeskIds.length > 0
    ? [{ mulaiMenit: shift.start, selesaiMenit: shift.end, jobdeskIds: [...state.jobdeskIds] }]
    : []
}

function durationLabel(minutes: number) {
  if (minutes < 60) return `${minutes} menit`
  if (minutes % 60 === 0) return `${minutes / 60} jam`
  return `${Math.floor(minutes / 60)} jam ${minutes % 60} menit`
}

type PreviewSegment = { start: number; end: number; jobdeskIds: number[] }

function getPreviewSegments(state: CrewScheduleState, shift: { start: number; end: number }): PreviewSegment[] {
  const segments: PreviewSegment[] = []
  const blocks = blocksForShift(state, shift)
    .map((block) => ({
      start: Math.max(shift.start, block.mulaiMenit),
      end: Math.min(shift.end, block.selesaiMenit),
      jobdeskIds: block.jobdeskIds,
    }))
    .filter((block) => block.end > block.start)
    .sort((left, right) => left.start - right.start)

  let cursor = shift.start
  for (const block of blocks) {
    if (block.start > cursor) segments.push({ start: cursor, end: block.start, jobdeskIds: [] })
    if (block.end > cursor) segments.push({ start: Math.max(cursor, block.start), end: block.end, jobdeskIds: block.jobdeskIds })
    cursor = Math.max(cursor, block.end)
  }
  if (cursor < shift.end) segments.push({ start: cursor, end: shift.end, jobdeskIds: [] })
  return segments.length ? segments : [{ start: shift.start, end: shift.end, jobdeskIds: [] }]
}

function previewHourLabel(minute: number) {
  return `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}${minute >= 1440 ? '+' : ''}`
}

export default function JadwalPage() {
  const { toast } = useDialog()
  const [date, setDate] = useState(() => new Date())
  const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const [crews, setCrews] = useState<Crew[]>([])
  const [presets, setPresets] = useState<JamKerjaPreset[]>([])
  const [presetId, setPresetId] = useState<number | null>(null)
  const [shifts, setShifts] = useState<JamKerjaOpsi[]>([])
  const [loadedPresetId, setLoadedPresetId] = useState<number | null>(null)
  const [jobdesks, setJobdesks] = useState<JobdeskOption[]>([])
  const [states, setStates] = useState<Record<string, CrewScheduleState>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [baseLoaded, setBaseLoaded] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [dayStatus, setDayStatus] = useState<{ date: string; updatedAt: string | null } | null>(null)
  const [openedDate, setOpenedDate] = useState<string | null>(null)
  const editorVisible = dayStatus?.date === dateString && (Boolean(dayStatus.updatedAt) || openedDate === dateString)
  const [editing, setEditing] = useState<{ crewId: string; slot: { start: number; end: number } } | null>(null)
  const [editingDuration, setEditingDuration] = useState(FIXED_SLOT_MINUTES)
  const [flexibleJobdeskBlocks, setFlexibleJobdeskBlocks] = useState(false)
  const [showSchedulePreview, setShowSchedulePreview] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showJamKerjaModal, setShowJamKerjaModal] = useState(false)
  const [showJobdeskModal, setShowJobdeskModal] = useState(false)
  const [showJobdeskPresetModal, setShowJobdeskPresetModal] = useState(false)
  const [jobdeskPresets, setJobdeskPresets] = useState<JobdeskPreset[]>([])
  const [jobdeskPresetError, setJobdeskPresetError] = useState('')
  const [selectedJobdeskPresetId, setSelectedJobdeskPresetId] = useState('')

  const refreshJobdeskPresets = useCallback(() => loadJobdeskPresets().then((result) => {
    if (!result.success) { setJobdeskPresets([]); setJobdeskPresetError(result.message); return }
    setJobdeskPresets(result.presets); setJobdeskPresetError('')
  }).catch(() => { setJobdeskPresets([]); setJobdeskPresetError('Gagal memuat preset jobdesk.') }), [])
  useEffect(() => { void refreshJobdeskPresets() }, [refreshJobdeskPresets])

  useEffect(() => {
    Promise.all([getCrewList(), getPresets(), getJobdeskOptions(), getScheduleWorkspaceConfig()]).then(([crewRows, presetRows, jobdeskRows, workspace]) => {
      setCrews(crewRows)
      setPresets(presetRows)
      setPresetId(presetRows[0]?.id ?? null)
      setJobdesks(jobdeskRows)
      setFlexibleJobdeskBlocks(workspace.flexibleJobdeskBlocks)
      setBaseLoaded(true)
    }).catch((error) => { setLoadError('Gagal memuat data jadwal: ' + (error as Error).message); setLoading(false) })
  }, [toast])

  useEffect(() => {
    let cancelled = false
    if (!baseLoaded || presetId !== loadedPresetId) return
    Promise.all([getScheduleStateForDate(dateString, crews, shifts), getScheduleDayStatus(dateString)]).then(([data, updatedAt]) => {
      if (!cancelled) { setStates(data); setDayStatus({ date: dateString, updatedAt }); setLoadError('') }
    }).catch((error) => {
      if (!cancelled) setLoadError((error as Error).message)
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [dateString, crews, shifts, presetId, loadedPresetId, baseLoaded])

  // Load active shift choices when the selected preset changes.
  useEffect(() => {
    if (!presetId) return
    let cancelled = false
    getJamKerjaOptions(presetId).then((options) => { if (!cancelled) { setShifts(options); setLoadedPresetId(presetId) } }).catch((error) => { if (!cancelled) { setLoadError('Gagal memuat shift: ' + (error as Error).message); setLoading(false) } })
    return () => { cancelled = true }
  }, [presetId, toast])

  const dayLabel = useMemo(() => new Date(`${dateString}T00:00:00`).toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }), [dateString])
  const scheduleSlots = useMemo(() => flexibleJobdeskBlocks ? createSlots(FLEXIBLE_SLOT_MINUTES) : fixedSlots, [flexibleJobdeskBlocks])

  function selectDate(nextDate: Date) {
    if (saving || Number.isNaN(nextDate.getTime())) return
    setLoading(true)
    setOpenedDate(null)
    setEditing(null)
    setShowSchedulePreview(false)
    setDate(nextDate)
  }

  const updatedLabel = dayStatus?.date === dateString && dayStatus.updatedAt
    ? new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).format(new Date(dayStatus.updatedAt))
    : null

  function changeShift(crewId: string, value: string) {
    setStates((previous) => ({
      ...previous,
      [crewId]: { ...(previous[crewId] || EMPTY), jamKerjaOpsiId: value === 'libur' ? 'libur' : value === 'jadwal-lama' ? 'jadwal-lama' : Number(value) },
    }))
  }

  function openJobdeskEditor(crewId: string, slot: { start: number; end: number }) {
    const shift = shiftMinutes(states[crewId] || EMPTY, shifts)
    const start = shift ? Math.max(shift.start, slot.start) : slot.start
    const end = shift ? Math.min(shift.end, slot.end) : slot.end
    setEditing({ crewId, slot })
    setEditingDuration(Math.max(FLEXIBLE_SLOT_MINUTES, flexibleJobdeskBlocks ? FLEXIBLE_SLOT_MINUTES : end - start))
    setSelectedJobdeskPresetId('')
  }

  const editingRange = useMemo(() => {
    if (!editing) return null
    const shift = shiftMinutes(states[editing.crewId] || EMPTY, shifts)
    if (!shift) return null
    const start = Math.max(shift.start, editing.slot.start)
    const maximumEnd = Math.min(shift.end, editing.slot.end + (flexibleJobdeskBlocks ? shift.end - editing.slot.end : 0))
    const end = flexibleJobdeskBlocks
      ? Math.min(maximumEnd, start + editingDuration)
      : Math.min(shift.end, editing.slot.end)
    return end > start ? { start, end, maximumEnd } : null
  }, [editing, editingDuration, flexibleJobdeskBlocks, shifts, states])

  function updateCellJobdesks(getNextIds: (currentIds: number[]) => number[]) {
    if (!editing) return
    const state = states[editing.crewId] || EMPTY
    const shift = shiftMinutes(state, shifts)
    if (!shift) return
    const range = editingRange
    if (!range) return
    const { start, end } = range
    setStates((previous) => {
      const current = previous[editing.crewId] || EMPTY
      const ids = cellJobdeskIds(current, shifts, editing.slot)
      const nextIds = getNextIds(ids)
      const blocks = replaceJobdeskBlockRange(blocksForShift(current, shift), start, end, nextIds)
      return { ...previous, [editing.crewId]: { ...current, jobdeskIds: [], jobdeskBlocks: blocks } }
    })
  }

  function toggleJobdesk(jobdeskId: number) {
    if (!editing) return
    const ids = cellJobdeskIds(states[editing.crewId] || EMPTY, shifts, editing.slot)
    if (!ids.includes(jobdeskId) && ids.length >= 5) { toast('Satu sel jadwal dapat memuat maksimal 5 jobdesk.', 'info'); return }
    setSelectedJobdeskPresetId('')
    updateCellJobdesks((current) => current.includes(jobdeskId) ? current.filter((id) => id !== jobdeskId) : [...current, jobdeskId])
  }

  function applyJobdeskPreset(value: string) {
    setSelectedJobdeskPresetId(value)
    const preset = jobdeskPresets.find((item) => item.id === Number(value))
    if (!preset) return
    if (!preset.jobdeskIds.length || preset.jobdeskIds.some((id) => !jobdesks.some((jobdesk) => jobdesk.id === id))) {
      toast('Isi preset sudah berubah atau kosong. Muat ulang preset terlebih dahulu.', 'error')
      setSelectedJobdeskPresetId('')
      return
    }
    updateCellJobdesks(() => [...preset.jobdeskIds])
  }

  async function saveDay() {
    if (saving || loading || loadError || !editorVisible || crews.length === 0) return
    setSaving(true)
    try {
      const payload = crews.map((crew) => {
        const state = states[crew.id] || EMPTY
        const shift = shiftMinutes(state, shifts)
        const blocks: JobdeskTimeBlock[] = shift
          ? flexibleJobdeskBlocks
            ? blocksForShift(state, shift)
            : scheduleSlots.flatMap((slot) => {
              const start = Math.max(slot.start, shift.start)
              const end = Math.min(slot.end, shift.end)
              if (end <= start) return []
              const ids = cellJobdeskIds(state, shifts, slot)
              return ids.length ? [{ mulaiMenit: start, selesaiMenit: end, jobdeskIds: ids }] : []
            })
          : []
        return { userId: crew.id, jamKerjaOpsiId: state.jamKerjaOpsiId, jobdeskIds: [...new Set(blocks.flatMap((block) => block.jobdeskIds))], jobdeskBlocks: blocks }
      })
      const result = await simpanJadwalHariIni(dateString, payload)
      if (!result.success) throw new Error(result.message)
      setDayStatus({ date: dateString, updatedAt: result.updatedAt! })
      toast(`Jadwal ${dayLabel} berhasil disimpan`, 'success')
    } catch (error) {
      toast('Gagal menyimpan jadwal: ' + (error as Error).message, 'error')
    } finally { setSaving(false) }
  }

  return (
    <div className="flex min-h-full flex-col bg-cream pb-24">
      <div className="relative">
        <PageHeader title="Kelola Jadwal" backHref="/dashboard" rightSlot={<button onClick={() => setShowMenu((value) => !value)} className="text-xl text-white" aria-label="Pengaturan jadwal">⋮</button>} />
        {showMenu && <div className="absolute right-5 top-16 z-30 w-56 rounded-xl border border-cream-dim bg-cream-card p-2 shadow-md">
          <button onClick={() => { setShowJamKerjaModal(true); setShowMenu(false) }} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-cream-dim">Kelola Jam Kerja</button>
          <button onClick={() => { setShowJobdeskModal(true); setShowMenu(false) }} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-cream-dim">Kelola Jobdesk</button>
          <button onClick={() => { setShowJobdeskPresetModal(true); setShowMenu(false) }} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-cream-dim">Kelola Preset Jobdesk</button>
        </div>}
      </div>
      <section className="mt-4 space-y-3 px-5">
        <div className={`grid gap-2 ${editorVisible ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <label className="text-[11px] font-medium text-muted">Tanggal
            <input type="date" value={dateString} disabled={saving} onChange={(event) => { if (!event.target.value || event.target.value === dateString) return; const [y, m, d] = event.target.value.split('-').map(Number); selectDate(new Date(y, m - 1, d)) }} className="mt-1 w-full rounded-xl border border-cream-dim bg-cream-card px-3 py-2.5 text-sm text-ink" />
          </label>
          {editorVisible && <label className="text-[11px] font-medium text-muted">Preset shift
            <select value={presetId ?? ''} disabled={saving} onChange={(event) => { setLoading(true); setShifts([]); setPresetId(Number(event.target.value) || null) }} className="mt-1 w-full rounded-xl border border-cream-dim bg-cream-card px-3 py-2.5 text-sm text-ink">
              {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.nama}</option>)}
            </select>
          </label>}
        </div>
        <div className="flex items-center justify-between rounded-2xl border border-cream-dim bg-cream-card px-4 py-3">
          <button disabled={saving} onClick={() => selectDate(new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1))} className="px-2 text-xl text-brand" aria-label="Hari sebelumnya">‹</button>
          <div className="text-center"><p className="text-xs font-semibold capitalize text-ink">{dayLabel}</p>{editorVisible && <p className="mt-0.5 text-[10px] text-muted">{flexibleJobdeskBlocks ? 'Klik slot 30 menit, lalu pilih durasi blok jobdesk.' : 'Klik sel waktu untuk mengatur jobdesk'}</p>}</div>
          <button disabled={saving} onClick={() => selectDate(new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1))} className="px-2 text-xl text-brand" aria-label="Hari berikutnya">›</button>
        </div>
      </section>

      <section className="mt-4 px-5">
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Jadwal Harian</p>
          {editorVisible && <button onClick={saveDay} disabled={saving || loading || Boolean(loadError) || crews.length === 0} className="shrink-0 rounded-xl bg-brand px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">{saving ? 'Menyimpan…' : 'Simpan hari'}</button>}
        </div>
        {!loading && !loadError && <p className={`mt-2 text-[11px] leading-relaxed ${updatedLabel ? 'text-brand' : 'text-muted'}`}>{updatedLabel ? `Jadwal sudah diperbarui tanggal ${updatedLabel} WIB` : editorVisible ? 'Jadwal belum disimpan.' : 'Jadwal hari ini belum diedit.'}</p>}

        {loading ? <div className="mt-4"><Spinner /></div> : loadError ? <p role="alert" className="mt-3 rounded-xl bg-warning/10 p-4 text-sm text-warning">{loadError}</p> : crews.length === 0 ? <p className="mt-3 rounded-xl border border-cream-dim bg-cream-card p-4 text-sm text-muted">Belum ada crew aktif.</p> : !editorVisible ? (
          <div className="mt-3 rounded-2xl border border-cream-dim bg-cream-card p-5 text-center">
            <p className="text-sm text-ink">Jadwal hari ini belum diedit. Edit sekarang?</p>
            <button onClick={() => setOpenedDate(dateString)} className="mt-4 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white">Edit sekarang</button>
          </div>
        ) : (
          <>
          <div className="mt-3 overflow-x-auto rounded-2xl border border-cream-dim bg-cream-card">
            <table className="border-separate border-spacing-0 text-left">
              <thead><tr>
                <th className="sticky left-0 z-20 min-w-36 border-b border-r border-cream-dim bg-cream-card px-3 py-3 text-[10px] uppercase text-muted">Crew / Shift</th>
                {(flexibleJobdeskBlocks ? scheduleSlots : hourSlots).map((slot) => <th key={slot.start} aria-label={formatMinuteClock(slot.start)} className={`${flexibleJobdeskBlocks ? 'min-w-12' : 'min-w-16'} border-b border-r border-cream-dim px-1 py-3 text-center text-[10px] font-semibold text-muted`}>{formatMinuteClock(slot.start).replace(' +1', '')}</th>)}
              </tr></thead>
              <tbody>{crews.map((crew) => {
                const state = states[crew.id] || EMPTY
                return <tr key={crew.id}>
                  <th className="sticky left-0 z-10 min-w-36 border-b border-r border-cream-dim bg-cream-card p-2 align-top">
                    <p className="truncate text-xs font-semibold text-ink">{crew.nama}</p>
                    <select value={state.jamKerjaOpsiId} disabled={saving} onChange={(event) => changeShift(crew.id, event.target.value)} className="mt-1 w-full rounded-lg border border-cream-dim bg-white px-2 py-1.5 text-[10px] text-ink">
                      <option value="libur">Libur</option>
                      {state.jamKerjaOpsiId === 'jadwal-lama' && <option value="jadwal-lama">Lama · {state.jamMulaiLama?.slice(0, 5)}–{state.jamSelesaiLama?.slice(0, 5)}</option>}
                      {shifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.label} · {shift.jam_mulai.slice(0, 5)}–{shift.jam_selesai.slice(0, 5)}</option>)}
                    </select>
                  </th>
                  {flexibleJobdeskBlocks ? scheduleSlots.map((slot) => {
                    const shift = shiftMinutes(state, shifts)
                    const start = shift ? Math.max(slot.start, shift.start) : slot.start
                    const end = shift ? Math.min(slot.end, shift.end) : slot.end
                    const active = Boolean(shift && start < end)
                    const ids = active ? cellJobdeskIds(state, shifts, slot) : []
                    return <td key={slot.start} className={`h-20 min-w-12 border-b border-r border-cream-dim p-1 ${active ? '' : 'bg-black/[0.025]'}`}>
                      <div className="relative h-full w-full">
                        {active && <button disabled={saving} onClick={() => openJobdeskEditor(crew.id, slot)} className="absolute inset-y-0 flex w-full flex-wrap content-center justify-center gap-0.5 overflow-hidden rounded-lg bg-amber-100 px-0.5 py-1 text-center hover:ring-2 hover:ring-brand/30" title={`${formatMinuteClock(start)}–${formatMinuteClock(end)} · ${ids.length ? ids.map((id) => jobdesks.find((jobdesk) => jobdesk.id === id)?.singkatan || '—').join(', ') : 'Belum diatur'}`}>
                          {ids.length ? ids.map((id) => <span key={id} className="max-w-full break-all rounded bg-white/70 px-0.5 py-1 text-[8px] font-semibold text-ink">{jobdesks.find((jobdesk) => jobdesk.id === id)?.singkatan || '—'}</span>) : <span className="text-[8px] text-muted">+</span>}
                        </button>}
                      </div>
                    </td>
                  }) : fixedSlots.flatMap((slot) => {
                    const shift = shiftMinutes(state, shifts)
                    const activeStart = shift ? Math.max(slot.start, shift.start) : slot.start
                    const activeEnd = shift ? Math.min(slot.end, shift.end) : slot.end
                    const active = shift && activeStart < activeEnd
                    const ids = active ? cellJobdeskIds(state, shifts, slot) : []
                    const blockHours = hourSlots.filter((hour) => hour.start >= slot.start && hour.start < slot.end)
                    const button = (start: number, end: number, widthPercent = 100) => <button disabled={saving} onClick={() => openJobdeskEditor(crew.id, slot)} className="absolute inset-y-0 flex w-full flex-wrap content-center justify-center gap-1 overflow-hidden rounded-lg bg-amber-100 px-1 py-1 text-center hover:ring-2 hover:ring-brand/30" style={{ left: 0, width: `${widthPercent}%` }} title={`${formatMinuteClock(start)}–${formatMinuteClock(end)} · ${ids.length ? ids.map((id) => jobdesks.find((jobdesk) => jobdesk.id === id)?.singkatan || '—').join(', ') : 'Belum diatur'}`}>
                      {ids.length ? ids.map((id) => <span key={id} className="max-w-full break-all rounded bg-white/70 px-1 py-1 text-[9px] font-semibold text-ink">{jobdesks.find((jobdesk) => jobdesk.id === id)?.singkatan || '—'}</span>) : <span className="text-[9px] text-muted">+ Jobdesk</span>}
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
          <div className="mt-3 flex justify-end">
            <button type="button" onClick={() => setShowSchedulePreview(true)} className="rounded-xl border border-brand px-4 py-2.5 text-xs font-semibold text-brand hover:bg-brand/5">
              Preview Jadwal Crew
            </button>
          </div>
          </>
        )}
      </section>

      {showSchedulePreview && <SchedulePreviewModal dayLabel={dayLabel} crews={crews} states={states} shifts={shifts} jobdesks={jobdesks} onClose={() => setShowSchedulePreview(false)} />}

      {editing && <div onClick={() => setEditing(null)} className="fixed inset-0 z-50 flex items-end bg-ink/40 sm:items-center sm:justify-center sm:p-6">
        <div onClick={(event) => event.stopPropagation()} className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-cream-card p-5 sm:max-w-md sm:rounded-3xl">
          <p className="text-sm font-semibold text-ink">Atur Jobdesk</p>
          <p className="mt-1 text-xs text-muted">{crews.find((crew) => crew.id === editing.crewId)?.nama} · {editingRange ? `${formatMinuteClock(editingRange.start)}–${formatMinuteClock(editingRange.end)}` : 'Pilih shift terlebih dahulu'}</p>
          {flexibleJobdeskBlocks && editingRange && <label className="mt-4 block text-xs text-muted">Durasi blok
            <select value={editingDuration} onChange={(event) => setEditingDuration(Number(event.target.value))} className="mt-1 w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm text-ink">
              {Array.from({ length: Math.floor((editingRange.maximumEnd - editingRange.start) / FLEXIBLE_SLOT_MINUTES) }, (_, index) => (index + 1) * FLEXIBLE_SLOT_MINUTES).map((minutes) => <option key={minutes} value={minutes}>{durationLabel(minutes)} · sampai {formatMinuteClock(editingRange.start + minutes)}</option>)}
            </select>
            <span className="mt-1 block leading-relaxed">Semua waktu dalam shift harus terisi jobdesk. Pilih durasi lebih panjang untuk langsung membuat blok 1–4 jam atau sesuai kebutuhan.</span>
          </label>}
          <label className="mt-4 block text-xs text-muted">Preset jobdesk
            <select value={selectedJobdeskPresetId} onChange={(event) => applyJobdeskPreset(event.target.value)} className="mt-1 w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm text-ink">
              <option value="">Pilih preset jobdesk</option>
              {jobdeskPresets.map((preset) => <option key={preset.id} value={preset.id} disabled={!preset.jobdeskIds.length}>{preset.nama} · {preset.jobdeskIds.map((id) => jobdesks.find((jobdesk) => jobdesk.id === id)?.singkatan).filter(Boolean).join(', ')}</option>)}
            </select>
          </label>
          {jobdeskPresetError && <p role="alert" className="mt-2 text-xs text-warning">{jobdeskPresetError}</p>}
          {!jobdeskPresetError && !jobdeskPresets.length && <p className="mt-2 text-xs text-muted">Belum ada preset. Tambahkan melalui menu Kelola Preset Jobdesk.</p>}
          <div className="mt-4 space-y-2">{jobdesks.map((jobdesk) => <label key={jobdesk.id} className="flex items-center justify-between rounded-xl border border-cream-dim bg-white px-4 py-3">
            <span className="min-w-0 flex-1 break-words pr-3 text-sm text-ink">{jobdesk.nama} <span className="text-muted">({jobdesk.singkatan})</span></span>
            <input type="checkbox" checked={cellJobdeskIds(states[editing.crewId] || EMPTY, shifts, editing.slot).includes(jobdesk.id)} onChange={() => toggleJobdesk(jobdesk.id)} className="h-4 w-4 shrink-0 accent-brand" />
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
        void refreshJobdeskPresets()
      }} />}
      {showJobdeskPresetModal && <JobdeskPresetModal jobdesks={jobdesks} onClose={() => setShowJobdeskPresetModal(false)} onChanged={() => { void refreshJobdeskPresets() }} />}
    </div>
  )
}

function SchedulePreviewModal({
  dayLabel,
  crews,
  states,
  shifts,
  jobdesks,
  onClose,
}: {
  dayLabel: string
  crews: Crew[]
  states: Record<string, CrewScheduleState>
  shifts: JamKerjaOpsi[]
  jobdesks: JobdeskOption[]
  onClose: () => void
}) {
  const scheduledCrews = crews.flatMap((crew, index) => {
    const shift = shiftMinutes(states[crew.id] || EMPTY, shifts)
    if (!shift) return []
    return [{ crew, index, segments: getPreviewSegments(states[crew.id] || EMPTY, shift) }]
  })
  const timelineColumns = `minmax(120px, 180px) repeat(${hourSlots.length}, minmax(56px, 1fr))`
  const totalMinutes = DAY_END - DAY_START

  function segmentJobdeskLabel(segment: PreviewSegment) {
    return segment.jobdeskIds
      .map((id) => jobdesks.find((jobdesk) => jobdesk.id === id)?.singkatan)
      .filter((singkatan): singkatan is string => Boolean(singkatan))
      .join(' + ')
  }

  function segmentDescription(segment: PreviewSegment) {
    return `${segmentJobdeskLabel(segment) || 'Tanpa jobdesk'} · ${formatMinuteClock(segment.start)}–${formatMinuteClock(segment.end)}`
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-[60] flex items-end bg-ink/40 sm:items-center sm:justify-center sm:p-6">
      <section role="dialog" aria-modal="true" aria-labelledby="preview-jadwal-title" onClick={(event) => event.stopPropagation()} className="max-h-[88vh] w-full overflow-hidden rounded-t-3xl bg-cream-card shadow-2xl sm:max-w-6xl sm:rounded-3xl">
        <header className="flex items-start justify-between gap-4 border-b border-cream-dim px-5 py-4">
          <div>
            <h2 id="preview-jadwal-title" className="text-base font-bold text-ink">Preview Jadwal Crew</h2>
            <p className="mt-1 text-xs text-muted">{dayLabel} · Perubahan di tabel edit langsung tercermin di sini.</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl text-muted hover:bg-cream" aria-label="Tutup preview jadwal">×</button>
        </header>
        <div className="max-h-[calc(88vh-5rem)] overflow-auto p-4">
          {!scheduledCrews.length ? <p className="rounded-xl border border-cream-dim bg-cream p-4 text-sm text-muted">Belum ada crew yang dijadwalkan bekerja pada hari ini.</p> : <div className="min-w-[1240px] overflow-hidden rounded-xl border border-cream-dim">
            <div className="grid border-b border-cream-dim bg-cream text-[10px] font-semibold text-muted" style={{ gridTemplateColumns: timelineColumns }}>
              <div className="sticky left-0 z-20 border-r border-cream-dim bg-cream px-3 py-3 uppercase">Crew</div>
              {hourSlots.map((slot) => <div key={slot.start} className="border-r border-cream-dim px-1 py-3 text-center last:border-r-0">{previewHourLabel(slot.start)}</div>)}
            </div>
            {scheduledCrews.map(({ crew, index, segments }) => <div key={crew.id} className="grid border-b border-cream-dim last:border-b-0" style={{ gridTemplateColumns: timelineColumns }}>
              <div className="sticky left-0 z-10 flex min-h-20 items-center border-r border-cream-dim bg-cream-card px-3 text-xs font-semibold text-ink">{crew.nama}</div>
              <div className="relative min-h-20 overflow-hidden" style={{ gridColumn: `span ${hourSlots.length} / span ${hourSlots.length}` }}>
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${hourSlots.length}, minmax(0, 1fr))` }}>
                  {hourSlots.map((slot) => <span key={slot.start} className="border-r border-cream-dim last:border-r-0" />)}
                </div>
                {segments.map((segment) => {
                  const jobdeskLabel = segmentJobdeskLabel(segment) || 'Tanpa jobdesk'
                  const description = segmentDescription(segment)
                  const left = ((segment.start - DAY_START) / totalMinutes) * 100
                  const width = ((segment.end - segment.start) / totalMinutes) * 100
                  return <div key={`${segment.start}-${segment.end}-${segment.jobdeskIds.join('-')}`} title={description} className={`absolute top-2 bottom-2 z-10 flex min-w-0 items-center rounded-lg border px-2 text-[10px] font-semibold text-ink shadow-sm ${PREVIEW_BAR_COLORS[index % PREVIEW_BAR_COLORS.length]}`} style={{ left: `${left}%`, width: `${width}%` }}>
                    <span className="truncate">{jobdeskLabel}</span>
                  </div>
                })}
              </div>
            </div>)}
          </div>}
          <p className="mt-3 text-xs text-muted">Geser mendatar untuk melihat seluruh jam. Shift yang melewati tengah malam berlanjut ke hari berikutnya.</p>
        </div>
      </section>
    </div>
  )
}
