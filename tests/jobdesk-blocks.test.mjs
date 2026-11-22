import assert from 'node:assert/strict'
import test from 'node:test'
import { blocksCoverShift, replaceJobdeskBlockRange } from '../lib/jobdesk-blocks.ts'

test('mengganti bagian blok mempertahankan jobdesk sebelum dan sesudahnya', () => {
  const blocks = replaceJobdeskBlockRange(
    [{ mulaiMenit: 1140, selesaiMenit: 1380, jobdeskIds: [1] }],
    1260,
    1320,
    [2],
  )

  assert.deepEqual(blocks, [
    { mulaiMenit: 1140, selesaiMenit: 1260, jobdeskIds: [1] },
    { mulaiMenit: 1260, selesaiMenit: 1320, jobdeskIds: [2] },
    { mulaiMenit: 1320, selesaiMenit: 1380, jobdeskIds: [1] },
  ])
})

test('cakupan shift Warkop harus penuh tanpa jeda maupun tumpang tindih', () => {
  assert.equal(blocksCoverShift([
    { mulaiMenit: 1140, selesaiMenit: 1320, jobdeskIds: [1] },
    { mulaiMenit: 1320, selesaiMenit: 1500, jobdeskIds: [2] },
  ], 1140, 1500), true)

  assert.equal(blocksCoverShift([
    { mulaiMenit: 1140, selesaiMenit: 1320, jobdeskIds: [1] },
    { mulaiMenit: 1350, selesaiMenit: 1500, jobdeskIds: [2] },
  ], 1140, 1500), false)

  assert.equal(blocksCoverShift([
    { mulaiMenit: 1140, selesaiMenit: 1350, jobdeskIds: [1] },
    { mulaiMenit: 1320, selesaiMenit: 1500, jobdeskIds: [2] },
  ], 1140, 1500), false)
})
