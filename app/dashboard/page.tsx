import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
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

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
        <Link href="/checkin">Absensi (Check-In / Check-Out)</Link>
        <Link href="/jadwal-saya">Jadwal Saya</Link>
        <Link href="/izin">Ajukan Izin</Link>
        <Link href="/tukar-shift">Tukar Shift</Link>

        {profile?.role === 'manager' && (
          <>
            <hr />
            <p><strong>Menu Manager</strong></p>
            <Link href="/manager/jadwal">Kelola Jadwal</Link>
            <Link href="/manager/jam-kerja">Kelola Jam Kerja</Link>
            <Link href="/manager/jobdesk">Kelola Jobdesk</Link>
            <Link href="/manager/izin">Kelola Izin</Link>
            <Link href="/manager/tukar-shift">Kelola Tukar Shift</Link>
          </>
        )}
      </nav>

      <div style={{ marginTop: 16 }}>
        <LogoutButton />
      </div>
    </div>
  )
}