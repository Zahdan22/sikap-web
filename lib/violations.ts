export type Violation = {
  id: number; user_id: string; tanggal: string; kesalahan: string; poin: number; denda: number
  reviewed_at: string | null; reviewed_by: string | null; version: number; created_at: string
}
export type ViolationCrew = { id: string; nama: string; username: string }
export type ViolationPeriod = { id: number; nama: string; tanggal_mulai: string; tanggal_selesai: string }
export type ViolationInput = { id: number | null; userId: string; date: string; description: string; points: number | null; fine: number | null; version: number | null }

export function violationError(message: string) {
  return /schema cache|does not exist|could not find/i.test(message)
    ? 'Jalankan migrasi 202610120001_crew_violations.sql di Supabase, lalu muat ulang.' : message
}
export function jakartaDate() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) }
export function validViolationDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0,10) === value
}
