import assert from 'node:assert/strict'
import test from 'node:test'
import { isJpeg, mealDeadlinePassed } from '../lib/meal-allowance.ts'

test('batas jatah makan berakhir tepat pukul 00.00 WIB setelah tanggal jadwal', () => {
  // 23.59.59 WIB tanggal 18 masih boleh diisi.
  assert.equal(mealDeadlinePassed('2026-11-18', new Date('2026-11-18T16:59:59.999Z')), false)
  // Tepat 00.00 WIB tanggal 19 sudah melewati batas.
  assert.equal(mealDeadlinePassed('2026-11-18', new Date('2026-11-18T17:00:00.000Z')), true)
})

test('hanya berkas JPEG yang diterima untuk foto jatah makan', () => {
  assert.equal(isJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), true)
  assert.equal(isJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), false)
  assert.equal(isJpeg(new Uint8Array([0xff, 0xd8])), false)
})
