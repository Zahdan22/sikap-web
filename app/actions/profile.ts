'use server'

import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { usernameToEmail } from '@/lib/auth'

export async function updateProfile(nama: string, username: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, message: 'Belum login' }

  const cleanUsername = username.trim().toLowerCase()

  const { error } = await supabaseAdmin
    .from('users')
    .update({ nama, username: cleanUsername })
    .eq('id', user.id)

  if (error) return { success: false, message: error.message }

  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    email: usernameToEmail(cleanUsername),
  })
  if (authError) return { success: false, message: authError.message }

  return { success: true }
}