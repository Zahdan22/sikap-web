'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createSwapRequest(tanggal: string, targetId: string, alasan: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, message: 'Belum login' }

  const { error } = await supabase.from('shift_swap_request').insert({
    tanggal,
    requester_id: user.id,
    target_id: targetId,
    alasan,
  })

  if (error) return { success: false, message: error.message }
  revalidatePath('/tukar-shift')
  return { success: true }
}

export async function respondSwapRequest(
  id: number,
  status: 'disetujui' | 'ditolak',
  catatanManajer: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, message: 'Belum login' }

  const { data: swap, error: fetchError } = await supabase
    .from('shift_swap_request')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !swap) return { success: false, message: 'Pengajuan tidak ditemukan' }

  const { error } = await supabase
    .from('shift_swap_request')
    .update({ status, approved_by: user.id, catatan_manajer: catatanManajer })
    .eq('id', id)

  if (error) return { success: false, message: error.message }

  if (status === 'disetujui') {
    const { data: scheduleA } = await supabase
      .from('schedule')
      .select('*')
      .eq('user_id', swap.requester_id)
      .eq('tanggal', swap.tanggal)
      .maybeSingle()

    const { data: scheduleB } = await supabase
      .from('schedule')
      .select('*')
      .eq('user_id', swap.target_id)
      .eq('tanggal', swap.tanggal)
      .maybeSingle()

    if (scheduleA && scheduleB) {
      // Skenario 1: keduanya kerja — tukar jam+jobdesk penuh
      const { data: jobdeskA } = await supabase.from('schedule_jobdesk').select('jobdesk_id').eq('schedule_id', scheduleA.id)
      const { data: jobdeskB } = await supabase.from('schedule_jobdesk').select('jobdesk_id').eq('schedule_id', scheduleB.id)

      await supabase.from('schedule').update({
        jam_mulai: scheduleB.jam_mulai, jam_selesai: scheduleB.jam_selesai, durasi_jam: scheduleB.durasi_jam,
      }).eq('id', scheduleA.id)

      await supabase.from('schedule').update({
        jam_mulai: scheduleA.jam_mulai, jam_selesai: scheduleA.jam_selesai, durasi_jam: scheduleA.durasi_jam,
      }).eq('id', scheduleB.id)

      await supabase.from('schedule_jobdesk').delete().eq('schedule_id', scheduleA.id)
      await supabase.from('schedule_jobdesk').delete().eq('schedule_id', scheduleB.id)

      if (jobdeskB && jobdeskB.length > 0) {
        await supabase.from('schedule_jobdesk').insert(jobdeskB.map((j) => ({ schedule_id: scheduleA.id, jobdesk_id: j.jobdesk_id })))
      }
      if (jobdeskA && jobdeskA.length > 0) {
        await supabase.from('schedule_jobdesk').insert(jobdeskA.map((j) => ({ schedule_id: scheduleB.id, jobdesk_id: j.jobdesk_id })))
      }
    } else if (scheduleA && !scheduleB) {
      // Skenario 2: A kerja, B libur — pindahkan kepemilikan jadwal A ke B
      await supabase.from('schedule').update({ user_id: swap.target_id }).eq('id', scheduleA.id)
    } else if (!scheduleA && scheduleB) {
      // Skenario 3: B kerja, A libur — pindahkan kepemilikan jadwal B ke A
      await supabase.from('schedule').update({ user_id: swap.requester_id }).eq('id', scheduleB.id)
    }
    // Skenario 4 (keduanya libur): no-op, tidak ada yang perlu ditukar
  }

  revalidatePath('/manager/tukar-shift')
  revalidatePath('/tukar-shift')
  revalidatePath('/jadwal-saya')
  return { success: true }
}