'use server'

import { revalidatePath } from 'next/cache'
import { usernameToEmail } from '@/lib/auth'
import { requireOwner } from '@/lib/owner-auth'
import { requirePayrollStaff } from '@/lib/payroll-staff-auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/
const MAX_AMOUNT = 999_999_999_999

type ActionResult = { success: true } | { success: false; message: string }
type PayrollAmounts = { gajiPokok: number; tunjangan: number; bonusKomisi: number; potongan: number }

function safeMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : ''
  if (/duplicate|unique|already.*exist|already.*registered/i.test(message)) return 'Data yang sama sudah terdaftar.'
  return fallback
}

function validId(value: string) {
  return UUID_PATTERN.test(value)
}

function cleanName(value: unknown, label: string, min = 2, max = 100) {
  const result = typeof value === 'string' ? value.trim() : ''
  if (result.length < min || result.length > max) throw new Error(`${label} harus terdiri dari ${min}–${max} karakter.`)
  return result
}

function cleanUsername(value: unknown) {
  const result = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!USERNAME_PATTERN.test(result)) throw new Error('Username harus 3–32 karakter: huruf, angka, titik, garis bawah, atau tanda hubung.')
  return result
}

function readAmount(value: unknown, label: string) {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(number) || number < 0 || number > MAX_AMOUNT) throw new Error(`${label} harus berupa nominal rupiah bulat dari 0 sampai ${MAX_AMOUNT.toLocaleString('id-ID')}.`)
  return number
}

function revalidateOwnerPayroll() {
  revalidatePath('/owner')
  revalidatePath('/owner/payroll')
  revalidatePath('/payroll-management')
}

export async function loadOwnerPayrollData() {
  const access = await requireOwner()
  if (!access.ok) return { success: false as const, message: access.message }

  const [rolesResult, profilesResult, usersResult, periodsResult, itemsResult, outletsResult] = await Promise.all([
    supabaseAdmin.from('payroll_roles').select('id,nama,is_active,created_at,updated_at').order('nama'),
    supabaseAdmin.from('payroll_staff_profiles').select('user_id,payroll_role_id,created_at,updated_at'),
    supabaseAdmin.from('users').select('id,nama,username,role,status_aktif,outlet_id').in('role', ['payroll_staff', 'manager', 'finance']).order('nama'),
    supabaseAdmin.from('management_payroll_periods').select('id,nama,period_start,period_end,status,finalized_at,updated_at').order('period_end', { ascending: false }),
    supabaseAdmin.from('management_payroll_items').select('id,period_id,user_id,role_label_snapshot,gaji_pokok,tunjangan,bonus_komisi,potongan,catatan,updated_at').order('updated_at', { ascending: false }),
    supabaseAdmin.from('outlets').select('id,nama,is_active,setup_complete').order('nama'),
  ])

  const resultWithError = [rolesResult, profilesResult, usersResult, periodsResult, itemsResult, outletsResult].find((result) => result.error)
  if (resultWithError?.error) return { success: false as const, message: 'Data payroll pusat belum dapat dimuat. Coba lagi beberapa saat.' }

  const roles = rolesResult.data || []
  const roleById = new Map(roles.map((role) => [role.id, role]))
  const profileByUserId = new Map((profilesResult.data || []).map((profile) => [profile.user_id, profile]))
  const outletById = new Map((outletsResult.data || []).map((outlet) => [outlet.id, outlet.nama]))
  const users = (usersResult.data || []).map((user) => {
    const profile = profileByUserId.get(user.id)
    return {
      ...user,
      payrollRoleId: profile?.payroll_role_id || null,
      payrollRoleName: profile ? roleById.get(profile.payroll_role_id)?.nama || 'Role tidak tersedia' : null,
      outletName: user.outlet_id ? outletById.get(user.outlet_id) || 'Outlet tidak tersedia' : null,
    }
  })

  return {
    success: true as const,
    roles,
    users,
    outlets: outletsResult.data || [],
    periods: periodsResult.data || [],
    items: itemsResult.data || [],
  }
}

