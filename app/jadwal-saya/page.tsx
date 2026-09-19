'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getMonthSchedules, ScheduleWithJobdesk } from '@/lib/jadwal'
import { toDateString } from '@/lib/date-utils'

export default function JadwalSayaPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [schedules, setSchedules] = useState<ScheduleWithJobdesk[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setUserId(user.id)

      const year = currentMonth.getFullYear()
      const month = currentMonth.getMonth() + 1
      const data = await getMonthSchedules(year, month)
      setSchedules(data)
      setLoading(false)
    }
    load()
  }, [currentMonth])

  function goToPreviousMonth() {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
    setSelectedDate(null)
  }

  function goToNextMonth() {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
    setSelectedDate(null)
  }

  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDayOfWeek = new Date(year, month, 1).getDay() // 0=Minggu

  const datesWithSchedule = new Set(schedules.map((s) => s.tanggal))

  const selectedSchedules = selectedDate ? schedules.filter((s) => s.tanggal === selectedDate) : []
  const mySchedule = selectedSchedules.find((s) => s.user_id === userId)
  const coworkerSchedules = selectedSchedules.filter((s) => s.user_id !== userId)

  return (
    <div>
      <h1>Jadwal Saya</h1>

      <div>
        <button onClick={goToPreviousMonth}>&lt;</button>
        <span> {currentMonth.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })} </span>
        <button onClick={goToNextMonth}>&gt;</button>
      </div>

      {loading && <p>Memuat...</p>}

      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginTop: 12 }}>
          {['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].map((d) => (
            <div key={d} style={{ fontWeight: 'bold', textAlign: 'center' }}>{d}</div>
          ))}

          {Array.from({ length: firstDayOfWeek }).map((_, i) => (
            <div key={'empty-' + i} />
          ))}

          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
            const dateObj = new Date(year, month, day)
            const dateStr = toDateString(dateObj)
            const hasSchedule = datesWithSchedule.has(dateStr)

            return (
              <button
                key={day}
                onClick={() => setSelectedDate(dateStr)}
                style={{
                  border: selectedDate === dateStr ? '2px solid blue' : '1px solid gray',
                  padding: 8,
                  position: 'relative',
                }}
              >
                {day}
                {hasSchedule && (
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'orange', margin: '4px auto 0' }} />
                )}
              </button>
            )
          })}
        </div>
      )}

      {selectedDate && (
        <div style={{ marginTop: 20 }}>
          <h2>Detail {selectedDate}</h2>

          {mySchedule ? (
            <div>
              <h3>Jadwal Saya</h3>
              <p>
                {mySchedule.jam_mulai} - {mySchedule.jam_selesai} ({mySchedule.durasi_jam} jam)
              </p>
              <p>Jobdesk: {mySchedule.jobdeskLabels.join(', ') || '-'}</p>
            </div>
          ) : (
            <p>Kamu libur di tanggal ini.</p>
          )}

          <h3>Jadwal Rekan Kerja</h3>
          {coworkerSchedules.length === 0 && <p>Tidak ada rekan kerja lain di tanggal ini.</p>}
          <ul>
            {coworkerSchedules.map((s) => (
              <li key={s.id}>
                {s.nama}: {s.jam_mulai} - {s.jam_selesai} ({s.jobdeskLabels.join(', ') || '-'})
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}