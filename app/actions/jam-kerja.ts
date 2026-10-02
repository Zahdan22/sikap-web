'use server'

import { requireManager } from '@/lib/manager-auth'
import { revalidatePath } from 'next/cache'

export async function createPreset(nama: string) {
  const access = await requireManager()
  if (!access.ok) return { success: false, message: access.message }
  const { supabase, userId } = access

  const { data, error } = await supabase
    .from('jam_kerja_preset')
    .insert({ nama, dibuat_oleh: userId })
    .select('id')
    .single()

  if (error || !data) return { success: false, message: error?.message }
  revalidatePath('/manager/jadwal')
  return { success: true, id: data.id }
}

export async function deletePreset(id: number) {
  const access = await requireManager()
  if (!access.ok) return { success: false, message: access.message }
  const { supabase } = access
  const { error } = await supabase.from('jam_kerja_preset').delete().eq('id', id)
  if (error) return { success: false, message: error.message }
  revalidatePath('/manager/jadwal')
  return { success: true }
}

export async function createJamKerja(presetId: number, label: string, jamMulai: string, jamSelesai: string, durasiJam: number) {
  const access = await requireManager()
  if (!access.ok) return { success: false, message: access.message }
  const { supabase, userId } = access

  const { error } = await supabase.from('jam_kerja_opsi').insert({
    preset_id: presetId,
    label,
    jam_mulai: jamMulai,
    jam_selesai: jamSelesai,
    durasi_jam: durasiJam,
    dibuat_oleh: userId,
  })

  if (error) return { success: false, message: error.message }
  revalidatePath('/manager/jadwal')
  return { success: true }
}

export async function updateJamKerja(id: number, label: string, jamMulai: string, jamSelesai: string, durasiJam: number) {
  const access = await requireManager()
  if (!access.ok) return { success: false, message: access.message }
  const { supabase } = access
  const { error } = await supabase
    .from('jam_kerja_opsi')
    .update({ label, jam_mulai: jamMulai, jam_selesai: jamSelesai, durasi_jam: durasiJam })
    .eq('id', id)

  if (error) return { success: false, message: error.message }
  revalidatePath('/manager/jadwal')
  return { success: true }
}

export async function deleteJamKerja(id: number) {
  const access = await requireManager()
  if (!access.ok) return { success: false, message: access.message }
  const { supabase } = access
  const { error } = await supabase.from('jam_kerja_opsi').delete().eq('id', id)
  if (error) return { success: false, message: error.message }
  revalidatePath('/manager/jadwal')
  return { success: true }
}
