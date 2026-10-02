'use server'

import { requireManager } from '@/lib/manager-auth'
import { revalidatePath } from 'next/cache'

export async function createJobdesk(nama: string, singkatan: string) {
  const access = await requireManager()
  if (!access.ok) return { success: false, message: access.message }
  const { supabase, userId } = access

  const { error } = await supabase.from('jobdesk').insert({
    nama,
    singkatan: singkatan.toUpperCase(),
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
  const { error } = await supabase
    .from('jobdesk')
    .update({ nama, singkatan: singkatan.toUpperCase() })
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