export async function createPayrollRole(input: { nama: string }): Promise<ActionResult> {
  const access = await requireOwner()
  if (!access.ok) return { success: false, message: access.message }
  try {
    const nama = cleanName(input?.nama, 'Nama role payroll')
    const { error } = await supabaseAdmin.from('payroll_roles').insert({ nama, created_by: access.userId })
    if (error) throw error
    revalidateOwnerPayroll()
    return { success: true }
  } catch (error) {
    return { success: false, message: safeMessage(error, 'Role payroll belum dapat ditambahkan.') }
  }
}

export async function updatePayrollRole(input: { id: string; nama: string; isActive: boolean }): Promise<ActionResult> {
  const access = await requireOwner()
  if (!access.ok) return { success: false, message: access.message }
  try {
    if (!validId(input?.id)) throw new Error('Role payroll tidak valid.')
    const nama = cleanName(input.nama, 'Nama role payroll')
    if (typeof input.isActive !== 'boolean') throw new Error('Status role payroll tidak valid.')
    const { error } = await supabaseAdmin.from('payroll_roles').update({ nama, is_active: input.isActive, updated_at: new Date().toISOString() }).eq('id', input.id)
    if (error) throw error
    revalidateOwnerPayroll()
    return { success: true }
  } catch (error) {
    return { success: false, message: safeMessage(error, 'Role payroll belum dapat diubah.') }
  }
}

export async function deletePayrollRole(input: { id: string; replacementId?: string | null }): Promise<ActionResult> {
  const access = await requireOwner()
  if (!access.ok) return { success: false, message: access.message }
  try {
    if (!validId(input?.id)) throw new Error('Role payroll tidak valid.')
    const { count, error: countError } = await supabaseAdmin.from('payroll_staff_profiles').select('user_id', { count: 'exact', head: true }).eq('payroll_role_id', input.id)
    if (countError) throw countError
    if ((count || 0) > 0) {
      if (!validId(input.replacementId || '') || input.replacementId === input.id) throw new Error('Pilih role pengganti untuk akun yang masih memakai role ini.')
      const { data: replacement, error: replacementError } = await supabaseAdmin.from('payroll_roles').select('id,is_active').eq('id', input.replacementId!).maybeSingle()
      if (replacementError || !replacement?.is_active) throw new Error('Role pengganti tidak tersedia atau tidak aktif.')
      const { error: updateError } = await supabaseAdmin.from('payroll_staff_profiles').update({ payroll_role_id: input.replacementId!, updated_at: new Date().toISOString() }).eq('payroll_role_id', input.id)
      if (updateError) throw updateError
    }
    const { error } = await supabaseAdmin.from('payroll_roles').delete().eq('id', input.id)
    if (error) throw error
    revalidateOwnerPayroll()
    return { success: true }
  } catch (error) {
    return { success: false, message: safeMessage(error, 'Role payroll belum dapat dihapus.') }
  }
}

export async function createPayrollStaff(input: { nama: string; username: string; password: string; payrollRoleId: string }): Promise<ActionResult> {
  const access = await requireOwner()
  if (!access.ok) return { success: false, message: access.message }
  let authUserId: string | null = null
  try {
    const nama = cleanName(input?.nama, 'Nama karyawan')
    const username = cleanUsername(input?.username)
    const password = typeof input?.password === 'string' ? input.password : ''
    if (password.length < 8 || password.length > 72) throw new Error('Password harus 8–72 karakter.')
    if (!validId(input?.payrollRoleId)) throw new Error('Pilih role payroll yang valid.')
    const { data: payrollRole, error: roleError } = await supabaseAdmin.from('payroll_roles').select('id').eq('id', input.payrollRoleId).eq('is_active', true).maybeSingle()
    if (roleError || !payrollRole) throw new Error('Role payroll tidak tersedia.')

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({ email: usernameToEmail(username), password, email_confirm: true })
    if (authError || !authData.user) throw authError || new Error('Akun login belum dapat dibuat.')
    authUserId = authData.user.id
    const { error: profileError } = await supabaseAdmin.from('users').insert({ id: authUserId, nama, username, role: 'payroll_staff', outlet_id: null })
    if (profileError) throw profileError
    const { error: staffError } = await supabaseAdmin.from('payroll_staff_profiles').insert({ user_id: authUserId, payroll_role_id: input.payrollRoleId })
    if (staffError) throw staffError
    revalidateOwnerPayroll()
    return { success: true }
  } catch (error) {
    if (authUserId) await supabaseAdmin.auth.admin.deleteUser(authUserId)
    return { success: false, message: safeMessage(error, 'Akun payroll belum dapat dibuat.') }
  }
}

