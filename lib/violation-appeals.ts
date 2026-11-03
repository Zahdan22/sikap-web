export const violationAppealStatuses = {
  pending: 'Menunggu ditinjau',
  approved: 'Disetujui',
  partially_approved: 'Disetujui sebagian',
  rejected: 'Ditolak',
  cancelled: 'Dibatalkan',
} as const

export type ViolationAppealStatus = keyof typeof violationAppealStatuses

export type AppealViolation = {
  id: number
  user_id: string
  tanggal: string
  kesalahan: string
  poin: number
  denda: number
  version: number
}

export type ViolationAppeal = {
  id: number
  violation_id: number
  user_id: string
  reason: string
  evidence_path: string | null
  status: ViolationAppealStatus
  manager_note: string | null
  original_points: number
  original_fine: number
  resolved_points: number | null
  resolved_fine: number | null
  violation_version_at_request: number
  responded_at: string | null
  responded_by: string | null
  created_at: string
  violation: AppealViolation | null
  crew: { nama: string; username: string } | null
}

export function formatRupiah(value: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)
}

export function formatAppealDate(value: string) {
  return new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${value.slice(0, 10)}T00:00:00+07:00`))
}
