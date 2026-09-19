// lib/date-utils.ts

// Ambil 7 tanggal dalam 1 minggu (Senin-Minggu) berdasarkan tanggal referensi
export function getWeekDates(referenceDate: Date): Date[] {
  const date = new Date(referenceDate)
  const day = date.getDay() // 0 = Minggu, 1 = Senin, ...
  const diffToMonday = day === 0 ? -6 : 1 - day // geser ke Senin minggu itu

  const monday = new Date(date)
  monday.setDate(date.getDate() + diffToMonday)
  monday.setHours(0, 0, 0, 0)

  const week: Date[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    week.push(d)
  }
  return week
}

export function formatDateId(date: Date): string {
  return date.toLocaleDateString('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

// Format YYYY-MM-DD pakai tanggal LOKAL (bukan UTC), konsisten dengan lib/attendance.ts
export function toDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isSameDate(a: Date, b: Date): boolean {
  return toDateString(a) === toDateString(b)
}