export async function createOutletManagementAccount(input: { nama: string; username: string; password: string; role: 'manager' | 'finance'; outletId: string }): Promise<ActionResult> {
  const access = await requireOwner()
  if (!access.ok) return { success: false, message: access.message }
  let authUserId: string | null = null
  try {
    const nama = cleanName(input?.nama, 'Nama pengelola')
    const username = cleanUsername(input?.username)
    const password = typeof input?.password === 'string' ? input.password : ''
    if (password.length < 8 || password.length > 72) throw new Error('Password harus 8–72 karakter.')
    if (!['manager', 'finance'].includes(input?.role)) throw new Error('Tipe pengelola tidak valid.')
    if (!validId(input?.outletId)) throw new Error('Pilih outlet yang valid.')
    const { data: outlet, error: outletError } = await supabaseAdmin.from('outlets').select('id').eq('id', input.outletId).maybeSingle()
    if (outletError || !outlet) throw new Error('Outlet tidak ditemukan.')
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({ email: usernameToEmail(username), password, email_confirm: true })
    if (authError || !authData.user) throw authError || new Error('Akun login belum dapat dibuat.')
    authUserId = authData.user.id
    const { error: profileError } = await supabaseAdmin.from('users').insert({ id: authUserId, nama, username, role: input.role, outlet_id: input.outletId })
    if (profileError) throw profileError
    revalidateOwnerPayroll()
    return { success: true }
  } catch (error) {
    if (authUserId) await supabaseAdmin.auth.admin.deleteUser(authUserId)
    return { success: false, message: safeMessage(error, 'Akun pengelola belum dapat dibuat.') }
  }
}

export async function updateManagedAccount(input: { userId: string; nama: string; payrollRoleId?: string | null; active: boolean }): Promise<ActionResult> {
  const access = await requireOwner()
  if (!access.ok) return { success: false, message: access.message }
  try {
    if (!validId(input?.userId) || input.userId === access.userId) throw new Error('Akun yang dipilih tidak valid.')
    const nama = cleanName(input.nama, 'Nama akun')
    const { data: target, error: targetError } = await supabaseAdmin.from('users').select('role').eq('id', input.userId).maybeSingle()
    if (targetError || !target || !['payroll_staff', 'manager', 'finance'].includes(target.role)) throw new Error('Akun tidak ditemukan.')
    if (typeof input.active !== 'boolean') throw new Error('Status akun tidak valid.')
    if (target.role === 'payroll_staff') {
      if (!validId(input.payrollRoleId || '')) throw new Error('Pilih role payroll yang valid.')
      const { data: role, error: roleError } = await supabaseAdmin.from('payroll_roles').select('id,is_active').eq('id', input.payrollRoleId!).maybeSingle()
      if (roleError || !role?.is_active) throw new Error('Role payroll tidak tersedia atau tidak aktif.')
      const { error: roleUpdateError } = await supabaseAdmin.from('payroll_staff_profiles').update({ payroll_role_id: input.payrollRoleId!, updated_at: new Date().toISOString() }).eq('user_id', input.userId)
      if (roleUpdateError) throw roleUpdateError
    }
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(input.userId, { ban_duration: input.active ? 'none' : '876000h' })
    if (authError) throw authError
    const { error: profileError } = await supabaseAdmin.from('users').update({ nama, status_aktif: input.active, updated_at: new Date().toISOString() }).eq('id', input.userId)
    if (profileError) throw profileError
    revalidateOwnerPayroll()
    return { success: true }
  } catch (error) {
    return { success: false, message: safeMessage(error, 'Akun belum dapat diperbarui.') }
  }
}

