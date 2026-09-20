'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getMonthSchedules, ScheduleWithJobdesk } from '@/lib/jadwal'
import { toDateString } from '@/lib/date-utils'
import BottomNav from '@/components/BottomNav'

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
  const firstDayOfWeek = new Date(year, month, 1).getDay()

  const datesWithSchedule = new Set(schedules.map((s) => s.tanggal))
  const today = toDateString(new Date())

  const selectedSchedules = selectedDate ? schedules.filter((s) => s.tanggal === selectedDate) : []
  const mySchedule = selectedSchedules.find((s) => s.user_id === userId)
  const coworkerSchedules = selectedSchedules.filter((s) => s.user_id !== userId)

  return (
    <div className="flex min-h-full flex-col bg-cream pb-24">
      <div className="px-5 pt-6">
        <h1 className="text-lg font-semibold text-ink">Jadwal Saya</h1>
      </div>

      <div className="mt-4 px-5">
        <div className="rounded-2xl border border-cream-dim bg-cream-card p-4">
          <div className="flex items-center justify-between">
            <button onClick={goToPreviousMonth} className="text-brand">‹</button>
            <p className="text-sm font-semibold text-ink">
              {currentMonth.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
            </p>
            <button onClick={goToNextMonth} className="text-brand">›</button>
          </div>

          {loading ? (
            <p className="mt-4 text-center text-sm text-muted">Memuat...</p>
          ) : (
            <div className="mt-3 grid grid-cols-7 gap-y-2 text-center">
              {['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].map((d) => (
                <span key={d} className="text-[10px] font-medium text-muted">{d}</span>
              ))}

              {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                <span key={'empty-' + i} />
              ))}

              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                const dateObj = new Date(year, month, day)
                const dateStr = toDateString(dateObj)
                const hasSchedule = datesWithSchedule.has(dateStr)
                const isSelected = selectedDate === dateStr
                const isToday = dateStr === today

                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDate(dateStr)}
                    className="flex flex-col items-center gap-0.5"
                  >
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-xs ${
                        isSelected
                          ? 'bg-brand font-semibold text-white'
                          : isToday
                          ? 'border border-brand text-brand'
                          : 'text-ink'
                      }`}
                    >
                      {day}
                    </span>
                    <span className={`h-1 w-1 rounded-full ${hasSchedule ? 'bg-brand' : 'bg-transparent'}`} />
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {selectedDate && (
        <div className="mt-4 px-5">
          {mySchedule ? (
            <div className="rounded-2xl bg-brand px-5 py-4 text-white">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-white/70">Jadwal Saya</p>
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold">
                  {selectedDate}
                </span>
              </div>
              <p className="mt-1 text-lg font-semibold">
                {mySchedule.jam_mulai} - {mySchedule.jam_selesai}
              </p>
              <p className="mt-1 text-xs text-white/80">
                {mySchedule.jobdeskLabels.length > 0 ? mySchedule.jobdeskLabels.join(', ') : 'Tanpa jobdesk khusus'}
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-cream-dim bg-cream-card px-5 py-4 text-center">
              <p className="text-sm text-muted">Kamu libur di tanggal ini.</p>
            </div>
          )}

          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Jadwal Rekan Kerja</p>
            {coworkerSchedules.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Tidak ada rekan kerja lain di tanggal ini.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {coworkerSchedules.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between rounded-xl border border-cream-dim bg-cream-card px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold text-brand">
                        {s.nama.charAt(0).toUpperCase()}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-ink">{s.nama}</p>
                        <p className="text-xs text-muted">
                          {s.jam_mulai} - {s.jam_selesai}
                        </p>
                      </div>
                    </div>
                    {s.jobdeskLabels.length > 0 && (
                      <span className="rounded-full bg-cream-dim px-2 py-0.5 text-[10px] font-medium text-ink">
                        {s.jobdeskLabels[0]}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  )
}