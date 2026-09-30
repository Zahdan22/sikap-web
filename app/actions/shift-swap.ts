'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createSwapRequest(
  tanggal: string,
  targetType: 'crew' | 'freelance',
  targetId: string | null,
  targetNamaFreelance: string | null,
  alasan: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, message: 'Belum login' }

  const { error } = await supabase.from('shift_swap_request').insert({
    tanggal,
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
