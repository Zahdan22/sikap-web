'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

function jakartaToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export async function createSwapRequest(
  tanggal: string,
  tanggalTarget: string | null,
  targetType: 'crew' | 'freelance',
  targetId: string | null,
  targetNamaFreelance: string | null,
  alasan: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, message: 'Belum login' }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal) || !['crew', 'freelance'].includes(targetType)) {
    return { success: false, message: 'Tanggal atau jenis tukar shift tidak valid.' }
  }
  if (targetType === 'crew' && (!tanggalTarget || !/^\d{4}-\d{2}-\d{2}$/.test(tanggalTarget) || tanggalTarget === tanggal)) {
    return { success: false, message: 'Pilih dua tanggal shift yang berbeda.' }
  }
  if (tanggal < jakartaToday() || (targetType === 'crew' && tanggalTarget! < jakartaToday())) {
    return { success: false, message: 'Pertukaran hanya dapat diajukan untuk jadwal hari ini atau mendatang.' }
  }
  const { data: requester, error: requesterError } = await supabase.from('users')
    .select('role, status_aktif').eq('id', user.id).single()
  if (requesterError) return { success: false, message: 'Gagal memeriksa akun: ' + requesterError.message }
  if (requester.role !== 'crew' || !requester.status_aktif) return { success: false, message: 'Hanya crew aktif yang dapat mengajukan tukar shift.' }
  const { data: ownSchedule, error: ownScheduleError } = await supabase.from('schedule')
    .select('id').eq('user_id', user.id).eq('tanggal', tanggal).maybeSingle()
  if (ownScheduleError) return { success: false, message: 'Gagal memeriksa jadwal: ' + ownScheduleError.message }
  if (!ownSchedule) return { success: false, message: 'Kamu tidak memiliki jadwal pada tanggal tersebut.' }
  if (targetType === 'crew') {
    if (!targetId || targetId === user.id) return { success: false, message: 'Pilih crew lain yang valid.' }
    const { data: target, error: targetError } = await supabase.from('users')
      .select('id').eq('id', targetId).eq('role', 'crew').eq('status_aktif', true).maybeSingle()
    if (targetError) return { success: false, message: 'Gagal memeriksa crew tujuan: ' + targetError.message }
    if (!target) return { success: false, message: 'Crew tujuan tidak ditemukan atau sedang nonaktif.' }
    const { data: targetSchedule, error: targetScheduleError } = await supabase.from('schedule')
      .select('id').eq('user_id', targetId).eq('tanggal', tanggalTarget!).maybeSingle()
    if (targetScheduleError) return { success: false, message: 'Gagal memeriksa jadwal rekan: ' + targetScheduleError.message }
    if (!targetSchedule) return { success: false, message: 'Rekan tidak memiliki shift pada tanggal kedua yang dipilih.' }
    const { data: conflicts, error: conflictError } = await supabase.from('schedule')
      .select('id, user_id, tanggal').in('user_id', [user.id, targetId]).in('tanggal', [tanggal, tanggalTarget!])
    if (conflictError) return { success: false, message: 'Gagal memeriksa jadwal tujuan: ' + conflictError.message }
    if ((conflicts || []).some((row) => (row.user_id === user.id && row.tanggal === tanggalTarget)
      || (row.user_id === targetId && row.tanggal === tanggal))) {
      return { success: false, message: 'Pertukaran tidak bisa dilakukan karena salah satu crew sudah memiliki shift pada tanggal tujuan.' }
    }
    const { data: attendanceRows, error: attendanceError } = await supabase.from('attendance')
      .select('id').in('schedule_id', [ownSchedule.id, targetSchedule.id])
    if (attendanceError) return { success: false, message: 'Gagal memeriksa absensi pada jadwal: ' + attendanceError.message }
    if (attendanceRows?.length) return { success: false, message: 'Salah satu shift sudah memiliki data absensi dan tidak dapat diajukan untuk ditukar.' }
  } else if (!targetNamaFreelance?.trim()) {
    return { success: false, message: 'Nama freelance wajib diisi.' }
  }
  const { data: pending, error: pendingError } = await supabase.from('shift_swap_request')
    .select('id, tanggal, tanggal_target').eq('status', 'pending')
    .or(`requester_id.eq.${user.id},target_id.eq.${user.id}`)
  if (pendingError) return { success: false, message: 'Gagal memeriksa pengajuan lain: ' + pendingError.message }
  if ((pending || []).some((row) => [row.tanggal, row.tanggal_target].includes(tanggal)
    || (tanggalTarget && [row.tanggal, row.tanggal_target].includes(tanggalTarget)))) {
    return { success: false, message: 'Kamu masih memiliki pengajuan tukar shift yang memakai salah satu tanggal ini.' }
  }
  if (targetType === 'crew') {
    const { data: crewPending, error: crewPendingError } = await supabase.from('shift_swap_request')
      .select('id, tanggal, tanggal_target').eq('status', 'pending')
      .or(`requester_id.eq.${targetId},target_id.eq.${targetId}`)
    if (crewPendingError) return { success: false, message: 'Gagal memeriksa pengajuan rekan: ' + crewPendingError.message }
    if ((crewPending || []).some((row) => [row.tanggal, row.tanggal_target].includes(tanggal)
      || [row.tanggal, row.tanggal_target].includes(tanggalTarget))) {
      return { success: false, message: 'Kamu atau rekanmu sudah memiliki pengajuan aktif yang memakai salah satu tanggal ini.' }
    }
  }

  const { error } = await supabase.from('shift_swap_request').insert({
    tanggal,
    tanggal_target: targetType === 'crew' ? tanggalTarget : null,
    requester_id: user.id,
    target_type: targetType,
    target_id: targetType === 'crew' ? targetId : null,
    target_nama_freelance: targetType === 'freelance' ? targetNamaFreelance : null,
    alasan,
  })

  if (error) return { success: false, message: error.message }
  revalidatePath('/tukar-shift')
  return { success: true }
}

