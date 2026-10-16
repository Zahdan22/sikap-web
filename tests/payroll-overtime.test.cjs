const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

// Exercise the actual payroll actions with a deterministic Supabase fixture.
// Network/auth and Next cache invalidation are replaced; payroll arithmetic is not.
function setup({ rowLimit = 1000, failPageOf = null } = {}) {
  const tables = {
    users: [{ id: 'crew-1', nama: 'Crew', username: 'crew', role: 'crew', status_aktif: true }],
    schedule: [{ id: 1, user_id: 'crew-1', tanggal: '2025-01-05', jam_mulai: '18:00', jam_selesai: '00:00', durasi_jam: 6 }],
    crew_payroll_tier_history: [{ id: 1, user_id: 'crew-1', tier: 'senior', senior_plus_level: 2, effective_on: '2025-01-01' }],
    crew_payroll_status: [{ user_id: 'crew-1', tier: 'senior', senior_plus_level: 2 }],
    payroll_tier_rates: [{ tier: 'senior', hourly_rate: 6800 }],
    payroll_senior_plus_rates: [{ level: 2, daily_bonus: 7500 }],
    attendance: [{ id: 1, user_id: 'crew-1', schedule_id: 1, jam_masuk_aktual: '2025-01-05T10:50:00Z', jam_pulang_aktual: '2025-01-05T17:00:00Z', status_masuk: 'tepat_waktu', status_pulang: 'tepat_waktu', menit_telat: 0 }],
    payroll_periods: [{ id: 1, period_start: '2025-01-01', period_end: '2025-01-31', status: 'draft' }],
    payroll_adjustments: [], payroll_items: [], crew_violations: [],
    overtime_requests: [
      { id: 1, user_id: 'crew-1', tanggal: '2025-01-05', jam_mulai: '00:00', jam_selesai: '02:30', jam_dibayar: 2, nominal: 16000, status: 'disetujui', keterangan: 'Ramai' },
      { id: 2, user_id: 'crew-1', tanggal: '2025-01-06', jam_dibayar: 1, nominal: 8000, status: 'pending' },
      { id: 3, user_id: 'crew-1', tanggal: '2025-01-07', jam_dibayar: 3, nominal: 24000, status: 'ditolak' },
      { id: 4, user_id: 'crew-1', tanggal: '2025-02-01', jam_dibayar: 4, nominal: 32000, status: 'disetujui' },
    ],
  }
  const calls = []
  const client = {
    rpc: async (name) => { calls.push(`rpc:${name}`); return { error: null } },
    from(name) {
      calls.push(name)
      let rows = [...tables[name]]
      let single = false
      let pageStart = 0
      const orders = []
      const query = {
        select() { return query },
        eq(key, value) { rows = rows.filter((row) => row[key] === value); return query },
        is(key, value) { rows = rows.filter((row) => row[key] === value); return query },
        gte(key, value) { rows = rows.filter((row) => row[key] >= value); return query },
        lte(key, value) { rows = rows.filter((row) => row[key] <= value); return query },
        not(key, op, value) { rows = rows.filter((row) => row[key] !== value); return query },
        in(key, values) { assert.ok(values.length <= 100, 'ID batches must avoid oversized URLs'); rows = rows.filter((row) => values.includes(row[key])); return query },
        order(key, options = {}) { orders.push([key, options.ascending !== false]); return query },
        range(start, end) {
          pageStart = start
          rows.sort((a,b) => { for (const [key, ascending] of orders) { const cmp = a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0; if (cmp) return ascending ? cmp : -cmp } return 0 })
          rows = rows.slice(start, end + 1); return query
        },
        maybeSingle() { single = true; return query },
        upsert(records) { tables[name] = structuredClone(Array.isArray(records) ? records : [records]); return query },
        then(resolve, reject) { return Promise.resolve(name === failPageOf && pageStart >= 500 ? { data: null, error: { message: 'Page unavailable' } } : { data: single ? rows[0] || null : rows.slice(0, rowLimit), error: null }).then(resolve, reject) },
      }
      return query
    },
  }
  const modules = {}
  function load(relative) {
    if (modules[relative]) return modules[relative]
    const source = readFileSync(path.join(__dirname, '..', relative), 'utf8')
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    const module = { exports: {} }
    new Function('require', 'module', 'exports', compiled)((id) => {
      if (id === 'next/cache') return { revalidatePath() {} }
      if (id === '@/lib/finance-auth') return { requireFinance: async () => ({ ok: true, supabase: client, userId: 'finance' }) }
      if (id === '@/lib/supabase/server') return { createClient: async () => client }
      if (id.startsWith('@/')) return load(`${id.slice(2)}.ts`)
      throw new Error(`Unexpected dependency: ${id}`)
    }, module, module.exports)
    modules[relative] = module.exports
    return module.exports
  }
  return { tables, calls, actions: load('app/actions/payroll.ts') }
}

