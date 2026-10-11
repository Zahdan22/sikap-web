'use server'

import { revalidatePath } from 'next/cache'
import { requireManager } from '@/lib/manager-auth'
import { jobdeskPresetError, type JobdeskPreset } from '@/lib/jobdesk-presets'

export async function loadJobdeskPresets() {
  const access = await requireManager()
  if (!access.ok) return { success: false as const, message: access.message }
  const { data, error } = await access.supabase.from('jobdesk_preset')
    .select('id, nama, jobdesk_preset_item(jobdesk_id, urutan)').order('nama')
  if (error) return { success: false as const, message: jobdeskPresetError(error.message) }
  const presets: JobdeskPreset[] = (data || []).map((row) => ({
    id: row.id, nama: row.nama,
    jobdeskIds: [...(row.jobdesk_preset_item || [])].sort((a, b) => a.urutan - b.urutan).map((item) => item.jobdesk_id),
  }))
  return { success: true as const, presets }
}

export async function saveJobdeskPreset(id: number | null, name: string, jobdeskIds: number[]) {
  const access = await requireManager()
  if (!access.ok) return { success: false as const, message: access.message }
  if (id !== null && (!Number.isSafeInteger(id) || id <= 0)) return { success: false as const, message: 'Preset tidak valid.' }
  if (typeof name !== 'string' || !name.trim()) return { success: false as const, message: 'Nama preset wajib diisi.' }
  if (!Array.isArray(jobdeskIds) || jobdeskIds.length < 1 || jobdeskIds.length > 5
    || jobdeskIds.some((value) => !Number.isSafeInteger(value) || value <= 0) || new Set(jobdeskIds).size !== jobdeskIds.length) {
    return { success: false as const, message: 'Pilih 1–5 jobdesk berbeda untuk satu sel jadwal.' }
  }
  const { data, error } = await access.supabase.rpc('save_jobdesk_preset', { p_id: id, p_nama: name.trim(), p_jobdesk_ids: jobdeskIds })
  if (error) return { success: false as const, message: jobdeskPresetError(error.message) }
  revalidatePath('/manager/jadwal')
  return { success: true as const, id: data as number }
}

export async function deleteJobdeskPreset(id: number) {
  const access = await requireManager()
  if (!access.ok) return { success: false as const, message: access.message }
  if (!Number.isSafeInteger(id) || id <= 0) return { success: false as const, message: 'Preset tidak valid.' }
  const { data, error } = await access.supabase.from('jobdesk_preset').delete().eq('id', id).select('id').maybeSingle()
  if (error) return { success: false as const, message: jobdeskPresetError(error.message) }
  if (!data) return { success: false as const, message: 'Preset tidak ditemukan atau tidak dapat dihapus.' }
  revalidatePath('/manager/jadwal')
  return { success: true as const }
}
