'use server'

import { supabaseAdmin } from '@/lib/supabase-admin'
import { usernameToEmail } from '@/lib/auth'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

export async function createCrewAccount(
  username: string,
  password: string,
  nama: string,
  role: 'crew' | 'manager' = 'crew'
) {
  const supabase = await createServerSupabase()
  const { data: { user: caller } } = await supabase.auth.getUser()
  if (!caller) return { success: false, message: 'Kamu belum login' }

  const { data: callerProfile } = await supabase.from('users').select('role').eq('id', caller.id).single()
  if (callerProfile?.role !== 'manager') {
    return { success: false, message: 'Hanya manager yang boleh membuat akun baru' }
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: usernameToEmail(username),
    password,
    email_confirm: true,
  })

  if (error || !data.user) return { success: false, message: error?.message }

  const { error: profileError } = await supabaseAdmin.from('users').insert({
    id: data.user.id,
    username: username.trim().toLowerCase(),
    nama,
    role,
  })

  if (profileError) return { success: false, message: profileError.message }
  return { success: true }
}

export async function deleteCrewAccount(userId: string) {
  const supabase = await createServerSupabase()
  const { data: { user: caller } } = await supabase.auth.getUser()
  if (!caller) return { success: false, message: 'Kamu belum login' }

  const { data: callerProfile } = await supabase.from('users').select('role').eq('id', caller.id).single()
  if (callerProfile?.role !== 'manager') {
    return { success: false, message: 'Hanya manager yang boleh menghapus akun' }
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
  if (error) return { success: false, message: error.message }

  return { success: true }
}