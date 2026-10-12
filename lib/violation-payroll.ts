import type { createClient } from '@/lib/supabase/server'
import { violationError, type Violation } from '@/lib/violations'
import { loadAllPayrollRows } from '@/lib/payroll-pagination'

export async function loadPayrollViolations(supabase: Awaited<ReturnType<typeof createClient>>, start: string, end: string, userId?: string) {
  const { data, error } = await loadAllPayrollRows((from, to) => {
    let query = supabase.from('crew_violations').select('id, user_id, tanggal, kesalahan, poin, denda, reviewed_at, reviewed_by, version, created_at')
      .is('deleted_at', null).not('reviewed_at', 'is', null).gte('tanggal', start).lte('tanggal', end).order('id')
    if (userId) query = query.eq('user_id', userId)
    return query.range(from, to)
  })
  if (error) return { success: false as const, message: violationError(error.message) }
  const rows: Violation[] = (data || []).map((row) => ({ ...row, poin: Number(row.poin), denda: Number(row.denda) }))
  return { success: true as const, rows }
}
