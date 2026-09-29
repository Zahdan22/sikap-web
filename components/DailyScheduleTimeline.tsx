type ScheduleRow = {
  id: number
  nama: string
  jam_mulai: string
  jam_selesai: string
  jobdeskLabels: string[]
}

type Props = {
  dateLabel: string
  schedules: ScheduleRow[]
  loading?: boolean
}

export default function DailyScheduleTimeline({ dateLabel, schedules, loading = false }: Props) {
  const shifts = schedules.map((schedule) => {
    const [startHour, startMinute = '0'] = schedule.jam_mulai.split(':')
    const [endHour, endMinute = '0'] = schedule.jam_selesai.split(':')
    const start = Number(startHour) + Number(startMinute) / 60
    let end = Number(endHour) + Number(endMinute) / 60
    if (end <= start) end += 24
    return { schedule, start, end }
  })

  if (loading) {
    return <div className="mt-4 rounded-2xl border border-cream-dim bg-cream-card p-5 text-center text-sm text-muted">Memuat cakupan jadwal...</div>
  }

  if (shifts.length === 0) {
    return (
      <div className="mt-4 rounded-2xl border border-cream-dim bg-cream-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Cakupan Jadwal · {dateLabel}</p>
        <p className="mt-3 text-center text-sm text-muted">Belum ada jadwal crew yang tersimpan untuk tanggal ini.</p>
      </div>
    )
  }

  const startHour = Math.min(8, Math.floor(Math.min(...shifts.map((shift) => shift.start))))
  const endHour = Math.max(24, Math.ceil(Math.max(...shifts.map((shift) => shift.end))))
  const hourCount = endHour - startHour
  const hourWidth = 52
  const timelineWidth = hourCount * hourWidth
  const palette = ['#fde68a', '#a5f3fc', '#bbf7d0', '#fbcfe8', '#ddd6fe', '#fed7aa']

  return (
    <section className="mt-4 rounded-2xl border border-cream-dim bg-cream-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Cakupan Jadwal · {dateLabel}</p>
      <div className="mt-3 overflow-x-auto pb-1">
        <div style={{ minWidth: `${88 + timelineWidth}px` }}>
          <div className="grid items-end border-b border-cream-dim pb-2" style={{ gridTemplateColumns: `80px ${timelineWidth}px` }}>
            <span className="text-[9px] font-medium text-muted">CREW</span>
            <div className="flex">
              {Array.from({ length: hourCount + 1 }, (_, index) => {
                const hour = startHour + index
                return <span key={hour} className="shrink-0 text-[9px] text-muted" style={{ width: `${hourWidth}px` }}>{`${String(hour % 24).padStart(2, '0')}${hour >= 24 ? '+' : ''}`}</span>
              })}
            </div>
          </div>
          <div className="divide-y divide-cream-dim">
            {shifts.map(({ schedule, start, end }, index) => {
              const left = (start - startHour) * hourWidth
              const width = (end - start) * hourWidth
              const jobdesk = schedule.jobdeskLabels.length ? schedule.jobdeskLabels.join(', ') : 'Tanpa jobdesk'
              return (
                <div key={schedule.id} className="grid items-center py-1.5" style={{ gridTemplateColumns: `80px ${timelineWidth}px` }}>
                  <span className="truncate pr-2 text-[10px] font-medium text-ink" title={schedule.nama}>{schedule.nama}</span>
                  <div className="relative h-8" style={{ width: `${timelineWidth}px`, backgroundImage: 'linear-gradient(to right, rgba(120, 113, 108, 0.18) 1px, transparent 1px)', backgroundSize: `${hourWidth}px 100%` }}>
                    <div title={`${schedule.nama}: ${schedule.jam_mulai.slice(0, 5)}–${schedule.jam_selesai.slice(0, 5)} · ${jobdesk}`} className="absolute top-0.5 flex h-7 items-center overflow-hidden rounded-md border border-black/10 px-1.5 text-[9px] font-semibold text-ink" style={{ left: `${left}px`, width: `${width}px`, backgroundColor: palette[index % palette.length] }}>
                      <span className="truncate">{jobdesk} · {schedule.jam_mulai.slice(0, 5)}–{schedule.jam_selesai.slice(0, 5)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <p className="mt-1 text-[10px] text-muted">Geser mendatar untuk melihat seluruh jam. Shift lewat tengah malam berlanjut ke hari berikutnya.</p>
    </section>
  )
}
