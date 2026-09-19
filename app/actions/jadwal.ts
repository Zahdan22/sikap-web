'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

type CrewPayload = {
  userId: string
  jamKerjaOpsiId: number | 'libur'
  jobdeskIds: number[]
}

export async function simpanJadwalHariIni(tanggal: string, payload: CrewPayload[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, message: 'Belum login' }

  const { data: jamKerjaOptions } = await supabase.from('jam_kerja_opsi').select('*')

  for (const item of payload) {
    // Cari schedule yang sudah ada untuk crew ini di tanggal ini
    const { data: existing } = await supabase
      .from('schedule')
      .select('id')
      .eq('user_id', item.userId)
      .eq('tanggal', tanggal)
      .maybeSingle()

    if (item.jamKerjaOpsiId === 'libur') {
      // Libur: hapus jadwal kalau ada
      if (existing) {
        await supabase.from('schedule').delete().eq('id', existing.id)
      }
      continue
    }

    const option = jamKerjaOptions?.find((o) => o.id === item.jamKerjaOpsiId)
    if (!option) continue

    let scheduleId: number

    if (existing) {
      // Update jadwal yang sudah ada
      await supabase
        .from('schedule')
        .update({
          jam_mulai: option.jam_mulai,
          jam_selesai: option.jam_selesai,
          durasi_jam: option.durasi_jam,
        })
        .eq('id', existing.id)
      scheduleId = existing.id

      // Reset total jobdesk lama
      await supabase.from('schedule_jobdesk').delete().eq('schedule_id', scheduleId)
    } else {
      // Buat jadwal baru
      const { data: created, error } = await supabase
        .from('schedule')
        .insert({
          user_id: item.userId,
          tanggal,
          jam_mulai: option.jam_mulai,
          jam_selesai: option.jam_selesai,
          durasi_jam: option.durasi_jam,
          dibuat_oleh: user.id,
        })
        .select('id')
        .single()

      if (error || !created) {
        return { success: false, message: 'Gagal simpan jadwal: ' + error?.message }
      }
      scheduleId = created.id
    }

    // Insert ulang jobdesk sesuai pilihan terbaru
    if (item.jobdeskIds.length > 0) {
      const jobdeskRows = item.jobdeskIds.map((jobdeskId) => ({
        schedule_id: scheduleId,
        jobdesk_id: jobdeskId,
      }))
      await supabase.from('schedule_jobdesk').insert(jobdeskRows)
    }
  }

  revalidatePath('/manager/jadwal')
  return { success: true }
}