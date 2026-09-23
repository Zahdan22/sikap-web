export default function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand/20 border-t-brand" />
      {label && <p className="text-sm text-muted">{label}</p>}
    </div>
  )
}