test('hanya lembur disetujui di periode terpilih masuk rekap, detail, dan draf', async () => {
  const { tables, actions } = setup()
  const report = await actions.loadPayrollReport('2025-01-01', '2025-01-31')
  assert.equal(report.success, true)
  const row = report.rows[0]
  assert.equal(row.hours, 6)
  assert.equal(row.overtimeHours, 2)
  assert.equal(row.overtimePay, 16000)
  assert.equal(row.netPay, 64300) // (6 x 6.800) + 7.500 + 16.000
  const detail = await actions.loadPayrollCrewDetail('crew-1', '2025-01-01', '2025-01-31')
  assert.equal(detail.success, true)
  assert.equal(detail.overtimeDetails.length, 1)
  assert.equal(detail.details.reduce((sum, shift) => sum + shift.totalPay, 0) + detail.overtimePay, row.netPay)
  const saved = await actions.savePayrollDraft('2025-01-01', '2025-01-31')
  assert.equal(saved.success, true)
  assert.equal(tables.payroll_items[0].net_pay, 64300)
  assert.equal(tables.payroll_items[0].calculation_snapshot.overtime_pay, 16000)
  assert.equal(tables.payroll_items[0].calculation_snapshot.overtime_details.length, 1)
})

test('lembur terbayar tetap masuk jika crew tidak memiliki jadwal reguler di periode itu', async () => {
  const { tables, actions } = setup()
  tables.schedule = []
  const report = await actions.loadPayrollReport('2025-01-01', '2025-01-31')
  assert.equal(report.rows[0].netPay, 16000)
  assert.equal(report.rows[0].hours, 0)
})

test('koreksi keterlambatan dan checkout menghitung ulang denda serta poin pada draf', async () => {
  const { tables, actions } = setup()
  Object.assign(tables.attendance[0], { status_masuk: 'telat', menit_telat: 30, jam_pulang_aktual: null, status_pulang: 'belum_absen' })
  const before = await actions.loadPayrollReport('2025-01-01', '2025-01-31')
  assert.equal(before.rows[0].attendanceDeductions, 42000)
  assert.equal(before.rows[0].attendancePoints, 10)
  Object.assign(tables.attendance[0], { status_masuk: 'tepat_waktu', menit_telat: 0, jam_pulang_aktual: '2025-01-05T17:00:00Z', status_pulang: 'tepat_waktu' })
  tables.payroll_periods[0].attendance_revision = 2
  const after = await actions.loadPayrollReport('2025-01-01', '2025-01-31')
  assert.equal(after.rows[0].attendanceDeductions, 0)
  assert.equal(after.rows[0].attendancePoints, 0)
  assert.equal(after.rows[0].netPay - before.rows[0].netPay, 42000)
  await actions.savePayrollDraft('2025-01-01', '2025-01-31')
  assert.equal(tables.payroll_items[0].attendance_revision, 2)
  assert.equal(tables.payroll_items[0].net_pay, after.rows[0].netPay)
})

