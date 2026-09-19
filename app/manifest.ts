import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SIKAP - Solusi Absensi Karyawan Digital',
    short_name: 'SIKAP',
    description: 'Aplikasi absensi karyawan Tjap Djajakarta',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#7A1F2B',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}