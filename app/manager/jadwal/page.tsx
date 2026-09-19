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

export default function JadwalPage() {
  const [referenceDate, setReferenceDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  const [crewList, setCrewList] = useState<Crew[]>([])
  const [jamKerjaOptions, setJamKerjaOptions] = useState<JamKerjaOpsi[]>([])
  const [jobdeskOptions, setJobdeskOptions] = useState<JobdeskOption[]>([])
  const [scheduleState, setScheduleState] = useState<Record<string, CrewScheduleState>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [openJobdeskFor, setOpenJobdeskFor] = useState<string | null>(null)

  const weekDates = getWeekDates(referenceDate)

  useEffect(() => {
    async function loadMasterData() {
      const [crew, jamKerja, jobdesk] = await Promise.all([
        getCrewList(),
        getJamKerjaOptions(),
        getJobdeskOptions(),
      ])
      setCrewList(crew)
      setJamKerjaOptions(jamKerja)
      setJobdeskOptions(jobdesk)
    }
    loadMasterData()
  }, [])

  useEffect(() => {
    if (!selectedDate || crewList.length === 0) return
    async function loadSchedule() {
      setLoading(true)
      setMessage('')
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
      [crewId]: {
        ...prev[crewId],
        jamKerjaOpsiId: value === 'libur' ? 'libur' : Number(value),
      },
    }))
  }

  function toggleJobdesk(crewId: string, jobdeskId: number) {
    setScheduleState((prev) => {
      const current = prev[crewId].jobdeskIds
      const alreadySelected = current.includes(jobdeskId)

      if (alreadySelected) {
        return {
          ...prev,
          [crewId]: { ...prev[crewId], jobdeskIds: current.filter((id) => id !== jobdeskId) },
        }
      }

      if (current.length >= 5) {
        alert('Maksimal 5 jobdesk per shift')
        return prev
      }

      return {
        ...prev,
        [crewId]: { ...prev[crewId], jobdeskIds: [...current, jobdeskId] },
      }
    })
  }

  async function handleSave() {
    if (!selectedDate) return
    setSaving(true)
    setMessage('')

    const payload = crewList.map((crew) => ({
      userId: crew.id,
      jamKerjaOpsiId: scheduleState[crew.id]?.jamKerjaOpsiId ?? 'libur',
      jobdeskIds: scheduleState[crew.id]?.jobdeskIds ?? [],
    }))

    const result = await simpanJadwalHariIni(toDateString(selectedDate), payload)

    setSaving(false)
    if (!result.success) {
      setMessage('Error: ' + result.message)
      return
    }
    setMessage('Berhasil disimpan')

    // Reload data biar existingScheduleId ke-update
    const state = await getScheduleStateForDate(toDateString(selectedDate), crewList, jamKerjaOptions)
    setScheduleState(state)
  }

  return (
    <div>
      <h1>Kelola Jadwal</h1>

      <div>
        <button onClick={goToPreviousWeek}>&lt; Minggu Sebelumnya</button>
        <span> {formatDateId(weekDates[0])} - {formatDateId(weekDates[6])} </span>
        <button onClick={goToNextWeek}>Minggu Berikutnya &gt;</button>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {weekDates.map((date) => (
          <button
            key={date.toISOString()}
            onClick={() => setSelectedDate(date)}
            style={{
              fontWeight: selectedDate && isSameDate(date, selectedDate) ? 'bold' : 'normal',
              border: selectedDate && isSameDate(date, selectedDate) ? '2px solid blue' : '1px solid gray',
            }}
          >
            {formatDateId(date)}
          </button>
        ))}
      </div>

      {selectedDate && (
        <div style={{ marginTop: 20 }}>
          <h2>Jadwal untuk: {formatDateId(selectedDate)}</h2>

          {loading && <p>Memuat...</p>}

          {!loading && (
            <>
              <table>
                <thead>
                  <tr>
                    <th>Nama</th>
                    <th>Jam Kerja</th>
                    <th>Jobdesk</th>
                  </tr>
                </thead>
                <tbody>
                  {crewList.map((crew) => {
                    const state = scheduleState[crew.id]
                    if (!state) return null

                    return (
                      <tr key={crew.id}>
                        <td>{crew.nama}</td>
                        <td>
                          <select
                            value={state.jamKerjaOpsiId === 'libur' ? 'libur' : state.jamKerjaOpsiId}
                            onChange={(e) => updateJamKerja(crew.id, e.target.value)}
                          >
                            <option value="libur">Libur</option>
                            {jamKerjaOptions.map((opt) => (
                              <option key={opt.id} value={opt.id}>
                                {opt.label} ({opt.jam_mulai}-{opt.jam_selesai})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          {state.jamKerjaOpsiId !== 'libur' && (
                            <button onClick={() => setOpenJobdeskFor(crew.id)}>
                              {state.jobdeskIds.length > 0
                                ? state.jobdeskIds
                                    .map((id) => jobdeskOptions.find((j) => j.id === id)?.singkatan)
                                    .join(', ')
                                : 'Pilih Jobdesk'}
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              <button onClick={handleSave} disabled={saving}>
                {saving ? 'Menyimpan...' : 'Simpan Jadwal Hari Ini'}
              </button>
              {message && <p>{message}</p>}
            </>
          )}

          {openJobdeskFor && (
            <div style={{ border: '1px solid gray', padding: 16, marginTop: 16 }}>
              <h3>Pilih Jobdesk untuk {crewList.find((c) => c.id === openJobdeskFor)?.nama}</h3>
              {jobdeskOptions.map((jd) => (
                <label key={jd.id} style={{ display: 'block' }}>
                  <input
                    type="checkbox"
                    checked={scheduleState[openJobdeskFor]?.jobdeskIds.includes(jd.id) || false}
                    onChange={() => toggleJobdesk(openJobdeskFor, jd.id)}
                  />
                  {jd.nama} ({jd.singkatan})
                </label>
              ))}
              <button onClick={() => setOpenJobdeskFor(null)}>Selesai</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}