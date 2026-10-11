const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

// Exercise the actual payroll actions with a deterministic Supabase fixture.
// Network/auth and Next cache invalidation are replaced; payroll arithmetic is not.
function setup() {
  const tables = {
    users: [{ id: 'crew-1', nama: 'Crew', username: 'crew', role: 'crew', status_aktif: true }],
    schedule: [{ id: 1, user_id: 'crew-1', tanggal: '2025-01-05', jam_mulai: '18:00', jam_selesai: '00:00', durasi_jam: 6 }],
    crew_payroll_tier_history: [{ id: 1, user_id: 'crew-1', tier: 'senior', senior_plus_level: 2, effective_on: '2025-01-01' }],
    crew_payroll_status: [{ user_id: 'crew-1', tier: 'senior', senior_plus_level: 2 }],
    payroll_tier_rates: [{ tier: 'senior', hourly_rate: 6800 }],
    payroll_senior_plus_rates: [{ level: 2, daily_bonus: 7500 }],
    attendance: [{ id: 1, user_id: 'crew-1', schedule_id: 1, jam_masuk_aktual: '2025-01-05T10:50:00Z', jam_pulang_aktual: '2025-01-05T17:00:00Z', status_masuk: 'tepat_waktu', status_pulang: 'tepat_waktu', menit_telat: 0 }],
    payroll_periods: [{ id: 1, period_start: '2025-01-01', period_end: '2025-01-31', status: 'draft' }],
    payroll_adjustments: [], payroll_items: [],
    overtime_requests: [
      { id: 1, user_id: 'crew-1', tanggal: '2025-01-05', jam_mulai: '00:00', jam_selesai: '02:30', jam_dibayar: 2, nominal: 16000, status: 'disetujui', keterangan: 'Ramai' },
      { id: 2, user_id: 'crew-1', tanggal: '2025-01-06', jam_dibayar: 1, nominal: 8000, status: 'pending' },
      { id: 3, user_id: 'crew-1', tanggal: '2025-01-07', jam_dibayar: 3, nominal: 24000, status: 'ditolak' },
      { id: 4, user_id: 'crew-1', tanggal: '2025-02-01', jam_dibayar: 4, nominal: 32000, status: 'disetujui' },
    ],
  }
  const client = {
    rpc: async () => ({ error: null }),
    from(name) {
      let rows = [...tables[name]]
      let single = false
      const query = {
        select() { return query },
        eq(key, value) { rows = rows.filter((row) => row[key] === value); return query },
        gte(key, value) { rows = rows.filter((row) => row[key] >= value); return query },
        lte(key, value) { rows = rows.filter((row) => row[key] <= value); return query },
        not(key, op, value) { rows = rows.filter((row) => row[key] !== value); return query },
        in(key, values) { rows = rows.filter((row) => values.includes(row[key])); return query },
        order(key) { rows.sort((a, b) => a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0); return query },
        range(start, end) { rows = rows.slice(start, end + 1); return query },
        maybeSingle() { single = true; return query },
        upsert(records) { tables[name] = Array.isArray(records) ? records : [records]; return query },
        then(resolve, reject) { return Promise.resolve({ data: single ? rows[0] || null : rows, error: null }).then(resolve, reject) },
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
  return { tables, actions: load('app/actions/payroll.ts') }
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

test('rekap tidak terpotong pada batas 1.000 baris Supabase', async () => {
  const { tables, actions } = setup()
  tables.overtime_requests = Array.from({ length: 1001 }, (_, index) => ({ id: index + 1, user_id: 'crew-1', tanggal: '2025-01-05', jam_dibayar: 1, nominal: 8000, status: 'disetujui' }))
  const report = await actions.loadPayrollReport('2025-01-01', '2025-01-31')
  assert.equal(report.rows[0].overtimeHours, 1001)
  assert.equal(report.rows[0].overtimePay, 8008000)
})