test('rekap tidak terpotong pada batas 1.000 baris Supabase', async () => {
  const { tables, actions } = setup()
  tables.overtime_requests = Array.from({ length: 1001 }, (_, index) => ({ id: index + 1, user_id: 'crew-1', tanggal: '2025-01-05', jam_dibayar: 1, nominal: 8000, status: 'disetujui' }))
  const report = await actions.loadPayrollReport('2025-01-01', '2025-01-31')
  assert.equal(report.rows[0].overtimeHours, 1001)
  assert.equal(report.rows[0].overtimePay, 8008000)
})

function violation(overrides = {}) {
  return { id: 1, user_id: 'crew-1', tanggal: '2025-01-05', kesalahan: 'Salah input', poin: 3, denda: 10000, reviewed_at: '2025-01-06T00:00:00Z', reviewed_by: 'manager', version: 1, deleted_at: null, ...overrides }
}

test('denda diperiksa mengurangi gaji tepat sekali; pending, terhapus, dan luar periode diabaikan', async () => {
  const { tables, actions } = setup()
  tables.crew_violations = [violation(), violation({ id: 2, reviewed_at: null }), violation({ id: 3, deleted_at: '2025-01-07T00:00:00Z' }), violation({ id: 4, tanggal: '2025-02-01' })]
  const report = await actions.loadPayrollReport('2025-01-01', '2025-01-31')
  assert.equal(report.success, true)
  assert.equal(report.rows[0].netPay, 54300)
  assert.equal(report.rows[0].violationDeductions, 10000)
  assert.equal(report.rows[0].violationPoints, 3)
  const detail = await actions.loadPayrollCrewDetail('crew-1', '2025-01-01', '2025-01-31')
  assert.equal(detail.violationDetails.length, 1)
  assert.equal(detail.details.reduce((sum, shift) => sum + shift.totalPay, 0) + detail.overtimePay - detail.violationDeductions, report.rows[0].netPay)
  assert.equal((await actions.savePayrollDraft('2025-01-01', '2025-01-31')).success, true)
  assert.equal(tables.payroll_items[0].net_pay, 54300)
  assert.equal(tables.payroll_items[0].calculation_snapshot.violation_points, 3)
  assert.equal(tables.payroll_items[0].calculation_snapshot.violation_details.length, 1)
})

test('poin tidak dikonversi menjadi uang dan denda tidak dibebankan ke crew lain', async () => {
  const { tables, actions } = setup()
  tables.crew_violations = [violation({ denda: 0, poin: 100 }), violation({ id: 2, user_id: 'other-crew' })]
  const report = await actions.loadPayrollReport('2025-01-01', '2025-01-31')
  assert.equal(report.rows[0].netPay, 64300)
  assert.equal(report.rows[0].violationPoints, 100)
})

test('denda melebihi penghasilan memblokir penyimpanan draf negatif', async () => {
  const { tables, actions } = setup()
  tables.crew_violations = [violation({ denda: 70000 })]
  const saved = await actions.savePayrollDraft('2025-01-01', '2025-01-31')
  assert.equal(saved.success, false)
  assert.match(saved.message, /melebihi gaji/)
  assert.equal(tables.payroll_items.length, 0)
})

test('pelanggaran lebih dari 1000 baris tetap terakumulasi', async () => {
  const { tables, actions } = setup()
  tables.crew_violations = Array.from({ length: 1001 }, (_, i) => violation({ id: i + 1, denda: 1, poin: 1 }))
  const report = await actions.loadPayrollReport('2025-01-01', '2025-01-31')
  assert.equal(report.rows[0].violationDeductions, 1001)
  assert.equal(report.rows[0].violationPoints, 1001)
  assert.equal(report.rows[0].netPay, 63299)
})

