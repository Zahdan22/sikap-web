'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

export default function NavigationOverlay() {
  const pathname = usePathname()
  const [isNavigating, setIsNavigating] = useState(false)

  // Begitu halaman baru selesai render (pathname beneran berubah), matiin overlay
  useEffect(() => {
    setIsNavigating(false)
  }, [pathname])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const link = (e.target as HTMLElement)?.closest('a')
      if (!link) return
      const href = link.getAttribute('href')
      if (!href || !href.startsWith('/') || link.target === '_blank') return
      if (href === pathname) return
      setIsNavigating(true)
    }

    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [pathname])

  // Jaga-jaga: kalau lebih dari 6 detik gak kelar (misal navigasi gagal), auto-matiin biar gak nyangkut
  useEffect(() => {
    if (!isNavigating) return
    const timeout = setTimeout(() => setIsNavigating(false), 6000)
    return () => clearTimeout(timeout)
  }, [isNavigating])

  if (!isNavigating) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/20 backdrop-blur-[1px]">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand/20 border-t-brand" />
    </div>
  )
}