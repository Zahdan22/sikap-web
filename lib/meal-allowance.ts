export type MealAllowanceClaimStatus = 'claimed' | 'not_taken'
export type MealAllowanceDisplayStatus = MealAllowanceClaimStatus | 'libur' | 'izin' | 'missing' | 'not_due' | 'not_started'

// Jatah makan mulai diterapkan pada tanggal ini. Jadwal sebelumnya tetap
// terlihat di riwayat, tetapi tidak boleh menghasilkan poin otomatis.
export const MEAL_ALLOWANCE_EFFECTIVE_ON = '2026-11-19'
export const MEAL_ALLOWANCE_PHOTO_BUCKET = 'meal-allowance-photos'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function mealAllowanceAppliesOn(date: string) {
  return isIsoDate(date) && date >= MEAL_ALLOWANCE_EFFECTIVE_ON
}

export function jakartaDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function nextDate(date: string) {
  if (!isIsoDate(date)) throw new Error('Tanggal jatah makan tidak valid.')
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10)
}

/**
 * The deadline is exactly 00:00:00 WIB on the following calendar day. That
 * means 23:59:59.999 on the schedule date is still accepted, while the next
 * millisecond (00:00:00) is expired.
 */
export function mealDeadline(scheduleDate: string) {
  return new Date(`${nextDate(scheduleDate)}T00:00:00.000+07:00`)
}

export function mealDeadlinePassed(scheduleDate: string, now = new Date()) {
  return now.getTime() >= mealDeadline(scheduleDate).getTime()
}

export function mealDeadlineLabel(scheduleDate: string) {
  return `${scheduleDate} 23.59.59 WIB`
}

export function dateRangeInclusive(start: string, end: string) {
  if (!isIsoDate(start) || !isIsoDate(end) || start > end) return [] as string[]
  const dates: string[] = []
  let cursor = start
  // Work periods are normally around a month. This guard avoids an accidental
  // unbounded render if malformed data is entered in a period.
  while (cursor <= end && dates.length < 400) {
    dates.push(cursor)
    cursor = nextDate(cursor)
  }
  return dates
}

export function isJpeg(bytes: Uint8Array) {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}
