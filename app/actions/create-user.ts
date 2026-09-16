'use server'

import { supabaseAdmin } from '@/lib/supabase-admin'
import { usernameToEmail } from '@/lib/auth'

export async function createCrewAccount(
  username: string,
  password: string,
  nama: string,
  role: 'crew' | 'manager' = 'crew'
) {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: usernameToEmail(username),
    password,
    email_confirm: true, // langsung dianggap confirmed, gak perlu kirim email
  })

  if (error || !data.user) {
    return { success: false, message: error?.message }
  }

  const { error: profileError } = await supabaseAdmin.from('users').insert({
    id: data.user.id,
    username: username.trim().toLowerCase(),
    nama,
    role,
  })

  if (profileError) {
    return { success: false, message: profileError.message }
  }

  return { success: true }
}