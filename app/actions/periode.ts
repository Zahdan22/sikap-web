'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createPeriode(nama: string, tanggalMulai: string, tanggalSelesai: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, message: 'Belum login' }

  const { error } = await supabase.from('periode_kerja').insert({
    nama,
    tanggal_mulai: tanggalMulai,
    tanggal_selesai: tanggalSelesai,
    dibuat_oleh: user.id,
  })

  if (error) return { success: false, message: error.message }
  revalidatePath('/manager/periode')
  return { success: true }
}

export async function deletePeriode(id: number) {
  const supabase = await createClient()
  const { error } = await supabase.from('periode_kerja').delete().eq('id', id)
  if (error) return { success: false, message: error.message }
  revalidatePath('/manager/periode')
  return { success: true }
}