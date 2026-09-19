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

  const { error } = await supabase
    .from('leave_request')
    .update({ status, approved_by: user.id, catatan_manajer: catatanManajer })
    .eq('id', id)

  if (error) return { success: false, message: error.message }
  revalidatePath('/manager/izin')
  return { success: true }
}