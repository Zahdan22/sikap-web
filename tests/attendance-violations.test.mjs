import assert from 'node:assert/strict'
import test from 'node:test'
import { lateCheckInFine } from '../lib/attendance-violations.ts'

test('denda telat masuk mengikuti batas payroll tanpa membuat denda ganda', () => {
  assert.equal(lateCheckInFine(0, false), null)
  assert.equal(lateCheckInFine(1, false), 5_000)
  assert.equal(lateCheckInFine(5, false), 10_000)
  assert.equal(lateCheckInFine(10, false), 12_000)
  assert.equal(lateCheckInFine(15, false), 15_000)
  assert.equal(lateCheckInFine(20, false), 17_000)
  assert.equal(lateCheckInFine(29, false), 17_000)
  assert.equal(lateCheckInFine(30, false), 0)
  assert.equal(lateCheckInFine(30, true), 40_000)
})
