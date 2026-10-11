export const OVERTIME_HOURLY_RATE = 8_000

export type OvertimeStatus = 'pending' | 'disetujui' | 'ditolak'
export type OvertimeRequest = {
  id: number
  user_id: string
  tanggal: string
  jam_mulai: string
  jam_selesai: string
  durasi_menit: number
  jam_dibayar: number
  nominal: number
  keterangan: string
  status: OvertimeStatus
  catatan_manajer: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  crew: { nama: string; username: string } | null
  reviewer: { nama: string } | null
}

// Each request is rounded down independently, including overnight requests.
export function calculateOvertime(start: string, end: string) {
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/
  if (!timePattern.test(start) || !timePattern.test(end)) return null
  const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))
  const startMinutes = toMinutes(start)
  const endMinutes = toMinutes(end)
  const minutes = (endMinutes - startMinutes + 1440) % 1440
  const paidHours = Math.floor(minutes / 60)
  return { minutes, paidHours, amount: paidHours * OVERTIME_HOURLY_RATE, overnight: endMinutes < startMinutes }
}

export function overtimeDateLabel(date: string) {
  return new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
}

export function overtimeError(message: string) {
  if (/schema cache|does not exist|could not find/i.test(message)) {
    return 'Fitur lembur belum siap. Jalankan migration 202610110001_overtime_requests.sql di Supabase, lalu muat ulang.'
  }
  return message
}
