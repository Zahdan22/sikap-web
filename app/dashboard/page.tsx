import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import LogoutButton from './logout-button'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('users')
    .select('nama, role, username')
    .eq('id', user.id)
    .single()

  return (
    <div>
      <h1>Dashboard SIKAP</h1>
      <p>Halo, {profile?.nama} ({profile?.role})</p>
      <LogoutButton />
    </div>
  )
}