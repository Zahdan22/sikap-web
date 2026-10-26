import Spinner from '@/components/Spinner'

export default function Loading() {
  return <div role="status" className="flex min-h-[60vh] flex-1 items-center justify-center"><Spinner label="Membuka halaman…" /></div>
}
