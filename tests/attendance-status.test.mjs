import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateCheckOut, isCheckOutGraceExpired } from '../lib/attendance-status.ts'

const overnight = { tanggal: '2026-10-10', jamMulai: '18:00', jamSelesai: '01:00' }

test('check-out diblokir setelah batas 45 menit dan shift lintas hari memakai tanggal yang benar', () => {
  assert.equal(evaluateCheckOut(overnight, new Date('2026-10-10T18:45:00.000Z')), 'tepat_waktu')
  assert.equal(isCheckOutGraceExpired(overnight, new Date('2026-10-10T18:45:00.000Z')), false)
  assert.equal(isCheckOutGraceExpired(overnight, new Date('2026-10-10T18:45:01.000Z')), true)
  assert.throws(
    () => evaluateCheckOut(overnight, new Date('2026-10-10T18:45:01.000Z')),
    /Batas check-out.*sudah lewat/
  )
})
