import type { createClient } from '@/lib/supabase/server'
import { overtimeError } from '@/lib/overtime'
import { loadAllPayrollRows } from '@/lib/payroll-pagination'

export type ApprovedOvertime = {
  id: number; user_id: string; tanggal: string; jam_mulai: string; jam_selesai: string
  jam_dibayar: number; nominal: number; keterangan: string
}

export async function loadApprovedOvertime(supabase: Awaited<ReturnType<typeof createClient>>, start: string, end: string, userId?: string) {
  const { data, error } = await loadAllPayrollRows((from, to) => {
    let query = supabase.from('overtime_requests')
      .select('id, user_id, tanggal, jam_mulai, jam_selesai, jam_dibayar, nominal, keterangan')
      .eq('status', 'disetujui').gte('tanggal', start).lte('tanggal', end).order('id')
    if (userId) query = query.eq('user_id', userId)
    return query.range(from, to)
  })
  if (error) return { success: false as const, message: overtimeError(error.message) }
  const rows: ApprovedOvertime[] = (data || []).map((row) => ({ ...row, jam_dibayar: Number(row.jam_dibayar), nominal: Number(row.nominal) }))
  return { success: true as const, rows }
}
