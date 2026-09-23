import { ReactNode } from 'react'

type Props = {
  nama: string
  role: string
  children?: ReactNode
}

export default function DashboardHeader({ nama, role, children }: Props) {
  const initial = nama.charAt(0).toUpperCase()

  return (
    <div className="bg-brand px-5 py-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/20 text-lg font-semibold text-white">
            {initial}
          </div>
          <div>
            <p className="text-xs text-white/70">Halo,</p>
            <div className="flex items-center gap-2">
              <p className="text-lg font-bold text-white">{nama}</p>
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-semibold uppercase text-white">
                {role}
              </span>
            </div>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}