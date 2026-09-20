'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

export default function SplashScreen() {
  const [visible, setVisible] = useState(true)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const alreadyShown = sessionStorage.getItem('sikap-splash-shown')
    if (alreadyShown) {
      setVisible(false)
      return
    }

    const fadeTimer = setTimeout(() => setFading(true), 900)
    const hideTimer = setTimeout(() => {
      setVisible(false)
      sessionStorage.setItem('sikap-splash-shown', '1')
    }, 1300)

    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(hideTimer)
    }
  }, [])

  if (!visible) return null

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-cream transition-opacity duration-400 ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="flex flex-col items-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-cream-card shadow-sm">
          <Image src="/icons/icon-192.png" alt="SIKAP" width={64} height={64} />
        </div>
        <h1 className="mt-4 text-2xl font-semibold text-ink">SIKAP</h1>
        <p className="text-sm text-muted">Apps</p>

        <div className="mt-6 h-px w-40 bg-cream-dim" />
        <p className="mt-2 text-xs text-muted">Solusi Absensi Karyawan Digital</p>
      </div>

      <p className="absolute bottom-8 text-[10px] tracking-wide text-muted/60">
        DOKUMEN RESMI © 2026
      </p>
    </div>
  )
}