test('payroll final memakai arsip: perubahan jadwal, tier, absensi, tarif, dan crew baru tidak mengubah rekap/detail', async () => {
  const { tables, calls, actions } = setup()
  tables.crew_violations = [violation()]
  await actions.savePayrollDraft('2025-01-01', '2025-01-31')
  tables.payroll_periods[0].status = 'finalized'
  tables.schedule[0].durasi_jam = 7
  tables.attendance[0].menit_telat = 30
  tables.payroll_tier_rates[0].hourly_rate = 100000
  tables.crew_payroll_tier_history = []
  tables.crew_payroll_status = []
  tables.overtime_requests = []
  tables.crew_violations = []
  tables.users[0].nama = 'Changed name'
  tables.users.push({ id: 'new-crew', role: 'crew', nama: 'New' })
  calls.length = 0
  const report = await actions.loadPayrollReport('2025-01-01', '2025-01-31')
  assert.equal(report.periodStatus, 'finalized')
  assert.equal(report.rows.length, 1)
  assert.equal(report.rows[0].netPay, 54300)
  assert.equal(report.rows[0].hours, 6)
  assert.equal(report.rows[0].nama, 'Crew')
  const detail = await actions.loadPayrollCrewDetail('crew-1', '2025-01-01', '2025-01-31')
  assert.equal(detail.summary.netPay, 54300)
  assert.equal(detail.summary.hours, 6)
  assert.equal(detail.details[0].jamMulai, '18:00')
  assert.equal(detail.details[0].menitTelat, 0)
  assert.equal(detail.legacySnapshot, false)
  assert.ok(calls.every((name) => ['payroll_periods','payroll_items'].includes(name)))
  assert.equal((await actions.loadPayrollCrewDetail('new-crew', '2025-01-01', '2025-01-31')).success, false)
})

test('arsip final lama menggunakan total tersimpan tanpa mengambil ulang jadwal', async () => {
  const { tables, calls, actions } = setup()
  await actions.savePayrollDraft('2025-01-01', '2025-01-31')
  const snapshot = tables.payroll_items[0].calculation_snapshot
  delete snapshot.report_row
  delete snapshot.version
  for (const shift of snapshot.completed_shift_calculations) {
    for (const key of ['scheduleId','jamMulai','jamSelesai','jamMasukAktual','jamPulangAktual','menitTelat','status','payable']) delete shift[key]
  }
  tables.payroll_periods[0].status = 'finalized'
  tables.schedule = []
  tables.attendance = []
  calls.length = 0
  const detail = await actions.loadPayrollCrewDetail('crew-1', '2025-01-01', '2025-01-31')
  assert.equal(detail.summary.netPay, 64300)
  assert.equal(detail.summary.hours, 6)
  assert.equal(detail.legacySnapshot, true)
  assert.equal(detail.details[0].jamMulai, null)
  assert.equal(calls.includes('schedule'), false)
})

function manyShifts(tables, count) {
  const attendance = tables.attendance[0]
  tables.schedule = Array.from({ length: count }, (_, i) => ({ id: i + 1, user_id: 'crew-1', tanggal: new Date(Date.UTC(2021,0,1+i)).toISOString().slice(0,10), jam_mulai: '18:00', jam_selesai: '00:00', durasi_jam: 6 }))
  tables.attendance = tables.schedule.map((shift) => ({ ...attendance, id: shift.id, schedule_id: shift.id }))
  tables.crew_payroll_tier_history[0].effective_on = '2020-01-01'
  tables.overtime_requests = []
}

test('1001 jadwal dan absensi seluruhnya terbaca dengan batas server 1000 baris', async () => {
  const { tables, actions } = setup()
  manyShifts(tables, 1001)
  const report = await actions.loadPayrollReport('2021-01-01', '2024-12-31')
  assert.equal(report.rows[0].scheduledDays, 1001)
  assert.equal(report.rows[0].hours, 6006)
  assert.equal(report.rows[0].netPay, 1001 * 48300)
  const detail = await actions.loadPayrollCrewDetail('crew-1', '2021-01-01', '2024-12-31')
  assert.equal(detail.details.length, 1001)
  assert.equal(detail.summary.hours, 6006)
})

