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
  penggantiNamaManual: string | null,
  buktiPath: string | null
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, message: 'Belum login' }
  const { data: requester, error: requesterError } = await supabase.from('users')
    .select('role, status_aktif').eq('id', user.id).single()
  if (requesterError) return { success: false, message: 'Gagal memeriksa akun: ' + requesterError.message }
  if (requester.role !== 'crew' || !requester.status_aktif) return { success: false, message: 'Hanya crew aktif yang dapat mengajukan izin.' }
  if (buktiPath && (!buktiPath.startsWith(`${user.id}/`) || buktiPath.includes('..'))) {
    return { success: false, message: 'Path bukti izin tidak valid.' }
  }
  if (!['sakit', 'keperluan_pribadi'].includes(jenis) || !['crew', 'freelance'].includes(penggantiType)) {
    return { success: false, message: 'Jenis pengajuan tidak valid.' }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggalMulai) || !/^\d{4}-\d{2}-\d{2}$/.test(tanggalSelesai) || tanggalSelesai < tanggalMulai) {
    return { success: false, message: 'Rentang tanggal izin tidak valid.' }
  }
  if (penggantiType === 'crew') {
    if (!penggantiUserId || penggantiUserId === user.id) return { success: false, message: 'Crew pengganti tidak valid.' }
    const { data: replacement, error: replacementError } = await supabase.from('users')
      .select('id').eq('id', penggantiUserId).eq('role', 'crew').eq('status_aktif', true).maybeSingle()
    if (replacementError) return { success: false, message: 'Gagal memeriksa crew pengganti: ' + replacementError.message }
    if (!replacement) return { success: false, message: 'Crew pengganti tidak ditemukan atau sedang nonaktif.' }
  } else if (!penggantiNamaManual?.trim()) {
    return { success: false, message: 'Nama freelance pengganti wajib diisi.' }
  }

  const { data: existingPending, error: pendingError } = await supabase.from('leave_request')
    .select('id').eq('user_id', user.id).eq('status', 'pending')
    .lte('tanggal_mulai', tanggalSelesai).gte('tanggal_selesai', tanggalMulai).limit(1)
  if (pendingError) return { success: false, message: 'Gagal memeriksa pengajuan izin lain: ' + pendingError.message }
  if (existingPending?.length) return { success: false, message: 'Masih ada pengajuan izin lain yang menunggu pada rentang tanggal tersebut.' }

  const { error } = await supabase.from('leave_request').insert({
    user_id: user.id,
    jenis,
    tanggal_mulai: tanggalMulai,
    tanggal_selesai: tanggalSelesai,
    alasan,
    pengganti_type: penggantiType,
    pengganti_user_id: penggantiType === 'crew' ? penggantiUserId : null,
    pengganti_nama_manual: penggantiType === 'freelance' ? penggantiNamaManual : null,
    bukti_path: buktiPath,
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
  if (!Number.isInteger(id) || id <= 0 || !['disetujui', 'ditolak'].includes(status)) {
    return { success: false, message: 'Data keputusan izin tidak valid.' }
  }

  const { data: profile, error: profileError } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profileError) return { success: false, message: 'Gagal memeriksa akses manager: ' + profileError.message }
  if (profile?.role !== 'manager') return { success: false, message: 'Hanya manager yang dapat memproses pengajuan izin' }

  const { data: leaveRequest, error: fetchError } = await supabase
    .from('leave_request')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !leaveRequest) {
    return { success: false, message: 'Pengajuan izin tidak ditemukan' }
  }
  if (leaveRequest.status !== 'pending') return { success: false, message: 'Pengajuan ini sudah pernah diproses' }

  let originalSchedules: { id: number; user_id: string | null; freelance_nama: string | null; tanggal: string }[] = []
  if (status === 'disetujui') {
    if (leaveRequest.pengganti_type === 'crew' && !leaveRequest.pengganti_user_id) {
      return { success: false, message: 'Crew pengganti belum dipilih' }
    }
    if (leaveRequest.pengganti_type === 'freelance' && !leaveRequest.pengganti_nama_manual?.trim()) {
      return { success: false, message: 'Nama freelance pengganti belum diisi' }
    }
    const { data: schedules, error: schedulesError } = await supabase
      .from('schedule')
      .select('id, tanggal, user_id, freelance_nama')
      .eq('user_id', leaveRequest.user_id)
      .gte('tanggal', leaveRequest.tanggal_mulai)
      .lte('tanggal', leaveRequest.tanggal_selesai)
    if (schedulesError) return { success: false, message: 'Gagal membaca jadwal pengaju: ' + schedulesError.message }
    originalSchedules = schedules || []

    if (originalSchedules.length > 0) {
      const { data: attendanceRows, error: attendanceError } = await supabase.from('attendance')
        .select('schedule_id')
        .in('schedule_id', originalSchedules.map((row) => row.id))
      if (attendanceError) return { success: false, message: 'Gagal memeriksa absensi pada jadwal izin: ' + attendanceError.message }
      const checkedIn = originalSchedules.find((row) => attendanceRows?.some((item) => item.schedule_id === row.id))
      if (checkedIn) return { success: false, message: `Jadwal tanggal ${checkedIn.tanggal} sudah memiliki data absensi dan tidak dapat dialihkan.` }
    }

    if (leaveRequest.pengganti_type === 'crew' && leaveRequest.pengganti_user_id) {
      const { data: targetSchedules, error: targetError } = await supabase
        .from('schedule').select('tanggal').eq('user_id', leaveRequest.pengganti_user_id)
        .gte('tanggal', leaveRequest.tanggal_mulai).lte('tanggal', leaveRequest.tanggal_selesai)
      if (targetError) return { success: false, message: 'Gagal memeriksa jadwal crew pengganti: ' + targetError.message }
      const occupiedDates = new Set((targetSchedules || []).map((row) => row.tanggal))
      const conflict = originalSchedules.find((row) => occupiedDates.has(row.tanggal))
      if (conflict) return { success: false, message: `Crew pengganti sudah memiliki jadwal tanggal ${conflict.tanggal}` }
    }

    for (const sch of originalSchedules) {
      let updateError: { message: string } | null = null
      if (leaveRequest.pengganti_type === 'crew' && leaveRequest.pengganti_user_id) {
        const { error } = await supabase
          .from('schedule')
          .update({ user_id: leaveRequest.pengganti_user_id, freelance_nama: null })
          .eq('id', sch.id)
        updateError = error
      } else if (leaveRequest.pengganti_type === 'freelance') {
        const { error } = await supabase
          .from('schedule')
          .update({ user_id: null, freelance_nama: leaveRequest.pengganti_nama_manual })
          .eq('id', sch.id)
        updateError = error
      } else {
        return { success: false, message: 'Jenis pengganti tidak valid' }
      }
      if (updateError) {
        const rollbackErrors: string[] = []
        for (const original of originalSchedules) {
          if (original.id === sch.id) break
          const { error } = await supabase.from('schedule').update({ user_id: original.user_id, freelance_nama: original.freelance_nama }).eq('id', original.id)
          if (error) rollbackErrors.push(`${original.tanggal}: ${error.message}`)
        }
        return { success: false, message: `Gagal mengganti jadwal tanggal ${sch.tanggal}: ${updateError.message}${rollbackErrors.length ? `. Pemulihan sebagian gagal: ${rollbackErrors.join('; ')}` : '. Perubahan sebelumnya sudah dipulihkan.'}` }
      }
    }
  }

  const { data: processed, error } = await supabase
    .from('leave_request')
    .update({ status, approved_by: user.id, catatan_manajer: catatanManajer })
    .eq('id', id).eq('status', 'pending').select('id').maybeSingle()
  if (error || !processed) {
    const rollbackErrors: string[] = []
    for (const original of originalSchedules) {
      const { error: rollbackError } = await supabase.from('schedule').update({ user_id: original.user_id, freelance_nama: original.freelance_nama }).eq('id', original.id)
      if (rollbackError) rollbackErrors.push(`${original.tanggal}: ${rollbackError.message}`)
    }
    return { success: false, message: `Gagal memperbarui status izin: ${error?.message || 'Pengajuan sudah diproses oleh manager lain'}${rollbackErrors.length ? `. Pemulihan jadwal gagal: ${rollbackErrors.join('; ')}` : originalSchedules.length ? '. Perubahan jadwal sudah dipulihkan.' : ''}` }
  }

  revalidatePath('/manager/izin')
  revalidatePath('/manager/jadwal')
  revalidatePath('/jadwal-saya')

  return { success: true, message: status === 'disetujui' ? `Izin disetujui; ${originalSchedules.length} jadwal diperbarui.` : 'Izin ditolak.' }
}
