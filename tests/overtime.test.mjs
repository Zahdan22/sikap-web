import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateOvertime } from '../lib/overtime.ts'

test('batas jam penuh menentukan jam lembur yang dibayar', () => {
  for (const [end, hours] of [
    ['18:00', 0], ['18:59', 0], ['19:00', 1],
    ['19:59', 1], ['20:00', 2], ['20:59', 2],
    ['21:00', 3], ['23:30', 5],
  ]) {
    const result = calculateOvertime('18:00', end)
    assert.equal(result.paidHours, hours, end)
  }
})

test('lembur melintasi tengah malam dihitung dengan pembulatan yang sama', () => {
  assert.deepEqual(calculateOvertime('23:00', '01:30'), { minutes: 150, paidHours: 2, overnight: true })
  assert.equal(calculateOvertime('23:30', '00:29').paidHours, 0)
  assert.equal(calculateOvertime('23:30', '00:30').paidHours, 1)
})

test('waktu kosong atau tidak valid tidak menghasilkan durasi', () => {
  for (const [start, end] of [['', ''], ['24:00', '01:00'], ['09:60', '10:00'], ['a', 'b']]) {
    assert.equal(calculateOvertime(start, end), null)
  }
})
