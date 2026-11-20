'use server'

import { createClient as createUnauthenticatedClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

type OutletAccess = {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
  outletId: string
  role: 'manager' | 'finance'
}

type OutletUpdate = {
  nama: string
  alamat: string
  latitude: number
  longitude: number
  password: string
}

function validCoordinate(latitude: number, longitude: number) {
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
}

async function requireOutletManager(): Promise<OutletAccess | { error: string }> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { error: 'Sesi login tidak valid. Silakan masuk kembali.' }

  const { data: profile, error: profileError } = await supabase
    .from('users').select('role, status_aktif, outlet_id').eq('id', user.id).single()
  if (profileError || !profile?.status_aktif || !profile.outlet_id || !['manager', 'finance'].includes(profile.role)) {
    return { error: 'Akses pengaturan outlet hanya tersedia untuk Admin 1 atau Admin 2 yang aktif.' }
  }
  return { supabase, userId: user.id, outletId: profile.outlet_id, role: profile.role as OutletAccess['role'] }
}

export async function loadOutletInfo() {
  const access = await requireOutletManager()
  if ('error' in access) return { success: false as const, message: access.error }
  const { data, error } = await access.supabase
    .from('outlets')
    .select('id,nama,alamat,latitude,longitude,radius_meter')
    .eq('id', access.outletId)
    .maybeSingle()
  if (error || !data) return { success: false as const, message: 'Informasi outlet belum dapat dimuat.' }
  return {
    success: true as const,
    outlet: {
      id: data.id,
      nama: data.nama,
      alamat: data.alamat || '',
      latitude: data.latitude === null ? null : Number(data.latitude),
      longitude: data.longitude === null ? null : Number(data.longitude),
      radiusMeter: Number(data.radius_meter),
    },
  }
}

export async function updateOutletInfo(input: OutletUpdate) {
  const access = await requireOutletManager()
  if ('error' in access) return { success: false as const, message: access.error }
  const nama = typeof input?.nama === 'string' ? input.nama.trim() : ''
  const alamat = typeof input?.alamat === 'string' ? input.alamat.trim() : ''
  const password = typeof input?.password === 'string' ? input.password : ''
  if (nama.length < 2 || nama.length > 100) return { success: false as const, message: 'Nama outlet harus terdiri dari 2–100 karakter.' }
  if (alamat.length > 500) return { success: false as const, message: 'Keterangan alamat maksimal 500 karakter.' }
  if (!validCoordinate(input?.latitude, input?.longitude)) return { success: false as const, message: 'Titik GPS tidak valid.' }
  if (!password) return { success: false as const, message: 'Masukkan password untuk mengubah titik lokasi outlet.' }

  // Verify with a sessionless client so password confirmation does not replace
  // the currently logged-in browser session.
  const { data: authUser, error: authUserError } = await supabaseAdmin.auth.admin.getUserById(access.userId)
  if (authUserError || !authUser.user?.email) return { success: false as const, message: 'Akun belum dapat diverifikasi. Silakan masuk kembali.' }
  const verifier = createUnauthenticatedClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } },
  )
  const { error: verificationError } = await verifier.auth.signInWithPassword({ email: authUser.user.email, password })
  if (verificationError) return { success: false as const, message: 'Password salah. Perubahan lokasi dibatalkan.' }

  const { error } = await access.supabase
    .from('outlets')
    .update({ nama, alamat: alamat || null, latitude: input.latitude, longitude: input.longitude, radius_meter: 50, is_active: true, setup_complete: true, updated_at: new Date().toISOString() })
    .eq('id', access.outletId)
  if (error) return { success: false as const, message: 'Informasi outlet belum dapat disimpan. Coba lagi beberapa saat.' }

  for (const path of ['/dashboard', '/checkin', '/finance', '/finance/pengaturan', '/manager', '/outlet']) revalidatePath(path)
  return { success: true as const }
}
