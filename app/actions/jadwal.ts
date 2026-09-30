'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

type CrewPayload = {
  userId: string
  jamKerjaOpsiId: number | 'libur' | 'jadwal-lama'
  jobdeskIds: number[]
}

export async function simpanJadwalHariIni(tanggal: string, payload: CrewPayload[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, message: 'Belum login' }

  const { data: profile, error: profileError } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profileError) return { success: false, message: 'Gagal memeriksa akses manager: ' + profileError.message }
  if (profile?.role !== 'manager') return { success: false, message: 'Hanya manager yang dapat mengelola jadwal' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal) || !Array.isArray(payload)) {
    return { success: false, message: 'Tanggal atau data jadwal tidak valid' }
  }
  if (new Set(payload.map((item) => item.userId)).size !== payload.length) return { success: false, message: 'Data memuat crew duplikat' }
  const { data: crewRows, error: crewError } = await supabase.from('users').select('id').eq('role', 'crew').eq('status_aktif', true)
  if (crewError) return { success: false, message: 'Gagal memeriksa daftar crew: ' + crewError.message }
  const crewIds = new Set((crewRows || []).map((row) => row.id))

  const { data: jamKerjaOptions, error: optionsError } = await supabase.from('jam_kerja_opsi').select('*')
  if (optionsError) return { success: false, message: 'Gagal memuat pilihan jam kerja: ' + optionsError.message }
  const { data: jobdesks, error: jobdeskError } = await supabase.from('jobdesk').select('id')
  if (jobdeskError) return { success: false, message: 'Gagal memuat jobdesk: ' + jobdeskError.message }
  const validJobdeskIds = new Set((jobdesks || []).map((row) => row.id))

  for (const item of payload) {
    if (!item.userId || !crewIds.has(item.userId) || !Array.isArray(item.jobdeskIds) || item.jobdeskIds.some((id) => !validJobdeskIds.has(id))) {
      return { success: false, message: 'Data crew atau jobdesk tidak valid' }
    }
    if (new Set(item.jobdeskIds).size !== item.jobdeskIds.length) return { success: false, message: 'Jobdesk duplikat ditemukan' }

    const { data: existing, error: existingError } = await supabase
      .from('schedule').select('id, jam_mulai, jam_selesai, durasi_jam')
      .eq('user_id', item.userId).eq('tanggal', tanggal).maybeSingle()
    if (existingError) return { success: false, message: `Gagal membaca jadwal ${tanggal}: ${existingError.message}` }

    const { data: oldJobdesk, error: oldJobdeskError } = existing
      ? await supabase.from('schedule_jobdesk').select('jobdesk_id').eq('schedule_id', existing.id)
      : { data: [], error: null }
    if (oldJobdeskError) return { success: false, message: 'Gagal membaca jobdesk lama: ' + oldJobdeskError.message }

    if (item.jamKerjaOpsiId === 'libur') {
      if (existing) {
        const { count, error: attendanceError } = await supabase.from('attendance').select('id', { count: 'exact', head: true }).eq('schedule_id', existing.id)
        if (attendanceError) return { success: false, message: 'Gagal memeriksa absensi terkait: ' + attendanceError.message }
        if (count) return { success: false, message: 'Jadwal tidak bisa dihapus karena sudah memiliki data absensi' }
        const { error } = await supabase.from('schedule').delete().eq('id', existing.id)
        if (error) return { success: false, message: 'Gagal menghapus jadwal: ' + error.message }
      }
      continue
    }

    const option = item.jamKerjaOpsiId === 'jadwal-lama'
      ? null
      : (jamKerjaOptions || []).find((row) => row.id === item.jamKerjaOpsiId)
    if (item.jamKerjaOpsiId !== 'jadwal-lama' && !option) {
      return { success: false, message: 'Pilihan jam kerja tidak valid. Muat ulang halaman dan coba lagi.' }
    }
    if (!existing && !option) return { success: false, message: 'Jadwal lama tidak ditemukan; pilih jam kerja yang tersedia.' }

    let scheduleId = existing?.id
    if (existing && option) {
      const { error } = await supabase.from('schedule').update({
        jam_mulai: option.jam_mulai, jam_selesai: option.jam_selesai, durasi_jam: option.durasi_jam,
      }).eq('id', existing.id)
      if (error) return { success: false, message: 'Gagal memperbarui jadwal: ' + error.message }
    } else if (!existing && option) {
      const { data: created, error } = await supabase.from('schedule').insert({
        user_id: item.userId, tanggal, jam_mulai: option.jam_mulai, jam_selesai: option.jam_selesai,
        durasi_jam: option.durasi_jam, dibuat_oleh: user.id,
      }).select('id').single()
      if (error || !created) return { success: false, message: 'Gagal membuat jadwal: ' + (error?.message || 'Jadwal tidak tersimpan') }
      scheduleId = created.id
    }

    if (!scheduleId) return { success: false, message: 'Jadwal tidak memiliki ID yang valid' }
    const { error: deleteJobdeskError } = await supabase.from('schedule_jobdesk').delete().eq('schedule_id', scheduleId)
    if (deleteJobdeskError) {
      const rollbackErrors: string[] = []
      if (existing && option) {
        const { error } = await supabase.from('schedule').update({ jam_mulai: existing.jam_mulai, jam_selesai: existing.jam_selesai, durasi_jam: existing.durasi_jam }).eq('id', scheduleId)
        if (error) rollbackErrors.push('jadwal lama: ' + error.message)
      } else if (!existing) {
        const { error } = await supabase.from('schedule').delete().eq('id', scheduleId)
        if (error) rollbackErrors.push('jadwal baru: ' + error.message)
      }
      return { success: false, message: `Gagal memperbarui jobdesk: ${deleteJobdeskError.message}${rollbackErrors.length ? `. Pemulihan juga gagal: ${rollbackErrors.join('; ')}` : existing && option ? '. Perubahan jam dipulihkan.' : ''}` }
    }
    if (item.jobdeskIds.length > 0) {
      const { error: insertJobdeskError } = await supabase.from('schedule_jobdesk').insert(
        item.jobdeskIds.map((jobdeskId) => ({ schedule_id: scheduleId!, jobdesk_id: jobdeskId }))
      )
      if (insertJobdeskError) {
        const rollbackErrors: string[] = []
        if (existing && option) {
          const { error } = await supabase.from('schedule').update({ jam_mulai: existing.jam_mulai, jam_selesai: existing.jam_selesai, durasi_jam: existing.durasi_jam }).eq('id', scheduleId)
          if (error) rollbackErrors.push('jadwal lama: ' + error.message)
        } else if (!existing) {
          const { error } = await supabase.from('schedule').delete().eq('id', scheduleId)
          if (error) rollbackErrors.push('jadwal baru: ' + error.message)
        }
        if (existing && oldJobdesk?.length) {
          const { error: restoreError } = await supabase.from('schedule_jobdesk').insert(
            oldJobdesk.map((row) => ({ schedule_id: scheduleId!, jobdesk_id: row.jobdesk_id }))
          )
          if (restoreError) rollbackErrors.push('jobdesk lama: ' + restoreError.message)
        }
        return { success: false, message: `Gagal menyimpan jobdesk: ${insertJobdeskError.message}${rollbackErrors.length ? `. Pemulihan juga gagal: ${rollbackErrors.join('; ')}` : existing ? '. Perubahan dipulihkan.' : ''}` }
      }
    }
  }

  revalidatePath('/manager/jadwal')
  revalidatePath('/dashboard')
  revalidatePath('/jadwal-saya')
  return { success: true }
}