export async function createManagementPayrollPeriod(input: { nama: string; periodStart: string; periodEnd: string }): Promise<ActionResult> {
  const access = await requireOwner()
  if (!access.ok) return { success: false, message: access.message }
  try {
    const nama = cleanName(input?.nama, 'Nama periode payroll')
    const start = String(input?.periodStart || '')
    const end = String(input?.periodEnd || '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) throw new Error('Rentang tanggal periode tidak valid.')
    const { error } = await supabaseAdmin.from('management_payroll_periods').insert({ nama, period_start: start, period_end: end, created_by: access.userId })
    if (error) throw error
    revalidateOwnerPayroll()
    return { success: true }
  } catch (error) {
    return { success: false, message: safeMessage(error, 'Periode payroll belum dapat ditambahkan.') }
  }
}

export async function updateManagementPayrollPeriod(input: { id: string; nama: string; periodStart: string; periodEnd: string }): Promise<ActionResult> {
  const access = await requireOwner()
  if (!access.ok) return { success: false, message: access.message }
  try {
    if (!validId(input?.id)) throw new Error('Periode payroll tidak valid.')
    const nama = cleanName(input.nama, 'Nama periode payroll')
    const start = String(input.periodStart || '')
    const end = String(input.periodEnd || '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) throw new Error('Rentang tanggal periode tidak valid.')
    const { error } = await supabaseAdmin.from('management_payroll_periods').update({ nama, period_start: start, period_end: end, updated_at: new Date().toISOString() }).eq('id', input.id)
    if (error) throw error
    revalidateOwnerPayroll()
    return { success: true }
  } catch (error) {
    return { success: false, message: safeMessage(error, 'Periode payroll belum dapat diubah.') }
  }
}

export async function deleteManagementPayrollPeriod(id: string): Promise<ActionResult> {
  const access = await requireOwner()
  if (!access.ok) return { success: false, message: access.message }
  try {
    if (!validId(id)) throw new Error('Periode payroll tidak valid.')
    const { data: period, error: periodError } = await supabaseAdmin.from('management_payroll_periods').select('status').eq('id', id).maybeSingle()
    if (periodError || !period) throw new Error('Periode payroll tidak ditemukan.')
    if (period.status !== 'draft') throw new Error('Periode yang sudah difinalisasi tidak dapat dihapus. Ubah nominalnya langsung bila ada koreksi.')
    const { error } = await supabaseAdmin.from('management_payroll_periods').delete().eq('id', id)
    if (error) throw error
    revalidateOwnerPayroll()
    return { success: true }
  } catch (error) {
    return { success: false, message: safeMessage(error, 'Periode payroll belum dapat dihapus.') }
  }
}

export async function saveManagementPayrollItem(input: { id?: string; periodId: string; userId: string; amounts: PayrollAmounts; catatan?: string }): Promise<ActionResult> {
  const access = await requireOwner()
  if (!access.ok) return { success: false, message: access.message }
  try {
    if (!validId(input?.periodId) || !validId(input?.userId)) throw new Error('Data payroll tidak valid.')
    if (input.id && !validId(input.id)) throw new Error('Baris payroll tidak valid.')
    const gaji_pokok = readAmount(input.amounts?.gajiPokok, 'Gaji pokok')
    const tunjangan = readAmount(input.amounts?.tunjangan, 'Tunjangan')
    const bonus_komisi = readAmount(input.amounts?.bonusKomisi, 'Bonus / komisi')
    const potongan = readAmount(input.amounts?.potongan, 'Potongan')
    const catatan = typeof input.catatan === 'string' ? input.catatan.trim() : ''
    if (catatan.length > 2000) throw new Error('Catatan maksimal 2.000 karakter.')
    const { data: period, error: periodError } = await supabaseAdmin.from('management_payroll_periods').select('id').eq('id', input.periodId).maybeSingle()
    if (periodError || !period) throw new Error('Periode payroll tidak ditemukan.')
    const { data: staff, error: staffError } = await supabaseAdmin.from('payroll_staff_profiles').select('payroll_role_id').eq('user_id', input.userId).maybeSingle()
    if (staffError || !staff) throw new Error('Akun ini bukan bagian dari payroll manajemen.')
    const { data: role, error: roleError } = await supabaseAdmin.from('payroll_roles').select('nama').eq('id', staff.payroll_role_id).maybeSingle()
    if (roleError || !role) throw new Error('Role payroll akun ini tidak tersedia.')
    const payload = { period_id: input.periodId, user_id: input.userId, role_label_snapshot: role.nama, gaji_pokok, tunjangan, bonus_komisi, potongan, catatan: catatan || null, updated_by: access.userId, updated_at: new Date().toISOString() }
    if (input.id) {
      const { data: existing, error: existingError } = await supabaseAdmin.from('management_payroll_items').select('*').eq('id', input.id).eq('period_id', input.periodId).eq('user_id', input.userId).maybeSingle()
      if (existingError || !existing) throw new Error('Baris payroll tidak ditemukan atau sudah berubah.')
      const { error } = await supabaseAdmin.from('management_payroll_items').update(payload).eq('id', input.id)
      if (error) throw error
      const { error: auditError } = await supabaseAdmin.from('management_payroll_events').insert({ item_id: input.id, period_id: input.periodId, actor_id: access.userId, action: 'updated', before_data: existing, after_data: payload })
      if (auditError) throw auditError
    } else {
      const { data: created, error } = await supabaseAdmin.from('management_payroll_items').insert(payload).select('*').single()
      if (error || !created) throw error || new Error('Baris payroll belum dapat dibuat.')
      const { error: auditError } = await supabaseAdmin.from('management_payroll_events').insert({ item_id: created.id, period_id: input.periodId, actor_id: access.userId, action: 'created', after_data: created })
      if (auditError) throw auditError
    }
    revalidateOwnerPayroll()
    return { success: true }
  } catch (error) {
    return { success: false, message: safeMessage(error, 'Rincian payroll belum dapat disimpan.') }
  }
}

export async function deleteManagementPayrollItem(id: string): Promise<ActionResult> {
  const access = await requireOwner()
  if (!access.ok) return { success: false, message: access.message }
  try {
    if (!validId(id)) throw new Error('Baris payroll tidak valid.')
    const { data: existing, error: lookupError } = await supabaseAdmin.from('management_payroll_items').select('*').eq('id', id).maybeSingle()
    if (lookupError || !existing) throw new Error('Baris payroll tidak ditemukan.')
    const { error: auditError } = await supabaseAdmin.from('management_payroll_events').insert({ item_id: existing.id, period_id: existing.period_id, actor_id: access.userId, action: 'deleted', before_data: existing })
    if (auditError) throw auditError
    const { error } = await supabaseAdmin.from('management_payroll_items').delete().eq('id', id)
    if (error) throw error
    revalidateOwnerPayroll()
    return { success: true }
  } catch (error) {
    return { success: false, message: safeMessage(error, 'Baris payroll belum dapat dihapus.') }
  }
}

export async function finalizeManagementPayrollPeriod(id: string): Promise<ActionResult> {
  const access = await requireOwner()
  if (!access.ok) return { success: false, message: access.message }
  try {
    if (!validId(id)) throw new Error('Periode payroll tidak valid.')
    const now = new Date().toISOString()
    const { data: period, error: periodError } = await supabaseAdmin.from('management_payroll_periods').select('id,status').eq('id', id).maybeSingle()
    if (periodError || !period) throw new Error('Periode payroll tidak ditemukan.')
    if (period.status === 'finalized') return { success: true }
    const { error } = await supabaseAdmin.from('management_payroll_periods').update({ status: 'finalized', finalized_by: access.userId, finalized_at: now, updated_at: now }).eq('id', id)
    if (error) throw error
    const { error: auditError } = await supabaseAdmin.from('management_payroll_events').insert({ period_id: id, actor_id: access.userId, action: 'finalized', after_data: { status: 'finalized', finalized_at: now } })
    if (auditError) throw auditError
    revalidateOwnerPayroll()
    return { success: true }
  } catch (error) {
    return { success: false, message: safeMessage(error, 'Periode payroll belum dapat difinalisasi.') }
  }
}

export async function loadMyManagementPayroll() {
  const access = await requirePayrollStaff()
  if (!access.ok) return { success: false as const, message: access.message }
  const { data, error } = await access.supabase
    .from('management_payroll_items')
    .select('id,role_label_snapshot,gaji_pokok,tunjangan,bonus_komisi,potongan,catatan,updated_at,period:management_payroll_periods!inner(id,nama,period_start,period_end,status,finalized_at)')
    .eq('user_id', access.userId)
    .order('updated_at', { ascending: false })
  if (error) return { success: false as const, message: 'Slip payroll belum dapat dimuat.' }
  return { success: true as const, items: data || [] }
}

