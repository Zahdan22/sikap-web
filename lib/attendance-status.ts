export type CheckInStatus = 'tepat_waktu' | 'telat' | 'belum_absen'
export type CheckOutStatus = 'tepat_waktu' | 'lebih_awal' | 'lewat_batas' | 'belum_absen'
export const CHECK_OUT_GRACE_MINUTES = 45

export type ShiftTime = {
  tanggal: string // format 'YYYY-MM-DD'
  jamMulai: string // format 'HH:MM:SS'
  jamSelesai: string // format 'HH:MM:SS'
}

function combineDateTime(tanggal: string, jam: string): Date {
  const [year, month, day] = tanggal.split('-').map(Number)
  const [hour, minute = 0, second = 0] = jam.split(':').map(Number)
  // Jadwal SI-KAP memakai waktu Asia/Jakarta (UTC+7), terlepas dari timezone server/device.
  return new Date(Date.UTC(year, month - 1, day, hour - 7, minute, second))
}

export function getShiftEndAt(shift: ShiftTime): Date {
  const shiftStart = combineDateTime(shift.tanggal, shift.jamMulai)
  const shiftEnd = combineDateTime(shift.tanggal, shift.jamSelesai)
  // Kalau jam selesai <= jam mulai, berarti shift lintas hari (misal 18:00 - 01:00).
  if (shiftEnd <= shiftStart) shiftEnd.setTime(shiftEnd.getTime() + 24 * 60 * 60 * 1000)
  return shiftEnd
}

export function isCheckOutGraceExpired(shift: ShiftTime, currentTime = new Date()) {
  return currentTime.getTime() > getShiftEndAt(shift).getTime() + CHECK_OUT_GRACE_MINUTES * 60 * 1000
}

export function evaluateCheckIn(
  shift: ShiftTime,
  checkInTime: Date
): { status: CheckInStatus; menitTelat: number } {
  const shiftStart = combineDateTime(shift.tanggal, shift.jamMulai)
  const earliestAllowed = new Date(shiftStart.getTime() - 60 * 60 * 1000)
  const onTimeDeadline = new Date(shiftStart.getTime() - 9 * 60 * 1000)

  if (checkInTime < earliestAllowed) {
    throw new Error(
      `Belum bisa check-in. Check-in dibuka mulai ${earliestAllowed.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })}`
    )
  }

  if (checkInTime < onTimeDeadline) {
    return { status: 'tepat_waktu', menitTelat: 0 }
  }

  const menitTelat = Math.round((checkInTime.getTime() - onTimeDeadline.getTime()) / 60000)
  return { status: 'telat', menitTelat }
}

export function evaluateCheckOut(
  shift: ShiftTime,
  checkOutTime: Date
): CheckOutStatus {
  const shiftEnd = getShiftEndAt(shift)
  const graceDeadline = new Date(shiftEnd.getTime() + CHECK_OUT_GRACE_MINUTES * 60 * 1000)

  if (checkOutTime < shiftEnd) {
    throw new Error(
      `Belum bisa check-out. Check-out dibuka mulai ${shiftEnd.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })}`
    )
  }

  if (isCheckOutGraceExpired(shift, checkOutTime)) {
    throw new Error(
      `Batas check-out pukul ${graceDeadline.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })} sudah lewat. Absensi tercatat sebagai telat absen pulang; hubungi manager jika ada kendala.`
    )
  }

  return 'tepat_waktu'
}
