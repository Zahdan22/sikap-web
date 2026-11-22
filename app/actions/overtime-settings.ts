'use server'

import { revalidatePath } from 'next/cache'
import { requireFinance } from '@/lib/finance-auth'

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function revalidateOvertimeRatePaths() {
  for (const path of ['/finance/pengaturan', '/finance/pengaturan/tarif-lembur', '/lembur', '/manager/lembur', '/finance/lembur', '/finance/payroll']) {
    revalidatePath(path)
  }
}

export async function loadOvertimeRateSettings() {
  const access = await requireFinance()
  if (!access.ok) return { success: false as const, message: access.message }
  const { data, error } = await access.supabase.from('overtime_rate_history')
    .select('id, hourly_rate, effective_on, created_at, updated_at')
    .eq('outlet_id', access.outletId)
    .order('effective_on', { ascending: false })
    .order('id', { ascending: false })
  if (error) return { success: false as const, message: 'Riwayat tarif lembur belum dapat dimuat. Coba lagi beberapa saat.' }
  return {
    success: true as const,
    rates: (data || []).map((rate) => ({
      id: Number(rate.id), hourlyRate: Number(rate.hourly_rate), effectiveOn: rate.effective_on,
      createdAt: rate.created_at, updatedAt: rate.updated_at,
    })),
  }
}

export async function saveOvertimeRateConfig(hourlyRate: number, effectiveOn: string) {
  const access = await requireFinance()
  if (!access.ok) return { success: false as const, message: access.message }
  const cleanRate = Math.round(hourlyRate)
  if (!Number.isSafeInteger(cleanRate) || cleanRate < 0 || cleanRate > 100_000_000) {
    return { success: false as const, message: 'Tarif per jam harus berupa angka bulat dari Rp0 sampai Rp100.000.000.' }
  }
  if (!validDate(effectiveOn)) return { success: false as const, message: 'Tanggal berlaku tarif tidak valid.' }
  const { error } = await access.supabase.from('overtime_rate_history').upsert({
    outlet_id: access.outletId,
    hourly_rate: cleanRate,
    effective_on: effectiveOn,
    recorded_by: access.userId,
    updated_by: access.userId,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'outlet_id,effective_on' })
  if (error) return { success: false as const, message: 'Tarif lembur belum dapat disimpan. Coba lagi beberapa saat.' }
  revalidateOvertimeRatePaths()
  return { success: true as const }
}

export async function deleteOvertimeRateConfig(rateId: number) {
  const access = await requireFinance()
  if (!access.ok) return { success: false as const, message: access.message }
  if (!Number.isSafeInteger(rateId) || rateId <= 0) return { success: false as const, message: 'Riwayat tarif tidak valid.' }
  const [{ data: target, error: targetError }, { data: firstRate, error: firstRateError }] = await Promise.all([
    access.supabase.from('overtime_rate_history').select('id').eq('id', rateId).eq('outlet_id', access.outletId).maybeSingle(),
    access.supabase.from('overtime_rate_history').select('id').eq('outlet_id', access.outletId).order('effective_on', { ascending: true }).order('id', { ascending: true }).limit(1).maybeSingle(),
  ])
  if (targetError || firstRateError || !target || !firstRate) return { success: false as const, message: 'Riwayat tarif tidak ditemukan.' }
  if (Number(target.id) === Number(firstRate.id)) {
    return { success: false as const, message: 'Tarif awal tidak dapat dihapus agar setiap tanggal tetap memiliki tarif lembur.' }
  }
  const { error } = await access.supabase.from('overtime_rate_history').delete().eq('id', rateId).eq('outlet_id', access.outletId)
  if (error) return { success: false as const, message: 'Riwayat tarif belum dapat dihapus. Coba lagi beberapa saat.' }
  revalidateOvertimeRatePaths()
  return { success: true as const }
}
