'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

type CrewPayload = {
  userId: string
  jamKerjaOpsiId: number | 'libur' | 'jadwal-lama'
  jobdeskIds: number[]
  jobdeskBlocks?: { mulaiMenit: number; selesaiMenit: number; jobdeskIds: number[] }[]
}

export async function simpanJadwalHariIni(tanggal: string, payload: CrewPayload[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, message: 'Belum login' }

  const { data: profile, error: profileError } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profileError) return { success: false, message: 'Gagal memeriksa akses manager: ' + profileError.message }
  if (profile?.role !== 'manager') return { success: false, message: 'Hanya manager yang dapat mengelola jadwal' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal) || !Array.isArray(payload) || payload.length > 200
    || payload.some((item) => !item || typeof item.userId !== 'string' || !Array.isArray(item.jobdeskIds))) {
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

  let blocksTableAvailable = true
  const { error: blocksTableError } = await supabase.from('schedule_jobdesk_block').select('id').limit(1)
  if (blocksTableError) {
    const missingTable = blocksTableError.message.includes('schedule_jobdesk_block')
      && /schema cache|does not exist|relationship/i.test(blocksTableError.message)
    const needsRotationStorage = payload.some((item) => Boolean(item.jobdeskBlocks?.length))
    if (!missingTable || needsRotationStorage) {
      return { success: false, message: missingTable
        ? 'Tabel rotasi jobdesk belum siap. Terapkan migrasi supabase/migrations/202610070001_schedule_jobdesk_blocks.sql terlebih dahulu.'
        : 'Gagal memeriksa tabel rotasi jobdesk: ' + blocksTableError.message }
    }
    blocksTableAvailable = false
  }

  for (const item of payload) {
    if (!item.userId || !crewIds.has(item.userId) || !Array.isArray(item.jobdeskIds) || item.jobdeskIds.some((id) => !validJobdeskIds.has(id))) {
      return { success: false, message: 'Data crew atau jobdesk tidak valid' }
    }
    if (new Set(item.jobdeskIds).size !== item.jobdeskIds.length) return { success: false, message: 'Jobdesk duplikat ditemukan' }
    const blocks = item.jobdeskBlocks || []
    const orderedBlocks = [...blocks].sort((a, b) => a.mulaiMenit - b.mulaiMenit)
    if (orderedBlocks.some((block, index) => index > 0 && orderedBlocks[index - 1].selesaiMenit > block.mulaiMenit)) {
      return { success: false, message: 'Rentang blok jobdesk tidak boleh saling tumpang tindih' }
    }
    for (const block of blocks) {
      if (!Number.isInteger(block.mulaiMenit) || !Number.isInteger(block.selesaiMenit)
        || block.mulaiMenit < 0 || block.selesaiMenit <= block.mulaiMenit || block.selesaiMenit > 2880
        || !Array.isArray(block.jobdeskIds) || block.jobdeskIds.length > 5 || block.jobdeskIds.some((id) => !validJobdeskIds.has(id))) {
        return { success: false, message: 'Pembagian jobdesk atau rentang waktunya tidak valid' }
      }
      if (new Set(block.jobdeskIds).size !== block.jobdeskIds.length) return { success: false, message: 'Ada jobdesk duplikat dalam satu blok waktu' }
    }

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

    if (item.jobdeskBlocks !== undefined && blocksTableAvailable) {
      const startText = option?.jam_mulai || existing?.jam_mulai
      const endText = option?.jam_selesai || existing?.jam_selesai
      if (startText && endText) {
        const [startHour, startMinute = '0'] = startText.split(':')
        const [endHour, endMinute = '0'] = endText.split(':')
        const shiftStart = Number(startHour) * 60 + Number(startMinute)
        let shiftEnd = Number(endHour) * 60 + Number(endMinute)
        if (shiftEnd <= shiftStart) shiftEnd += 1440
        if (blocks.some((block) => block.mulaiMenit < shiftStart || block.selesaiMenit > shiftEnd)) {
          return { success: false, message: 'Jobdesk harus berada di dalam rentang jam shift crew.' }
        }
      }
    }

    if (existing && option && (existing.jam_mulai !== option.jam_mulai || existing.jam_selesai !== option.jam_selesai || Number(existing.durasi_jam) !== Number(option.durasi_jam))) {
      const { count, error } = await supabase.from('attendance').select('id', { count: 'exact', head: true }).eq('schedule_id', existing.id)
      if (error) return { success: false, message: 'Gagal memeriksa absensi terkait: ' + error.message }
      if (count) return { success: false, message: `Jam jadwal tanggal ${tanggal} tidak bisa diubah karena absensinya sudah tercatat.` }
    }

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

    if (item.jobdeskBlocks !== undefined) {
      const { error: deleteBlocksError } = await supabase.from('schedule_jobdesk_block').delete().eq('schedule_id', scheduleId)
      if (deleteBlocksError) return { success: false, message: 'Jadwal tersimpan, tetapi pembagian jobdesk lama gagal dibersihkan. Muat ulang dan coba lagi: ' + deleteBlocksError.message }
      const blockRows = blocks.flatMap((block) => block.jobdeskIds.map((jobdeskId) => ({
        schedule_id: scheduleId!, jobdesk_id: jobdeskId,
        mulai_menit: block.mulaiMenit, selesai_menit: block.selesaiMenit,
      })))
      if (blockRows.length > 0) {
        const { error: insertBlocksError } = await supabase.from('schedule_jobdesk_block').insert(blockRows)
        if (insertBlocksError) return { success: false, message: 'Jadwal tersimpan, tetapi pembagian jobdesk gagal. Pastikan migrasi database sudah diterapkan: ' + insertBlocksError.message }
      }
    }
  }

  revalidatePath('/manager/jadwal')
  revalidatePath('/dashboard')
  revalidatePath('/jadwal-saya')
  return { success: true }
}
