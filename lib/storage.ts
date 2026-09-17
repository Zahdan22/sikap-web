import { createClient } from '@/lib/supabase/client'

// Convert dataURL (hasil canvas) jadi Blob, biar bisa di-upload
function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64Data] = dataUrl.split(',')
  const mimeMatch = header.match(/:(.*?);/)
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg'

  const binary = atob(base64Data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  return new Blob([bytes], { type: mime })
}

export async function uploadAttendancePhoto(
  userId: string,
  watermarkedDataUrl: string,
  type: 'masuk' | 'pulang'
): Promise<string> {
  const supabase = createClient()
  const blob = dataUrlToBlob(watermarkedDataUrl)

  // Path HARUS diawali {user_id}/ - sesuai RLS policy Storage yang sudah kita buat
  const fileName = `${userId}/${Date.now()}-${type}.jpg`

  const { error } = await supabase.storage
    .from('attendance-photos')
    .upload(fileName, blob, {
      contentType: 'image/jpeg',
      upsert: false,
    })

  if (error) {
    throw new Error('Gagal upload foto: ' + error.message)
  }

  // Simpan cuma PATH-nya di database (bukan URL lengkap), karena bucket private
  // dan URL yang bisa diakses harus di-generate ulang tiap kali mau ditampilkan (signed URL)
  return fileName
}

export async function getPhotoSignedUrl(path: string): Promise<string> {
  const supabase = createClient()
  const { data, error } = await supabase.storage
    .from('attendance-photos')
    .createSignedUrl(path, 60 * 60) // valid 1 jam

  if (error || !data) {
    throw new Error('Gagal ambil URL foto: ' + error?.message)
  }

  return data.signedUrl
}