'use server'

import { requireManager } from '@/lib/manager-auth'
import { revalidatePath } from 'next/cache'

export async function createJobdesk(nama: string, singkatan: string) {
  const access = await requireManager()
  if (!access.ok) return { success: false, message: access.message }
  const { supabase, userId } = access
  if (!nama.trim() || !singkatan.trim()) return { success: false, message: 'Nama dan singkatan jobdesk wajib diisi.' }

  const { error } = await supabase.from('jobdesk').insert({
    nama: nama.trim(),
    singkatan: singkatan.trim().toUpperCase(),
    dibuat_oleh: userId,
  })

  if (error) return { success: false, message: error.message }
  revalidatePath('/manager/jobdesk')
  return { success: true }
}

export async function updateJobdesk(id: number, nama: string, singkatan: string) {
  const access = await requireManager()
  if (!access.ok) return { success: false, message: access.message }
  const { supabase } = access
  if (!nama.trim() || !singkatan.trim()) return { success: false, message: 'Nama dan singkatan jobdesk wajib diisi.' }
  const { error } = await supabase
    .from('jobdesk')
    .update({ nama: nama.trim(), singkatan: singkatan.trim().toUpperCase() })
    .eq('id', id)

  if (error) return { success: false, message: error.message }
  revalidatePath('/manager/jobdesk')
  return { success: true }
}

export async function deleteJobdesk(id: number) {
  const access = await requireManager()
  if (!access.ok) return { success: false, message: access.message }
  const { supabase } = access
  const { error } = await supabase.from('jobdesk').delete().eq('id', id)

  if (error) return { success: false, message: error.message }
  revalidatePath('/manager/jobdesk')
  return { success: true }
}
