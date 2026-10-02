'use server'

import { requireManager } from '@/lib/manager-auth'
import { revalidatePath } from 'next/cache'

export async function createPeriode(nama: string, tanggalMulai: string, tanggalSelesai: string) {
  const access = await requireManager()
  if (!access.ok) return { success: false, message: access.message }
  const { supabase, userId } = access

  const { error } = await supabase.from('periode_kerja').insert({
    nama,
    tanggal_mulai: tanggalMulai,
    tanggal_selesai: tanggalSelesai,
    dibuat_oleh: userId,
  })

  if (error) return { success: false, message: error.message }
  revalidatePath('/manager/periode')
  return { success: true }
}

export async function deletePeriode(id: number) {
  const access = await requireManager()
  if (!access.ok) return { success: false, message: access.message }
  const { supabase } = access
  const { error } = await supabase.from('periode_kerja').delete().eq('id', id)
  if (error) return { success: false, message: error.message }
  revalidatePath('/manager/periode')
  return { success: true }
}
