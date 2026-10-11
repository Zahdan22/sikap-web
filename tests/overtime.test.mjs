import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateOvertime } from '../lib/overtime.ts'

test('batas jam penuh menentukan bonus lembur', () => {
  for (const [end, hours, pay] of [
    ['18:00', 0, 0], ['18:59', 0, 0], ['19:00', 1, 8000],
    ['19:59', 1, 8000], ['20:00', 2, 16000], ['20:59', 2, 16000],
    ['21:00', 3, 24000], ['23:30', 5, 40000],
  ]) {
    const result = calculateOvertime('18:00', end)
    assert.equal(result.paidHours, hours, end)
    assert.equal(result.amount, pay, end)
  }
})

test('lembur melintasi tengah malam dihitung dengan pembulatan yang sama', () => {
  assert.deepEqual(calculateOvertime('23:00', '01:30'), { minutes: 150, paidHours: 2, amount: 16000, overnight: true })
  assert.equal(calculateOvertime('23:30', '00:29').paidHours, 0)
  assert.equal(calculateOvertime('23:30', '00:30').paidHours, 1)
})

test('waktu kosong atau tidak valid tidak menghasilkan nominal', () => {
  for (const [start, end] of [['', ''], ['24:00', '01:00'], ['09:60', '10:00'], ['a', 'b']]) {
    assert.equal(calculateOvertime(start, end), null)
  }
})
