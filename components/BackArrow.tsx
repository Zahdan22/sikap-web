import Link from 'next/link'

export default function BackArrow({ href }: { href: string }) {
  return (
    <Link href={href} className="inline-flex shrink-0 items-center justify-center text-white" aria-label="Kembali">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
    </Link>
  )
}
