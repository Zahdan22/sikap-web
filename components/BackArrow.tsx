import Link from 'next/link'

export default function BackArrow({ href }: { href: string }) {
  return (
    <Link href={href} className="text-brand">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
    </Link>
  )
}