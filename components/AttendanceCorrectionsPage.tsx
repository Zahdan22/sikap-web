import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AttendanceCorrectionsClient from './AttendanceCorrectionsClient'

export default async function AttendanceCorrectionsPage({ expectedRole }: { expectedRole: 'crew' | 'manager' | 'finance' }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('users').select('role,status_aktif').eq('id', user.id).single()
  if (!profile?.status_aktif) redirect('/login')
  if (profile.role !== expectedRole) redirect('/dashboard')
  return <AttendanceCorrectionsClient manager={expectedRole !== 'crew'} userId={user.id} backHref={expectedRole === 'finance' ? '/finance' : '/dashboard'} />
}