test('pagination tetap lengkap ketika batas server lebih kecil daripada ukuran halaman', async () => {
  const { tables, actions } = setup({ rowLimit: 200 })
  manyShifts(tables, 601)
  const report = await actions.loadPayrollReport('2021-01-01', '2024-12-31')
  assert.equal(report.rows[0].scheduledDays, 601)
  assert.equal(report.rows[0].netPay, 601 * 48300)
})

test('riwayat tier dan penyesuaian di atas 1000 baris tidak terpotong', async () => {
  const { tables, actions } = setup()
  tables.crew_payroll_tier_history = Array.from({ length: 1001 }, (_, i) => ({ id: i + 1, user_id: 'crew-1', effective_on: '2025-01-01', tier: i === 1000 ? 'senior' : 'training', senior_plus_level: i === 1000 ? 2 : 0 }))
  tables.payroll_tier_rates.push({ tier: 'training', hourly_rate: 5000 })
  tables.payroll_adjustments = Array.from({ length: 1001 }, (_, i) => ({ id: i + 1, payroll_period_id: 1, user_id: 'crew-1', adjustment_type: 'other_deduction', amount: 1, reason: 'Test' }))
  const report = await actions.loadPayrollReport('2025-01-01', '2025-01-31')
  assert.equal(report.rows[0].basePay, 40800)
  assert.equal(report.rows[0].deductions, 1001)
  assert.equal(report.rows[0].netPay, 63299)
})

test('kegagalan halaman lanjutan menghasilkan error, bukan rekap sebagian', async () => {
  const { tables, actions } = setup({ failPageOf: 'schedule' })
  manyShifts(tables, 1001)
  const result = await actions.loadPayrollReport('2021-01-01', '2024-12-31')
  assert.equal(result.success, false)
  assert.match(result.message, /Page unavailable/)
})

test('periode final tanpa arsip tidak dihitung ulang diam-diam', async () => {
  const { tables, actions } = setup()
  tables.payroll_periods[0].status = 'finalized'
  const result = await actions.loadPayrollReport('2025-01-01', '2025-01-31')
  assert.equal(result.success, false)
  assert.match(result.message, /Rekap payroll final tidak ditemukan/)
})

test('crew, status, dan arsip final di atas 1000 baris tetap lengkap', async () => {
  const { tables, actions } = setup()
  tables.users = Array.from({ length: 1001 }, (_, i) => ({ id: `crew-${i + 1}`, nama: `Crew ${i + 1}`, username: `crew${i + 1}`, role: 'crew', status_aktif: true }))
  tables.crew_payroll_status = tables.users.map((user) => ({ user_id: user.id, tier: 'senior', senior_plus_level: 2 }))
  const report = await actions.loadPayrollReport('2025-01-01', '2025-01-31')
  assert.equal(report.rows.length, 1001)
  assert.equal(report.rows.find((row) => row.userId === 'crew-1001').tier, 'senior')
  await actions.savePayrollDraft('2025-01-01', '2025-01-31')
  tables.payroll_periods[0].status = 'finalized'
  const frozen = await actions.loadPayrollReport('2025-01-01', '2025-01-31')
  assert.equal(frozen.rows.length, 1001)
  assert.equal(frozen.rows.find((row) => row.userId === 'crew-1').netPay, 64300)
})

test('lembur dan pelanggaran tetap lengkap pada batas server 200 baris', async () => {
  const { tables, actions } = setup({ rowLimit: 200 })
  tables.overtime_requests = Array.from({ length: 601 }, (_, i) => ({ id: i + 1, user_id: 'crew-1', tanggal: '2025-01-05', jam_dibayar: 1, nominal: 8000, status: 'disetujui' }))
  tables.crew_violations = Array.from({ length: 601 }, (_, i) => violation({ id: i + 1, denda: 1, poin: 1 }))
  const report = await actions.loadPayrollReport('2025-01-01', '2025-01-31')
  assert.equal(report.rows[0].overtimePay, 601 * 8000)
  assert.equal(report.rows[0].violationDeductions, 601)
})
