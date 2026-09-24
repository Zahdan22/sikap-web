import Link from 'next/link'
import { ReactNode } from 'react'

type Props = {
  title: string
  backHref?: string
  rightSlot?: ReactNode
}

export default function PageHeader({ title, backHref, rightSlot }: Props) {
  return (
    <div className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-brand px-5 py-5">
      <div className="flex items-center gap-3">
        {backHref && (
          <Link href={backHref} className="text-white">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </Link>
        )}
        <h1 className="text-lg font-bold text-white">{title}</h1>
      </div>
      {rightSlot}
    </div>
  )
}