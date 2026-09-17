export type CheckInStatus = 'tepat_waktu' | 'telat' | 'belum_absen'
export type CheckOutStatus = 'tepat_waktu' | 'lebih_awal' | 'lewat_batas' | 'belum_absen'

type ShiftTime = {
  tanggal: string // format 'YYYY-MM-DD'
  jamMulai: string // format 'HH:MM:SS'
  jamSelesai: string // format 'HH:MM:SS'
}

function combineDateTime(tanggal: string, jam: string): Date {
  return new Date(`${tanggal}T${jam}`)
}

export function evaluateCheckIn(
  shift: ShiftTime,
  checkInTime: Date
): { status: CheckInStatus; menitTelat: number } {
  const shiftStart = combineDateTime(shift.tanggal, shift.jamMulai)
  const earliestAllowed = new Date(shiftStart.getTime() - 60 * 60 * 1000) // 60 menit sebelum
     const onTimeDeadline = new Date(shiftStart.getTime() - 9 * 60 * 1000) // 9 menit sebelum shift = titik 15:51 untuk shift 16:00

  if (checkInTime < earliestAllowed) {
    throw new Error(
      `Belum bisa check-in. Check-in dibuka mulai ${earliestAllowed.toLocaleTimeString('id-ID')}`
    )
  }

  if (checkInTime < onTimeDeadline) {
    return { status: 'tepat_waktu', menitTelat: 0 }
  }

  const menitTelat = Math.round((checkInTime.getTime() - shiftStart.getTime()) / 60000)
  return {
    status: 'telat',
    menitTelat: Math.max(0, menitTelat), // gak negatif kalau masih di jendela toleransi
  }
}

export function evaluateCheckOut(
  shift: ShiftTime,
  checkOutTime: Date
): CheckOutStatus {
  const shiftEnd = combineDateTime(shift.tanggal, shift.jamSelesai)
  const graceDeadline = new Date(shiftEnd.getTime() + 45 * 60 * 1000) // toleransi 45 menit

  if (checkOutTime < shiftEnd) {
    return 'lebih_awal'
  }

  if (checkOutTime <= graceDeadline) {
    return 'tepat_waktu'
  }

  return 'lewat_batas'
}