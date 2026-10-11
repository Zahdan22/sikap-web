import type { createClient } from '@/lib/supabase/server'
import { overtimeError } from '@/lib/overtime'

export type ApprovedOvertime = {
  id: number; user_id: string; tanggal: string; jam_mulai: string; jam_selesai: string
  jam_dibayar: number; nominal: number; keterangan: string
}

export async function loadApprovedOvertime(supabase: Awaited<ReturnType<typeof createClient>>, start: string, end: string, userId?: string) {
  const rows: ApprovedOvertime[] = []
  // Paginate explicitly so a busy period cannot silently lose overtime pay.
  for (let offset = 0; ; offset += 500) {
    let query = supabase.from('overtime_requests')
      .select('id, user_id, tanggal, jam_mulai, jam_selesai, jam_dibayar, nominal, keterangan')
      .eq('status', 'disetujui').gte('tanggal', start).lte('tanggal', end).order('id')
    if (userId) query = query.eq('user_id', userId)
    const { data, error } = await query.range(offset, offset + 499)
    if (error) return { success: false as const, message: overtimeError(error.message) }
    rows.push(...(data || []).map((row) => ({ ...row, jam_dibayar: Number(row.jam_dibayar), nominal: Number(row.nominal) })))
    if (!data || data.length < 500) break
  }
  return { success: true as const, rows }
}
