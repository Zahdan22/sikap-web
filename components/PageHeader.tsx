import { ReactNode } from 'react'
import BackArrow from '@/components/BackArrow'

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
          <BackArrow href={backHref} />
        )}
        <h1 className="text-lg font-bold text-white">{title}</h1>
      </div>
      {rightSlot}
    </div>
  )
}
