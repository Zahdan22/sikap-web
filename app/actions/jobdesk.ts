'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createJobdesk(nama: string, singkatan: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, message: 'Belum login' }

  const { error } = await supabase.from('jobdesk').insert({
    nama,
    singkatan: singkatan.toUpperCase(),
    dibuat_oleh: user.id,
  })

  if (error) return { success: false, message: error.message }
  revalidatePath('/manager/jobdesk')
  return { success: true }
}

export async function updateJobdesk(id: number, nama: string, singkatan: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('jobdesk')
    .update({ nama, singkatan: singkatan.toUpperCase() })
    .eq('id', id)

  if (error) return { success: false, message: error.message }
  revalidatePath('/manager/jobdesk')
  return { success: true }
}

export async function deleteJobdesk(id: number) {
  const supabase = await createClient()
  const { error } = await supabase.from('jobdesk').delete().eq('id', id)

  if (error) return { success: false, message: error.message }
  revalidatePath('/manager/jobdesk')
  return { success: true }
}