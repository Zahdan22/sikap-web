import assert from 'node:assert/strict'
import test from 'node:test'
import { correctionTimestamp, jakartaInput, evidenceFormat } from '../lib/attendance-corrections.ts'

test('jam koreksi WIB konsisten dan tanggal mustahil ditolak', () => {
  assert.equal(correctionTimestamp('2026-10-16T14:45'), '2026-10-16T07:45:00.000Z')
  assert.equal(jakartaInput('2026-10-16T18:15:00Z'), '2026-10-17T01:15')
  assert.equal(correctionTimestamp('2026-02-30T14:45'), null)
  assert.equal(correctionTimestamp('2026-10-16T24:10'), null)
  assert.equal(correctionTimestamp('2026-10-16T14:45Z'), null)
})

test('bukti memerlukan isi gambar sesuai MIME dan batas ukuran', () => {
  assert.equal(evidenceFormat(new Uint8Array([255,216,255,224]), 'image/jpeg'), 'jpg')
  assert.equal(evidenceFormat(new Uint8Array([137,80,78,71,13,10,26,10]), 'image/png'), 'png')
  assert.equal(evidenceFormat(new TextEncoder().encode('RIFF0000WEBP'), 'image/webp'), 'webp')
  assert.equal(evidenceFormat(new TextEncoder().encode('<script>alert(1)</script>'), 'image/png'), null)
  assert.equal(evidenceFormat(new Uint8Array([255,216,255]), 'image/png'), null)
  assert.equal(evidenceFormat(new Uint8Array(3_000_001), 'image/jpeg'), null)
})
