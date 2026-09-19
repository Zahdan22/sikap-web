'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createLeaveRequest(
  jenis: 'sakit' | 'keperluan_pribadi',
  tanggalMulai: string,
  tanggalSelesai: string,
  alasan: string,
  penggantiType: 'crew' | 'freelance',
  penggantiUserId: string | null,
  penggantiNamaManual: string | null
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, message: 'Belum login' }

  const { error } = await supabase.from('leave_request').insert({
    user_id: user.id,
    jenis,
    tanggal_mulai: tanggalMulai,
    tanggal_selesai: tanggalSelesai,
    alasan,
    pengganti_type: penggantiType,
    pengganti_user_id: penggantiType === 'crew' ? penggantiUserId : null,
    pengganti_nama_manual: penggantiType === 'freelance' ? penggantiNamaManual : null,
  })

  if (error) return { success: false, message: error.message }
  revalidatePath('/izin')
  return { success: true }
}

export async function respondLeaveRequest(
  id: number,
  status: 'disetujui' | 'ditolak',
  catatanManajer: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, message: 'Belum login' }

  const { data: leaveRequest, error: fetchError } = await supabase
    .from('leave_request')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !leaveRequest) {
    return { success: false, message: 'Pengajuan izin tidak ditemukan' }
  }

  const { error } = await supabase
    .from('leave_request')
    .update({ status, approved_by: user.id, catatan_manajer: catatanManajer })
    .eq('id', id)

  if (error) return { success: false, message: error.message }

  // Kalau disetujui, jadwal di rentang tanggal izin otomatis dialihkan ke pengganti
  const conflicts: string[] = []

  if (status === 'disetujui') {
    const { data: schedules } = await supabase
      .from('schedule')
      .select('id, tanggal')
      .eq('user_id', leaveRequest.user_id)
      .gte('tanggal', leaveRequest.tanggal_mulai)
      .lte('tanggal', leaveRequest.tanggal_selesai)

    for (const sch of schedules || []) {
      if (leaveRequest.pengganti_type === 'crew' && leaveRequest.pengganti_user_id) {
        const { error: updateError } = await supabase
          .from('schedule')
          .update({ user_id: leaveRequest.pengganti_user_id, freelance_nama: null })
          .eq('id', sch.id)
        if (updateError) conflicts.push(`Tanggal ${sch.tanggal}: ${updateError.message}`)
      } else if (leaveRequest.pengganti_type === 'freelance') {
        const { error: updateError } = await supabase
          .from('schedule')
          .update({ user_id: null, freelance_nama: leaveRequest.pengganti_nama_manual })
          .eq('id', sch.id)
        if (updateError) conflicts.push(`Tanggal ${sch.tanggal}: ${updateError.message}`)
      }
    }
  }

  revalidatePath('/manager/izin')
  revalidatePath('/manager/jadwal')
  revalidatePath('/jadwal-saya')

  if (conflicts.length > 0) {
    return { success: true, message: 'Izin disetujui, tapi ada konflik jadwal: ' + conflicts.join('; ') }
  }
  return { success: true }
}