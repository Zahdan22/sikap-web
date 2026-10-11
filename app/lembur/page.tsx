import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import OvertimeCrewClient from './overtime-crew-client'

export default async function OvertimePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('users').select('role, status_aktif').eq('id', user.id).single()
  if (profile?.role !== 'crew' || !profile.status_aktif) redirect('/dashboard')
  return <OvertimeCrewClient />
}
