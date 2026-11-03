import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ViolationAppealsClient from './ViolationAppealsClient'

export default async function ViolationAppealsPage({ role }: { role: 'crew' | 'finance' }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('users').select('role,status_aktif').eq('id', user.id).single()
  if (!profile?.status_aktif || profile.role !== role) redirect(role === 'finance' ? '/finance' : '/dashboard')
  return <ViolationAppealsClient mode={role} backHref={role === 'finance' ? '/finance' : '/dashboard'} />
}
