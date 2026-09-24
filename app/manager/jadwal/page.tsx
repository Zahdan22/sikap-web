'use client'

import { useState, useEffect } from 'react'
import { getWeekDates, formatDateId, isSameDate, toDateString } from '@/lib/date-utils'
import {
  getCrewList,
  getJamKerjaOptions,
  getJobdeskOptions,
  getScheduleStateForDate,
  Crew,
  JamKerjaOpsi,
  JobdeskOption,
  CrewScheduleState,
} from '@/lib/jadwal'
import { simpanJadwalHariIni } from '@/app/actions/jadwal'
import { useDialog } from '@/components/ui/DialogProvider'
import PageHeader from '@/components/PageHeader'
import JamKerjaModal from '@/components/JamKerjaModal'
import JobdeskModal from '@/components/JobdeskModal'  
import Spinner from '@/components/Spinner'
import { getPresets, JamKerjaPreset } from '@/lib/jadwal'

export default function JadwalPage() {
  const { toast } = useDialog()
  const [referenceDate, setReferenceDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  const [crewList, setCrewList] = useState<Crew[]>([])
  const [jamKerjaOptions, setJamKerjaOptions] = useState<JamKerjaOpsi[]>([])
  const [jobdeskOptions, setJobdeskOptions] = useState<JobdeskOption[]>([])
  const [scheduleState, setScheduleState] = useState<Record<string, CrewScheduleState>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [openJobdeskFor, setOpenJobdeskFor] = useState<string | null>(null)
  const [showMenu, setShowMenu] = useState(false)
  const [showJamKerjaModal, setShowJamKerjaModal] = useState(false)
  const [showJobdeskModal, setShowJobdeskModal] = useState(false)
  const [presets, setPresets] = useState<JamKerjaPreset[]>([])
  const [activePresetId, setActivePresetId] = useState<number | null>(null)

  const weekDates = getWeekDates(referenceDate)

  useEffect(() => {
    async function loadMasterData() {
      const [crew, jobdesk, presetList] = await Promise.all([
        getCrewList(),
        getJobdeskOptions(),
        getPresets(),
      ])
      setCrewList(crew)
      setJobdeskOptions(jobdesk)
      setPresets(presetList)
      if (presetList.length > 0) setActivePresetId(presetList[0].id)
    }
    loadMasterData()
  }, [])

  useEffect(() => {
    async function loadJamKerja() {
      const data = await getJamKerjaOptions(activePresetId)
      setJamKerjaOptions(data)
    }
    loadJamKerja()
  }, [activePresetId])

  useEffect(() => {
    if (!selectedDate || crewList.length === 0) return
    async function loadSchedule() {
      setLoading(true)
      const state = await getScheduleStateForDate(toDateString(selectedDate!), crewList, jamKerjaOptions)
      setScheduleState(state)
      setLoading(false)
    }
    loadSchedule()
  }, [selectedDate, crewList, jamKerjaOptions])

  function goToPreviousWeek() {
    const prev = new Date(referenceDate)
    prev.setDate(prev.getDate() - 7)
    setReferenceDate(prev)
    setSelectedDate(null)
  }

  function goToNextWeek() {
    const next = new Date(referenceDate)
    next.setDate(next.getDate() + 7)
    setReferenceDate(next)
    setSelectedDate(null)
  }

  function updateJamKerja(crewId: string, value: string) {
    setScheduleState((prev) => ({
      ...prev,
      [crewId]: { ...prev[crewId], jamKerjaOpsiId: value === 'libur' ? 'libur' : Number(value) },
    }))
  }

  function toggleJobdesk(crewId: string, jobdeskId: number) {
    setScheduleState((prev) => {
      const current = prev[crewId].jobdeskIds
      const alreadySelected = current.includes(jobdeskId)
      if (alreadySelected) {
        return { ...prev, [crewId]: { ...prev[crewId], jobdeskIds: current.filter((id) => id !== jobdeskId) } }
      }
      if (current.length >= 5) {
        toast('Maksimal 5 jobdesk per shift', 'error')
        return prev
      }
      return { ...prev, [crewId]: { ...prev[crewId], jobdeskIds: [...current, jobdeskId] } }
    })
  }

  async function handleSave() {
    if (!selectedDate) return
    setSaving(true)

    const payload = crewList.map((crew) => ({
      userId: crew.id,
      jamKerjaOpsiId: scheduleState[crew.id]?.jamKerjaOpsiId ?? 'libur',
      jobdeskIds: scheduleState[crew.id]?.jobdeskIds ?? [],
    }))

    const result = await simpanJadwalHariIni(toDateString(selectedDate), payload)
    setSaving(false)
    if (!result.success) { toast('Error: ' + result.message, 'error'); return }
    toast('Jadwal berhasil disimpan', 'success')

    const state = await getScheduleStateForDate(toDateString(selectedDate), crewList, jamKerjaOptions)
    setScheduleState(state)
  }

  return (
    <div className="flex min-h-full flex-col bg-cream pb-24">
      <div className="relative">
        <PageHeader
          title="Kelola Jadwal"
          backHref="/dashboard"
          rightSlot={
            <button onClick={() => setShowMenu((v) => !v)} className="text-xl text-white">⋮</button>
          }
        />
        <div className="mt-4 px-5">
        <label className="mb-1 block text-xs font-medium text-muted">Preset Jam Kerja Aktif</label>
        <select
          value={activePresetId ?? ''}
          onChange={(e) => setActivePresetId(Number(e.target.value))}
          className="w-full rounded-xl border border-cream-dim bg-cream-card px-4 py-2.5 text-sm text-ink outline-none focus:border-brand"
        >
          {presets.length === 0 && <option value="">-- Belum ada preset --</option>}
          {presets.map((p) => (
            <option key={p.id} value={p.id}>{p.nama}</option>
          ))}
        </select>
      </div>
        {showMenu && (
          <div className="absolute right-5 top-16 z-10 w-48 rounded-xl border border-cream-dim bg-cream-card p-2 shadow-md">
            <button
              onClick={() => { setShowJamKerjaModal(true); setShowMenu(false) }}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-cream-dim"
            >
              Kelola Jam Kerja
            </button>
            <button
              onClick={() => { setShowJobdeskModal(true); setShowMenu(false) }}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-cream-dim"
            >
              Kelola Jobdesk
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 px-5">
        <div className="flex items-center justify-between rounded-2xl border border-cream-dim bg-cream-card px-4 py-3">
          <button onClick={goToPreviousWeek} className="text-brand">‹</button>
          <p className="text-xs font-medium text-ink">
            {formatDateId(weekDates[0])} - {formatDateId(weekDates[6])}
          </p>
          <button onClick={goToNextWeek} className="text-brand">›</button>
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {weekDates.map((date) => {
            const isSelected = selectedDate && isSameDate(date, selectedDate)
            return (
              <button
                key={date.toISOString()}
                onClick={() => setSelectedDate(date)}
                className={`flex shrink-0 flex-col items-center rounded-xl px-3 py-2 text-xs ${
                  isSelected ? 'bg-brand text-white' : 'border border-cream-dim bg-cream-card text-ink'
                }`}
              >
                <span className="font-semibold">{formatDateId(date)}</span>
              </button>
            )
          })}
        </div>
      </div>

      {selectedDate && (
        <div className="mt-5 px-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Jadwal untuk {formatDateId(selectedDate)}
          </p>

          {loading ? (
            <Spinner />
          ) : (
            <>
              <div className="mt-2 space-y-2">
                {crewList.map((crew) => {
                  const state = scheduleState[crew.id]
                  if (!state) return null
                  const isLibur = state.jamKerjaOpsiId === 'libur'

                  return (
                    <div key={crew.id} className="rounded-xl border border-cream-dim bg-cream-card p-4">
                      <p className="text-sm font-semibold text-ink">{crew.nama}</p>

                      <select
                        value={isLibur ? 'libur' : state.jamKerjaOpsiId}
                        onChange={(e) => updateJamKerja(crew.id, e.target.value)}
                        className="mt-2 w-full rounded-lg border border-cream-dim bg-white px-3 py-2 text-xs text-ink outline-none focus:border-brand"
                      >
                        <option value="libur">Libur</option>
                        {jamKerjaOptions.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.label} ({opt.jam_mulai}-{opt.jam_selesai})
                          </option>
                        ))}
                      </select>

                      {!isLibur && (
                        <button
                          onClick={() => setOpenJobdeskFor(crew.id)}
                          className="mt-2 w-full rounded-lg border border-cream-dim bg-white px-3 py-2 text-left text-xs text-ink"
                        >
                          {state.jobdeskIds.length > 0
                            ? state.jobdeskIds.map((id) => jobdeskOptions.find((j) => j.id === id)?.singkatan).join(', ')
                            : 'Pilih Jobdesk →'}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>

              <button
                onClick={handleSave}
                disabled={saving}
                className="mt-4 w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? 'Menyimpan...' : 'Simpan Jadwal Hari Ini'}
              </button>
            </>
          )}
        </div>
      )}

      {openJobdeskFor && (
        <div
          onClick={() => setOpenJobdeskFor(null)}
          className="fixed inset-0 z-50 flex items-end bg-ink/40 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-t-3xl bg-cream-card p-5"
          >
            <p className="text-sm font-semibold text-ink">
              Pilih Jobdesk — {crewList.find((c) => c.id === openJobdeskFor)?.nama}
            </p>
            <div className="mt-3 space-y-1">
              {jobdeskOptions.map((jd) => {
                const checked = scheduleState[openJobdeskFor]?.jobdeskIds.includes(jd.id) || false
                return (
                  <label
                    key={jd.id}
                    className="flex items-center justify-between rounded-xl border border-cream-dim bg-white px-4 py-3"
                  >
                    <span className="text-sm text-ink">{jd.nama} ({jd.singkatan})</span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleJobdesk(openJobdeskFor, jd.id)}
                      className="h-4 w-4 accent-brand"
                    />
                  </label>
                )
              })}
            </div>
            <button
              onClick={() => setOpenJobdeskFor(null)}
              className="mt-4 w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white"
            >
              Selesai
            </button>
          </div>
        </div>
      )}
            {showJamKerjaModal && (
        <JamKerjaModal
          onClose={() => setShowJamKerjaModal(false)}
          onChanged={async () => {
            const presetList = await getPresets()
            setPresets(presetList)
          }}
        />
      )}
      {showJobdeskModal && <JobdeskModal onClose={() => setShowJobdeskModal(false)} />}
    </div>
  )
}