type ScheduleSnapshot = {
  id: number
  user_id: string | null
  freelance_nama: string | null
  jam_mulai: string
  jam_selesai: string
  durasi_jam: number
  jobdeskIds: number[]
}

async function loadScheduleSnapshot(supabase: Awaited<ReturnType<typeof createClient>>, scheduleId: number) {
  const { data: schedule, error } = await supabase
    .from('schedule')
    .select('id, user_id, freelance_nama, jam_mulai, jam_selesai, durasi_jam')
    .eq('id', scheduleId)
    .single()
  if (error || !schedule) return { snapshot: null, error: error?.message || 'Jadwal tidak ditemukan' }

  const { data: jobdeskRows, error: jobdeskError } = await supabase
    .from('schedule_jobdesk')
    .select('jobdesk_id')
    .eq('schedule_id', scheduleId)
  if (jobdeskError) return { snapshot: null, error: jobdeskError.message }

  return {
    snapshot: { ...schedule, jobdeskIds: (jobdeskRows || []).map((row) => row.jobdesk_id) } as ScheduleSnapshot,
    error: null,
  }
}

async function replaceScheduleJobdesks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scheduleId: number,
  jobdeskIds: number[]
) {
  const { error: deleteError } = await supabase.from('schedule_jobdesk').delete().eq('schedule_id', scheduleId)
  if (deleteError) return deleteError.message
  if (jobdeskIds.length === 0) return null

  const { error: insertError } = await supabase.from('schedule_jobdesk').insert(
    jobdeskIds.map((jobdeskId) => ({ schedule_id: scheduleId, jobdesk_id: jobdeskId }))
  )
  return insertError?.message || null
}

async function restoreSchedules(
  supabase: Awaited<ReturnType<typeof createClient>>,
  snapshots: ScheduleSnapshot[]
) {
  const errors: string[] = []
  for (const snapshot of snapshots) {
    const { error } = await supabase.from('schedule').update({
      user_id: snapshot.user_id,
      freelance_nama: snapshot.freelance_nama,
      jam_mulai: snapshot.jam_mulai,
      jam_selesai: snapshot.jam_selesai,
      durasi_jam: snapshot.durasi_jam,
    }).eq('id', snapshot.id)
    if (error) errors.push(error.message)
  }
  for (const snapshot of snapshots) {
    const error = await replaceScheduleJobdesks(supabase, snapshot.id, snapshot.jobdeskIds)
    if (error) errors.push(error)
  }
  return errors
}

