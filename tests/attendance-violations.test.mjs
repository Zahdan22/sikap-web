import assert from 'node:assert/strict'
import test from 'node:test'
import {
  activeAttendancePenaltyRulesOn,
  attendancePenaltyRuleVersionOn,
  resolveAttendancePenaltyRule,
} from '../lib/attendance-penalty-rules.ts'

function rule(overrides = {}) {
  return {
    id: 1,
    ruleKey: 'late_checkin_1_4',
    label: 'Telat absen masuk 1–4 menit',
    ruleKind: 'late_checkin',
    minMinutes: 1,
    maxMinutes: 4,
    appliesTo: 'all',
    payrollEffect: 'deduction',
    points: 2,
    fine: 5_000,
    isActive: true,
    effectiveOn: '1900-01-01',
    ...overrides,
  }
}

const standardRules = [
  rule(),
  rule({ id: 2, ruleKey: 'late_checkin_5_9', label: 'Telat absen masuk 5–9 menit', minMinutes: 5, maxMinutes: 9, points: 3, fine: 10_000 }),
  rule({ id: 3, ruleKey: 'late_checkin_10_14', label: 'Telat absen masuk 10–14 menit', minMinutes: 10, maxMinutes: 14, points: 4, fine: 12_000 }),
  rule({ id: 4, ruleKey: 'late_checkin_15_19', label: 'Telat absen masuk 15–19 menit', minMinutes: 15, maxMinutes: 19, points: 5, fine: 15_000 }),
  rule({ id: 5, ruleKey: 'late_checkin_20_29', label: 'Telat absen masuk 20–29 menit', minMinutes: 20, maxMinutes: 29, points: 5, fine: 17_000 }),
  rule({ id: 6, ruleKey: 'late_checkin_30_plus_senior', label: 'Telat ≥30 menit · Senior', minMinutes: 30, maxMinutes: null, appliesTo: 'senior_plus', points: 6, fine: 40_000 }),
  rule({ id: 7, ruleKey: 'late_checkin_30_plus_non_senior', label: 'Telat ≥30 menit · selain Senior', minMinutes: 30, maxMinutes: null, appliesTo: 'non_senior_plus', payrollEffect: 'unpaid', points: 6, fine: 0 }),
  rule({ id: 8, ruleKey: 'missing_checkin', label: 'Tidak absen masuk', ruleKind: 'missing_checkin', minMinutes: null, maxMinutes: null, payrollEffect: 'unpaid', points: 3, fine: 0 }),
  rule({ id: 9, ruleKey: 'late_checkout', label: 'Telat absen pulang', ruleKind: 'late_checkout', minMinutes: null, maxMinutes: null, points: 4, fine: 2_000 }),
  rule({ id: 10, ruleKey: 'missing_meal', label: 'Tidak mengisi jatah makan', ruleKind: 'missing_meal', minMinutes: null, maxMinutes: null, payrollEffect: 'disciplinary', points: 4, fine: 0 }),
]

test('aturan telat masuk memilih band yang tepat dan membedakan Senior', () => {
  const at = (minutesLate, supportsSeniorPlus = false) => resolveAttendancePenaltyRule(standardRules, '2026-11-19', { kind: 'late_checkin', minutesLate, supportsSeniorPlus })?.ruleKey
  assert.equal(at(0), undefined)
  assert.equal(at(1), 'late_checkin_1_4')
  assert.equal(at(4), 'late_checkin_1_4')
  assert.equal(at(5), 'late_checkin_5_9')
  assert.equal(at(10), 'late_checkin_10_14')
  assert.equal(at(15), 'late_checkin_15_19')
  assert.equal(at(20), 'late_checkin_20_29')
  assert.equal(at(29), 'late_checkin_20_29')
  assert.equal(at(30, false), 'late_checkin_30_plus_non_senior')
  assert.equal(at(30, true), 'late_checkin_30_plus_senior')
})

test('aturan tanggal berlaku tidak menulis ulang periode sebelumnya', () => {
  const history = [...standardRules, rule({ id: 11, effectiveOn: '2026-12-01', points: 9, fine: 8_000 })]
  assert.equal(attendancePenaltyRuleVersionOn(history, 'late_checkin_1_4', '2026-11-30')?.fine, 5_000)
  assert.equal(attendancePenaltyRuleVersionOn(history, 'late_checkin_1_4', '2026-12-01')?.fine, 8_000)
  assert.equal(resolveAttendancePenaltyRule(history, '2026-11-30', { kind: 'late_checkin', minutesLate: 1 })?.points, 2)
  assert.equal(resolveAttendancePenaltyRule(history, '2026-12-01', { kind: 'late_checkin', minutesLate: 1 })?.points, 9)
})

test('aturan nonaktif berhenti memberi poin atau denda otomatis tanpa mengubah aturan waktu', () => {
  const history = [...standardRules, rule({ id: 12, effectiveOn: '2026-12-01', isActive: false })]
  assert.equal(resolveAttendancePenaltyRule(history, '2026-11-30', { kind: 'late_checkin', minutesLate: 1 })?.fine, 5_000)
  assert.equal(resolveAttendancePenaltyRule(history, '2026-12-01', { kind: 'late_checkin', minutesLate: 1 }), null)
  assert.equal(activeAttendancePenaltyRulesOn(history, '2026-12-01').some((item) => item.ruleKey === 'late_checkin_1_4'), false)
})

test('aturan absensi dan jatah makan dipilih secara terpisah', () => {
  assert.equal(resolveAttendancePenaltyRule(standardRules, '2026-11-19', { kind: 'missing_checkin' })?.points, 3)
  assert.equal(resolveAttendancePenaltyRule(standardRules, '2026-11-19', { kind: 'late_checkout' })?.fine, 2_000)
  const meal = resolveAttendancePenaltyRule(standardRules, '2026-11-19', { kind: 'missing_meal' })
  assert.equal(meal?.points, 4)
  assert.equal(meal?.payrollEffect, 'disciplinary')
})
