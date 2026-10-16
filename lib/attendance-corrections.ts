export const correctionReasons = {
  app: 'Aplikasi Eror / Lag',
  gps: 'Kendala GPS / Lokasi Tidak Terdeteksi',
  camera: 'Kamera Gagal / Kendala Foto',
  server: 'Server Down',
} as const

export const correctionStatuses = { pending: 'Menunggu', approved: 'Disetujui', rejected: 'Ditolak', cancelled: 'Dibatalkan' } as const
export type CorrectionKind = 'masuk' | 'pulang'
export type CorrectionStatus = keyof typeof correctionStatuses
export type Correction = {
  id: string; user_id: string; schedule_id: number; work_date: string; kind: CorrectionKind;
  requested_at: string; reason: keyof typeof correctionReasons; note: string;
  status: CorrectionStatus; effective_at: string | null; original_at: string | null;
  original_captured: boolean; manager_note: string | null; reviewed_at: string | null;
  version: number; created_at: string;
  crew: { nama: string; username: string } | null;
  reviewer: { nama: string } | null;
}
export type CorrectionEvent = {
  id: number; action: string; note: string; created_at: string;
  before_value: { time?: string | null; status?: string } | null;
  after_value: { time?: string | null; status?: string };
  actor: { nama: string } | null;
}
export type CorrectionSchedule = { id: number; tanggal: string; jam_mulai: string; jam_selesai: string }

export function jakartaInput(value: string | Date) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 16)
}

export function correctionTimestamp(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const date = new Date(`${value}:00+07:00`)
  if (Number.isNaN(date.getTime()) || jakartaInput(date) !== value) return null
  return date.toISOString()
}

export function evidenceFormat(bytes: Uint8Array, mime: string) {
  if (!bytes.length || bytes.length > 3_000_000) return null
  if (mime === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg'
  if (mime === 'image/png' && [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)) return 'png'
  if (mime === 'image/webp' && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'webp'
  return null
}