export async function respondSwapRequest(
  id: number,
  status: 'disetujui' | 'ditolak',
  catatanManajer: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, message: 'Belum login' }
  if (!Number.isInteger(id) || id <= 0 || !['disetujui', 'ditolak'].includes(status)) {
    return { success: false, message: 'Data keputusan tukar shift tidak valid.' }
  }

  const { data: profile, error: profileError } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profileError) return { success: false, message: 'Gagal memeriksa akses manager: ' + profileError.message }
  if (profile?.role !== 'manager') return { success: false, message: 'Hanya manager yang dapat memproses tukar shift' }

  const { data: swap, error: fetchError } = await supabase
    .from('shift_swap_request')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (fetchError || !swap) return { success: false, message: 'Pengajuan tidak ditemukan' }

  if (swap.status !== 'pending') return { success: false, message: 'Pengajuan ini sudah pernah diproses' }

  if (status === 'disetujui' && swap.target_type === 'crew' && swap.tanggal_target) {
    const { error } = await supabase.rpc('approve_two_date_shift_swap', {
      p_request_id: id,
      p_manager_note: catatanManajer,
    })
    if (error) return { success: false, message: 'Gagal menyetujui pertukaran jadwal: ' + error.message }
    revalidatePath('/manager/tukar-shift')
    revalidatePath('/tukar-shift')
    revalidatePath('/jadwal-saya')
    revalidatePath('/manager/jadwal')
    revalidatePath('/dashboard')
    return { success: true }
  }

  let snapshots: ScheduleSnapshot[] = []
  if (status === 'disetujui') {
    const { data: scheduleA, error: scheduleAError } = await supabase
      .from('schedule').select('id').eq('user_id', swap.requester_id).eq('tanggal', swap.tanggal).maybeSingle()
    if (scheduleAError) return { success: false, message: 'Gagal membaca jadwal pengaju: ' + scheduleAError.message }

    if (swap.target_type === 'freelance') {
      if (!scheduleA) return { success: false, message: 'Jadwal pengaju tidak ditemukan pada tanggal tersebut' }
      const loaded = await loadScheduleSnapshot(supabase, scheduleA.id)
      if (!loaded.snapshot) return { success: false, message: 'Gagal membaca detail jadwal: ' + loaded.error }
      snapshots = [loaded.snapshot]

      const { data: attendanceRows, error: attendanceError } = await supabase.from('attendance')
        .select('id').eq('schedule_id', loaded.snapshot.id).limit(1)
      if (attendanceError) return { success: false, message: 'Gagal memeriksa absensi terkait: ' + attendanceError.message }
      if (attendanceRows?.length) return { success: false, message: 'Jadwal sudah memiliki data absensi dan tidak dapat ditukar.' }

      const { data: updated, error } = await supabase.from('schedule').update({
        user_id: null,
        freelance_nama: swap.target_nama_freelance,
      }).eq('id', scheduleA.id).select('id').maybeSingle()
      if (error || !updated) return { success: false, message: 'Gagal mengalihkan jadwal ke freelance: ' + (error?.message || 'Jadwal tidak berubah') }
    } else {
      if (!swap.target_id) return { success: false, message: 'Crew tujuan tidak valid' }
      if (swap.target_id === swap.requester_id) return { success: false, message: 'Crew tidak bisa bertukar shift dengan dirinya sendiri' }

      const { data: scheduleB, error: scheduleBError } = await supabase
        .from('schedule').select('id').eq('user_id', swap.target_id).eq('tanggal', swap.tanggal).maybeSingle()
      if (scheduleBError) return { success: false, message: 'Gagal membaca jadwal crew tujuan: ' + scheduleBError.message }
      if (!scheduleA && !scheduleB) return { success: false, message: 'Jadwal kedua crew tidak ditemukan pada tanggal tersebut' }

      if (scheduleA && scheduleB) {
        const [loadedA, loadedB] = await Promise.all([
          loadScheduleSnapshot(supabase, scheduleA.id),
          loadScheduleSnapshot(supabase, scheduleB.id),
        ])
        if (!loadedA.snapshot || !loadedB.snapshot) {
          return { success: false, message: 'Gagal membaca detail jadwal: ' + (loadedA.error || loadedB.error) }
        }
        snapshots = [loadedA.snapshot, loadedB.snapshot]

        const { data: attendanceRows, error: attendanceError } = await supabase.from('attendance')
          .select('schedule_id').in('schedule_id', snapshots.map((snapshot) => snapshot.id))
        if (attendanceError) return { success: false, message: 'Gagal memeriksa absensi terkait: ' + attendanceError.message }
        if (attendanceRows?.length) return { success: false, message: 'Salah satu jadwal sudah memiliki data absensi dan tidak dapat ditukar.' }

        const { data: updatedA, error: updateAError } = await supabase.from('schedule').update({
          jam_mulai: loadedB.snapshot.jam_mulai,
          jam_selesai: loadedB.snapshot.jam_selesai,
          durasi_jam: loadedB.snapshot.durasi_jam,
        }).eq('id', loadedA.snapshot.id).select('id').maybeSingle()
        if (updateAError || !updatedA) return { success: false, message: 'Gagal memperbarui jadwal pengaju: ' + (updateAError?.message || 'Jadwal tidak berubah') }

        const { data: updatedB, error: updateBError } = await supabase.from('schedule').update({
          jam_mulai: loadedA.snapshot.jam_mulai,
          jam_selesai: loadedA.snapshot.jam_selesai,
          durasi_jam: loadedA.snapshot.durasi_jam,
        }).eq('id', loadedB.snapshot.id).select('id').maybeSingle()
        if (updateBError || !updatedB) {
          const restoreErrors = await restoreSchedules(supabase, snapshots)
          const rollbackNote = restoreErrors.length ? ' Pemulihan otomatis gagal: ' + restoreErrors.join('; ') : ' Perubahan jadwal sudah dipulihkan.'
          return { success: false, message: 'Gagal memperbarui jadwal crew tujuan: ' + (updateBError?.message || 'Jadwal tidak berubah') + rollbackNote }
        }

        const jobdeskAError = await replaceScheduleJobdesks(supabase, loadedA.snapshot.id, loadedB.snapshot.jobdeskIds)
        const jobdeskBError = jobdeskAError
          ? null
          : await replaceScheduleJobdesks(supabase, loadedB.snapshot.id, loadedA.snapshot.jobdeskIds)
        if (jobdeskAError || jobdeskBError) {
          const restoreErrors = await restoreSchedules(supabase, snapshots)
          const rollbackNote = restoreErrors.length ? ' Pemulihan otomatis juga mengalami kendala: ' + restoreErrors.join('; ') : ' Perubahan jadwal sudah dipulihkan.'
          return { success: false, message: 'Gagal menukar jobdesk: ' + (jobdeskAError || jobdeskBError) + rollbackNote }
        }
      } else {
        const scheduleToTransfer = scheduleA || scheduleB!
        const newUserId = scheduleA ? swap.target_id : swap.requester_id
        const loaded = await loadScheduleSnapshot(supabase, scheduleToTransfer.id)
        if (!loaded.snapshot) return { success: false, message: 'Gagal membaca detail jadwal: ' + loaded.error }
        snapshots = [loaded.snapshot]

        const { data: attendanceRows, error: attendanceError } = await supabase.from('attendance')
          .select('id').eq('schedule_id', loaded.snapshot.id).limit(1)
        if (attendanceError) return { success: false, message: 'Gagal memeriksa absensi terkait: ' + attendanceError.message }
        if (attendanceRows?.length) return { success: false, message: 'Jadwal sudah memiliki data absensi dan tidak dapat dialihkan.' }

        const { data: updated, error } = await supabase.from('schedule').update({ user_id: newUserId }).eq('id', scheduleToTransfer.id).select('id').maybeSingle()
        if (error || !updated) return { success: false, message: 'Gagal mengalihkan jadwal ke crew tujuan: ' + (error?.message || 'Jadwal tidak berubah') }
      }
    }
  }

  const { data: processed, error: processError } = await supabase
    .from('shift_swap_request')
    .update({ status, approved_by: user.id, catatan_manajer: catatanManajer })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (processError || !processed) {
    const restoreErrors = snapshots.length ? await restoreSchedules(supabase, snapshots) : []
    const rollbackNote = restoreErrors.length ? ' Pemulihan otomatis juga mengalami kendala: ' + restoreErrors.join('; ') : snapshots.length ? ' Perubahan jadwal sudah dipulihkan.' : ''
    return { success: false, message: 'Gagal memperbarui status pengajuan: ' + (processError?.message || 'Pengajuan sudah diproses oleh orang lain') + rollbackNote }
  }

  revalidatePath('/manager/tukar-shift')
  revalidatePath('/tukar-shift')
  revalidatePath('/jadwal-saya')
  revalidatePath('/manager/jadwal')
  revalidatePath('/dashboard')
  return { success: true }
}
