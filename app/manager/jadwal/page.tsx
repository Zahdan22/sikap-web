'use client'

import { useEffect, useState } from 'react'
import {
  getWeekDates,
  formatDateId,
  toDateString,
} from '@/lib/date-utils'
import {
  getCrewList,
  getJamKerjaOptions,
  getJobdeskOptions,
  getScheduleStateForDate,
  getDailySchedules,
  Crew,
  DailySchedule,
  JamKerjaOpsi,
  JobdeskOption,
  CrewScheduleState,
  getPresets,
  JamKerjaPreset,
} from '@/lib/jadwal'
import { simpanJadwalHariIni } from '@/app/actions/jadwal'
import { useDialog } from '@/components/ui/DialogProvider'
import PageHeader from '@/components/PageHeader'
import JamKerjaModal from '@/components/JamKerjaModal'
import JobdeskModal from '@/components/JobdeskModal'
import Spinner from '@/components/Spinner'

const EMPTY_STATE: CrewScheduleState = {
  jamKerjaOpsiId: 'libur',
  jobdeskIds: [],
  existingScheduleId: null,
}

export default function JadwalPage() {
  const { toast } = useDialog()
  const [referenceDate, setReferenceDate] = useState(new Date())
  const [selectedCrewId, setSelectedCrewId] = useState('')
  const [crewList, setCrewList] = useState<Crew[]>([])
  const [jamKerjaOptions, setJamKerjaOptions] = useState<JamKerjaOpsi[]>([])
  const [jobdeskOptions, setJobdeskOptions] = useState<JobdeskOption[]>([])
  const [scheduleByDate, setScheduleByDate] = useState<Record<string, CrewScheduleState>>({})
  const [timelineDate, setTimelineDate] = useState(toDateString(getWeekDates(new Date())[0]))
  const [daySchedules, setDaySchedules] = useState<DailySchedule[]>([])
  const [loadingTimeline, setLoadingTimeline] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [openJobdeskFor, setOpenJobdeskFor] = useState<string | null>(null)
  const [showMenu, setShowMenu] = useState(false)
  const [showJamKerjaModal, setShowJamKerjaModal] = useState(false)
  const [showJobdeskModal, setShowJobdeskModal] = useState(false)
  const [presets, setPresets] = useState<JamKerjaPreset[]>([])
  const [activePresetId, setActivePresetId] = useState<number | null>(null)
  const [copySource, setCopySource] = useState<string | null>(null)
  const [copyTargets, setCopyTargets] = useState<string[]>([])

  const weekDates = getWeekDates(referenceDate)
  const weekDateStrings = weekDates.map(toDateString)
  const weekStartDate = weekDateStrings[0]
  const selectedCrew = crewList.find((crew) => crew.id === selectedCrewId)
  const timelineShifts = daySchedules.map((schedule) => {
    const [startHour, startMinute = '0'] = schedule.jamMulai.split(':')
    const [endHour, endMinute = '0'] = schedule.jamSelesai.split(':')
    const start = Number(startHour) + Number(startMinute) / 60
    let end = Number(endHour) + Number(endMinute) / 60
    if (end <= start) end += 24
    return { schedule, start, end }
  })
  const timelineStartHour = timelineShifts.length
    ? Math.min(8, Math.floor(Math.min(...timelineShifts.map((shift) => shift.start))))
    : 8
  const timelineEndHour = timelineShifts.length
    ? Math.max(24, Math.ceil(Math.max(...timelineShifts.map((shift) => shift.end))))
    : 24
  const timelineHourCount = timelineEndHour - timelineStartHour
  const hourWidth = 56
  const timelineWidth = timelineHourCount * hourWidth

  useEffect(() => {
    async function loadMasterData() {
      try {
        const [crew, jobdesk, presetList] = await Promise.all([
          getCrewList(),
          getJobdeskOptions(),
          getPresets(),
        ])
        setCrewList(crew)
        setJobdeskOptions(jobdesk)
        setPresets(presetList)
        if (crew.length > 0) setSelectedCrewId(crew[0].id)
        if (presetList.length > 0) setActivePresetId(presetList[0].id)
      } catch (error) {
        toast('Gagal memuat data jadwal: ' + (error as Error).message, 'error')
      }
    }
    loadMasterData()
  }, [toast])

  useEffect(() => {
    async function loadJamKerja() {
      try {
        const data = await getJamKerjaOptions(activePresetId)
        setJamKerjaOptions(data)
      } catch (error) {
        toast('Gagal memuat pilihan jam kerja: ' + (error as Error).message, 'error')
      }
    }
    loadJamKerja()
  }, [activePresetId, toast])

  useEffect(() => {
    if (!selectedCrewId || jamKerjaOptions.length === 0) {
      setScheduleByDate({})
      return
    }

    let cancelled = false
    const datesToLoad = getWeekDates(new Date(`${weekStartDate}T00:00:00`)).map(toDateString)
    async function loadWeekSchedule() {
      setLoading(true)
      try {
        const rows = await Promise.all(datesToLoad.map(async (date) => {
          const state = await getScheduleStateForDate(
            date,
            crewList.filter((crew) => crew.id === selectedCrewId),
            jamKerjaOptions,
          )
          return [date, state[selectedCrewId] ?? EMPTY_STATE] as const
        }))
        if (!cancelled) setScheduleByDate(Object.fromEntries(rows))
      } catch (error) {
        if (!cancelled) toast('Gagal memuat jadwal minggu ini: ' + (error as Error).message, 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadWeekSchedule()
    return () => { cancelled = true }
  }, [selectedCrewId, weekStartDate, jamKerjaOptions, crewList, toast])

  useEffect(() => {
    setTimelineDate(weekStartDate)
  }, [weekStartDate])

  useEffect(() => {
    let cancelled = false
    async function loadDaySchedules() {
      setLoadingTimeline(true)
      try {
        const schedules = await getDailySchedules(timelineDate)
        if (!cancelled) setDaySchedules(schedules)
      } catch (error) {
        if (!cancelled) toast('Gagal memuat cakupan jadwal: ' + (error as Error).message, 'error')
      } finally {
        if (!cancelled) setLoadingTimeline(false)
      }
    }
    loadDaySchedules()
    return () => { cancelled = true }
  }, [timelineDate, toast])

  function moveWeek(offset: number) {
    setReferenceDate((current) => {
      const next = new Date(current)
      next.setDate(next.getDate() + offset * 7)
      return next
    })
  }

  function updateJamKerja(date: string, value: string) {
    setScheduleByDate((previous) => ({
      ...previous,
      [date]: {
        ...(previous[date] ?? EMPTY_STATE),
        jamKerjaOpsiId: value === 'libur' || value === 'jadwal-lama' ? value : Number(value),
      },
    }))
  }

  function toggleJobdesk(date: string, jobdeskId: number) {
    setScheduleByDate((previous) => {
      const state = previous[date] ?? EMPTY_STATE
      const selected = state.jobdeskIds.includes(jobdeskId)
      if (!selected && state.jobdeskIds.length >= 5) {
        toast('Maksimal 5 jobdesk per shift', 'error')
        return previous
      }
      return {
        ...previous,
        [date]: {
          ...state,
          jobdeskIds: selected
            ? state.jobdeskIds.filter((id) => id !== jobdeskId)
            : [...state.jobdeskIds, jobdeskId],
        },
      }
    })
  }

  function copyDaySchedule() {
    if (!copySource || copyTargets.length === 0) return
    const source = scheduleByDate[copySource] ?? EMPTY_STATE
    setScheduleByDate((previous) => {
      const next = { ...previous }
      for (const target of copyTargets) {
        next[target] = { ...source, jobdeskIds: [...source.jobdeskIds] }
      }
      return next
    })
    setCopySource(null)
    setCopyTargets([])
    toast(`Jadwal disalin ke ${copyTargets.length} hari`, 'success')
  }

  async function handleSave() {
    if (!selectedCrewId) return
    setSaving(true)
    try {
      for (const date of weekDateStrings) {
        const state = scheduleByDate[date] ?? EMPTY_STATE
        const result = await simpanJadwalHariIni(date, [{
          userId: selectedCrewId,
          jamKerjaOpsiId: state.jamKerjaOpsiId,
          jobdeskIds: state.jobdeskIds,
        }])
        if (!result.success) {
          toast(`Gagal menyimpan ${date}: ${result.message}`, 'error')
          return
        }
      }
      toast(`Jadwal ${selectedCrew?.nama ?? 'crew'} berhasil disimpan`, 'success')
      const rows = await Promise.all(weekDateStrings.map(async (date) => {
        const state = await getScheduleStateForDate(
          date,
          crewList.filter((crew) => crew.id === selectedCrewId),
          jamKerjaOptions,
        )
        return [date, state[selectedCrewId] ?? EMPTY_STATE] as const
      }))
      setScheduleByDate(Object.fromEntries(rows))
    } catch (error) {
      toast('Gagal menyimpan jadwal: ' + (error as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-cream pb-24">
      <div className="relative">
        <PageHeader
          title="Kelola Jadwal"
          backHref="/dashboard"
          rightSlot={<button onClick={() => setShowMenu((value) => !value)} className="text-xl text-white" aria-label="Menu pengaturan jadwal">⋮</button>}
        />
        {showMenu && (
          <div className="absolute right-5 top-16 z-10 w-48 rounded-xl border border-cream-dim bg-cream-card p-2 shadow-md">
            <button onClick={() => { setShowJamKerjaModal(true); setShowMenu(false) }} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-cream-dim">
              Kelola Jam Kerja
            </button>
            <button onClick={() => { setShowJobdeskModal(true); setShowMenu(false) }} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-cream-dim">
              Kelola Jobdesk
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 space-y-3 px-5">
        <div>
          <label htmlFor="crew-select" className="mb-1 block text-xs font-medium text-muted">Pilih Crew</label>
          <select id="crew-select" value={selectedCrewId} onChange={(event) => setSelectedCrewId(event.target.value)} disabled={crewList.length === 0} className="w-full rounded-xl border border-cream-dim bg-cream-card px-4 py-3 text-sm font-semibold text-ink outline-none focus:border-brand disabled:opacity-60">
            {crewList.map((crew) => <option key={crew.id} value={crew.id}>{crew.nama}</option>)}
            {crewList.length === 0 && <option value="">Belum ada crew aktif</option>}
          </select>
        </div>

        <div>
          <label htmlFor="preset-select" className="mb-1 block text-xs font-medium text-muted">Preset Jam Kerja</label>
          <select id="preset-select" value={activePresetId ?? ''} onChange={(event) => setActivePresetId(Number(event.target.value))} className="w-full rounded-xl border border-cream-dim bg-cream-card px-4 py-2.5 text-sm text-ink outline-none focus:border-brand">
            {presets.length === 0 && <option value="">-- Belum ada preset --</option>}
            {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.nama}</option>)}
          </select>
        </div>

        <div className="flex items-center justify-between rounded-2xl border border-cream-dim bg-cream-card px-4 py-3">
          <button onClick={() => moveWeek(-1)} className="px-2 text-xl text-brand" aria-label="Minggu sebelumnya">‹</button>
          <p className="text-xs font-medium text-ink">{formatDateId(weekDates[0])} – {formatDateId(weekDates[6])}</p>
          <button onClick={() => moveWeek(1)} className="px-2 text-xl text-brand" aria-label="Minggu berikutnya">›</button>
        </div>
      </div>

      <section className="mt-5 px-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Cakupan Jadwal Harian</p>
            <p className="mt-1 text-sm font-semibold capitalize text-ink">
              {new Date(`${timelineDate}T00:00:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {weekDates.map((date) => {
            const dateString = toDateString(date)
            const selected = timelineDate === dateString
            return (
              <button key={dateString} onClick={() => setTimelineDate(dateString)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium ${selected ? 'bg-brand text-white' : 'border border-cream-dim bg-cream-card text-ink'}`}>
                {formatDateId(date)}
              </button>
            )
          })}
        </div>

        <div className="mt-2 overflow-x-auto rounded-2xl border border-cream-dim bg-cream-card p-3">
          {loadingTimeline ? <Spinner /> : daySchedules.length === 0 ? (
            <p className="py-5 text-center text-sm text-muted">Belum ada jadwal crew pada hari ini.</p>
          ) : (
            <div style={{ minWidth: `${96 + timelineWidth}px` }}>
              <div className="grid items-end border-b border-cream-dim pb-2" style={{ gridTemplateColumns: `88px ${timelineWidth}px` }}>
                <span className="text-[10px] font-medium text-muted">CREW</span>
                <div className="flex">
                  {Array.from({ length: timelineHourCount + 1 }, (_, index) => {
                    const hour = timelineStartHour + index
                    const label = `${String(hour % 24).padStart(2, '0')}${hour >= 24 ? '+' : ''}`
                    return <span key={hour} className="shrink-0 text-[10px] text-muted" style={{ width: `${hourWidth}px` }}>{label}</span>
                  })}
                </div>
              </div>
              <div className="divide-y divide-cream-dim">
                {timelineShifts.map(({ schedule, start, end }, index) => {
                  const palette = ['#fde68a', '#a5f3fc', '#bbf7d0', '#fbcfe8', '#ddd6fe', '#fed7aa']
                  const color = palette[index % palette.length]
                  const left = (start - timelineStartHour) * hourWidth
                  const width = (end - start) * hourWidth
                  const jobdeskText = schedule.jobdeskLabels.length > 0 ? schedule.jobdeskLabels.join(', ') : 'Jobdesk belum dipilih'
                  return (
                    <div key={schedule.id} className="grid items-center py-1.5" style={{ gridTemplateColumns: `88px ${timelineWidth}px` }}>
                      <span className="truncate pr-2 text-xs font-medium text-ink" title={schedule.nama}>{schedule.nama}</span>
                      <div className="relative h-9" style={{ width: `${timelineWidth}px`, backgroundImage: 'linear-gradient(to right, rgba(120, 113, 108, 0.18) 1px, transparent 1px)', backgroundSize: `${hourWidth}px 100%` }}>
                        <div
                          title={`${schedule.nama}: ${schedule.jamMulai.slice(0, 5)}–${schedule.jamSelesai.slice(0, 5)} · ${jobdeskText}`}
                          className="absolute top-0.5 flex h-8 items-center overflow-hidden rounded-md border border-black/10 px-2 text-[10px] font-semibold text-ink"
                          style={{ left: `${left}px`, width: `${width}px`, backgroundColor: color }}
                        >
                          <span className="truncate">{jobdeskText} · {schedule.jamMulai.slice(0, 5)}–{schedule.jamSelesai.slice(0, 5)}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
        <p className="mt-1 text-[10px] text-muted">Geser mendatar untuk melihat seluruh jam. Shift yang melewati tengah malam diteruskan ke hari berikutnya.</p>
      </section>

      <div className="mt-5 px-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Jadwal {selectedCrew?.nama ?? 'Crew'}</p>
          <button onClick={handleSave} disabled={saving || loading || !selectedCrewId || jamKerjaOptions.length === 0} className="rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-white disabled:opacity-60">
            {saving ? 'Menyimpan...' : 'Simpan Minggu Ini'}
          </button>
        </div>

        {loading ? <div className="mt-4"><Spinner /></div> : jamKerjaOptions.length === 0 ? (
          <p className="mt-3 rounded-xl border border-cream-dim bg-cream-card px-4 py-3 text-sm text-muted">Preset ini belum memiliki pilihan jam kerja. Tambahkan shift dari menu pengaturan jadwal terlebih dahulu.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {weekDates.map((date) => {
              const dateString = toDateString(date)
              const state = scheduleByDate[dateString] ?? EMPTY_STATE
              const isLibur = state.jamKerjaOpsiId === 'libur'
              const selectedOption = jamKerjaOptions.find((option) => option.id === state.jamKerjaOpsiId)
              return (
                <section key={dateString} className="rounded-2xl border border-cream-dim bg-cream-card p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold capitalize text-ink">{date.toLocaleDateString('id-ID', { weekday: 'long' })}</p>
                      <p className="text-xs text-muted">{date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })}</p>
                    </div>
                    <button onClick={() => { setCopySource(dateString); setCopyTargets([]) }} className="text-xs font-semibold text-brand">Salin ke hari lain</button>
                  </div>

                <select value={isLibur ? 'libur' : state.jamKerjaOpsiId} onChange={(event) => updateJamKerja(dateString, event.target.value)} className="mt-3 w-full rounded-lg border border-cream-dim bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-brand">
                    <option value="libur">Libur</option>
                    {state.jamKerjaOpsiId === 'jadwal-lama' && <option value="jadwal-lama">Jadwal tersimpan ({state.jamMulaiLama?.slice(0, 5)}–{state.jamSelesaiLama?.slice(0, 5)})</option>}
                    {jamKerjaOptions.map((option) => <option key={option.id} value={option.id}>{option.label} ({option.jam_mulai.slice(0, 5)}–{option.jam_selesai.slice(0, 5)})</option>)}
                  </select>

                  {!isLibur && (
                    <>
                      {selectedOption && <p className="mt-2 text-xs text-muted">Durasi: {selectedOption.durasi_jam} jam</p>}
                      {state.jamKerjaOpsiId === 'jadwal-lama' && <p className="mt-2 text-xs text-muted">Durasi: {state.durasiLama} jam · pilih shift lain jika ingin mengubah jadwal ini.</p>}
                      <button onClick={() => setOpenJobdeskFor(dateString)} className="mt-2 w-full rounded-lg border border-cream-dim bg-white px-3 py-2.5 text-left text-xs text-ink">
                        {state.jobdeskIds.length > 0
                          ? `Jobdesk: ${state.jobdeskIds.map((id) => jobdeskOptions.find((jobdesk) => jobdesk.id === id)?.singkatan).filter(Boolean).join(', ')}`
                          : 'Pilih Jobdesk →'}
                      </button>
                    </>
                  )}
                </section>
              )
            })}
          </div>
        )}
      </div>

      {openJobdeskFor && (
        <div onClick={() => setOpenJobdeskFor(null)} className="fixed inset-0 z-50 flex items-end bg-ink/40 backdrop-blur-sm">
          <div onClick={(event) => event.stopPropagation()} className="w-full rounded-t-3xl bg-cream-card p-5">
            <p className="text-sm font-semibold text-ink">Pilih Jobdesk — {formatDateId(new Date(`${openJobdeskFor}T00:00:00`))}</p>
            <div className="mt-3 space-y-1">
              {jobdeskOptions.map((jobdesk) => {
                const checked = scheduleByDate[openJobdeskFor]?.jobdeskIds.includes(jobdesk.id) || false
                return (
                  <label key={jobdesk.id} className="flex items-center justify-between rounded-xl border border-cream-dim bg-white px-4 py-3">
                    <span className="text-sm text-ink">{jobdesk.nama} ({jobdesk.singkatan})</span>
                    <input type="checkbox" checked={checked} onChange={() => toggleJobdesk(openJobdeskFor, jobdesk.id)} className="h-4 w-4 accent-brand" />
                  </label>
                )
              })}
            </div>
            <button onClick={() => setOpenJobdeskFor(null)} className="mt-4 w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white">Selesai</button>
          </div>
        </div>
      )}

      {copySource && (
        <div onClick={() => setCopySource(null)} className="fixed inset-0 z-50 flex items-end bg-ink/40 backdrop-blur-sm">
          <div onClick={(event) => event.stopPropagation()} className="w-full rounded-t-3xl bg-cream-card p-5">
            <p className="text-sm font-semibold text-ink">Salin jadwal {formatDateId(new Date(`${copySource}T00:00:00`))} ke:</p>
            <div className="mt-3 space-y-1">
              {weekDates.filter((date) => toDateString(date) !== copySource).map((date) => {
                const dateString = toDateString(date)
                return (
                  <label key={dateString} className="flex items-center justify-between rounded-xl border border-cream-dim bg-white px-4 py-3">
                    <span className="text-sm capitalize text-ink">{formatDateId(date)}</span>
                    <input type="checkbox" checked={copyTargets.includes(dateString)} onChange={() => setCopyTargets((previous) => previous.includes(dateString) ? previous.filter((item) => item !== dateString) : [...previous, dateString])} className="h-4 w-4 accent-brand" />
                  </label>
                )
              })}
            </div>
            <button onClick={copyDaySchedule} disabled={copyTargets.length === 0} className="mt-4 w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-60">Salin Jadwal</button>
          </div>
        </div>
      )}

      {showJamKerjaModal && (
        <JamKerjaModal
          onClose={() => setShowJamKerjaModal(false)}
          onChanged={async () => {
            const presetList = await getPresets()
            setPresets(presetList)
            const options = await getJamKerjaOptions(activePresetId)
            setJamKerjaOptions(options)
          }}
        />
      )}
      {showJobdeskModal && <JobdeskModal onClose={() => setShowJobdeskModal(false)} />}
    </div>
  )
}
