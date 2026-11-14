/* eslint-disable @typescript-eslint/no-require-imports -- Node's CJS test loader is used to mock server-only aliases. */
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

// Jalankan server action asli dengan Supabase tiruan agar reset tidak pernah
// memakai password lama maupun memberi akses pada peran selain Admin 1.
function setup({ access = { ok: true, userId: 'manager-1' }, firstAuthUpdateFails = false } = {}) {
  const targetId = '00000000-0000-4000-8000-000000000001'
  const tables = {
    users: [
      { id: targetId, nama: 'Hamada', username: 'hamada', role: 'crew', status_aktif: true },
      { id: '00000000-0000-4000-8000-000000000002', nama: 'Crew Satu', username: 'crew1', role: 'crew', status_aktif: true },
    ],
  }
  const authUpdates = []
  const revalidatedPaths = []
  let authAttempt = 0

  function from(tableName) {
    assert.equal(tableName, 'users')
    const filters = []
    let pendingUpdate = null
    let single = false
    let orderKey = null
    let range = null
    let withCount = false
    const query = {
      select(_columns, options) {
        withCount = options?.count === 'exact'
        return query
      },
      eq(key, value) {
        filters.push([key, value])
        return query
      },
      order(key) {
        orderKey = key
        return query
      },
      range(start, end) {
        range = [start, end]
        return query
      },
      update(payload) {
        pendingUpdate = payload
        return query
      },
      maybeSingle() {
        single = true
        return query
      },
      then(resolve, reject) {
        let rows = tables.users.filter((row) => filters.every(([key, value]) => row[key] === value))
        if (pendingUpdate) rows.forEach((row) => Object.assign(row, pendingUpdate))
        if (orderKey) rows = [...rows].sort((left, right) => String(left[orderKey]).localeCompare(String(right[orderKey])))
        const count = rows.length
        if (range) rows = rows.slice(range[0], range[1] + 1)
        return Promise.resolve({
          data: single ? rows[0] || null : rows,
          error: null,
          ...(withCount ? { count } : {}),
        }).then(resolve, reject)
      },
    }
    return query
  }

  const supabase = { from }
  const modules = {}
  function load(relative) {
    if (modules[relative]) return modules[relative]
    const source = readFileSync(path.join(__dirname, '..', relative), 'utf8')
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText
    const compiledModule = { exports: {} }
    new Function('require', 'module', 'exports', compiled)((id) => {
      if (id === 'next/cache') return { revalidatePath: (value) => revalidatedPaths.push(value) }
      if (id === '@/lib/supabase-admin') {
        return {
          supabaseAdmin: {
            from,
            auth: {
              admin: {
                updateUserById: async (id, payload) => {
                  authUpdates.push({ id, payload })
                  authAttempt += 1
                  return firstAuthUpdateFails && authAttempt === 1
                    ? { error: { message: 'User already registered' } }
                    : { error: null }
                },
              },
            },
          },
        }
      }
      if (id === '@/lib/auth') return { usernameToEmail: (username) => `${username}@sikap.internal` }
      if (id === '@/lib/manager-auth') return { requireManager: async () => ({ ...access, supabase }) }
      if (id === '@/lib/payroll-pagination') {
        return {
          loadAllPayrollRows: async (page) => page(0, 499),
        }
      }
      throw new Error(`Unexpected dependency: ${id}`)
    }, compiledModule, compiledModule.exports)
    modules[relative] = compiledModule.exports
    return compiledModule.exports
  }

  return { targetId, tables, authUpdates, revalidatedPaths, actions: load('app/actions/create-user.ts') }
}

test('Admin 1 mereset crew ke username default kosong dan password default tanpa membaca password lama', async () => {
  const { targetId, tables, authUpdates, revalidatedPaths, actions } = setup()

  const result = await actions.resetCrewCredentials(targetId)

  assert.deepEqual(result, { success: true, username: 'crew2', password: 'crew123', nama: 'Hamada' })
  assert.equal(tables.users.find((user) => user.id === targetId).username, 'crew2')
  assert.deepEqual(authUpdates, [{
    id: targetId,
    payload: { email: 'crew2@sikap.internal', email_confirm: true, password: 'crew123' },
  }])
  assert.deepEqual(revalidatedPaths, ['/manager/karyawan'])
})

test('reset tidak dapat dijalankan tanpa hak Admin 1', async () => {
  const { targetId, tables, authUpdates, actions } = setup({ access: { ok: false, message: 'Akses ditolak.' } })

  const result = await actions.resetCrewCredentials(targetId)

  assert.deepEqual(result, { success: false, message: 'Akses ditolak.' })
  assert.equal(tables.users.find((user) => user.id === targetId).username, 'hamada')
  assert.equal(authUpdates.length, 0)
})

test('reset mencoba username default berikutnya setelah email Auth lama sudah dipakai dan mengembalikan profil dengan benar', async () => {
  const { targetId, tables, authUpdates, actions } = setup({ firstAuthUpdateFails: true })

  const result = await actions.resetCrewCredentials(targetId)

  assert.deepEqual(result, { success: true, username: 'crew3', password: 'crew123', nama: 'Hamada' })
  assert.equal(tables.users.find((user) => user.id === targetId).username, 'crew3')
  assert.deepEqual(authUpdates.map((call) => call.payload.email), ['crew2@sikap.internal', 'crew3@sikap.internal'])
})
