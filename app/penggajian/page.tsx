import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PayrollSayaClient from './payroll-saya-client'

export default async function PayrollSayaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('users').select('role, status_aktif').eq('id', user.id).maybeSingle()
  if (!profile?.status_aktif || profile.role !== 'crew') redirect('/dashboard')
  return <PayrollSayaClient />
}
