import type { createClient } from '@/lib/supabase/server'
import { violationError, type Violation } from '@/lib/violations'

export async function loadPayrollViolations(supabase: Awaited<ReturnType<typeof createClient>>, start: string, end: string, userId?: string) {
  const rows: Violation[] = []
  for (let offset = 0; ; offset += 500) {
    let query = supabase.from('crew_violations').select('id, user_id, tanggal, kesalahan, poin, denda, reviewed_at, reviewed_by, version, created_at')
      .is('deleted_at', null).not('reviewed_at', 'is', null).gte('tanggal', start).lte('tanggal', end).order('id')
    if (userId) query = query.eq('user_id', userId)
    const { data, error } = await query.range(offset, offset + 499)
    if (error) return { success: false as const, message: violationError(error.message) }
    rows.push(...(data || []).map((row) => ({ ...row, poin: Number(row.poin), denda: Number(row.denda) })))
    if (!data || data.length < 500) break
  }
  return { success: true as const, rows }
}
