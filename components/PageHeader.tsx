import Link from 'next/link'
import { ReactNode } from 'react'

type Props = {
  title: string
  backHref?: string
  rightSlot?: ReactNode
}

export default function PageHeader({ title, backHref, rightSlot }: Props) {
  return (
    <div className="flex items-center justify-between gap-3 bg-brand px-5 py-5">
      <div className="flex items-center gap-3">
        {backHref && (
          <Link href={backHref} className="text-lg text-white">←</Link>
        )}
        <h1 className="text-lg font-bold text-white">{title}</h1>
      </div>
      {rightSlot}
    </div>
  )
}