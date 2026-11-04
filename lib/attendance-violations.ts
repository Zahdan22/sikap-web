export function lateCheckInFine(minutesLate: number, supportsSeniorPlus: boolean) {
  if (minutesLate >= 30) return supportsSeniorPlus ? 40_000 : 0
  if (minutesLate >= 20) return 17_000
  if (minutesLate >= 15) return 15_000
  if (minutesLate >= 10) return 12_000
  if (minutesLate >= 5) return 10_000
  if (minutesLate > 0) return 5_000
  return null
}
