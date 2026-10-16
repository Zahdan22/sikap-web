'use client'

import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'

export default function CorrectionEvidenceInput() {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const previewRef = useRef<string | null>(null)
  const [selected, setSelected] = useState<{ name: string; preview: string } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
  }, [])

  function clearSelection() {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    previewRef.current = null
    if (inputRef.current) {
      inputRef.current.value = ''
      inputRef.current.setCustomValidity('')
    }
    setSelected(null)
    setError('')
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    if (!file) {
      clearSelection()
      return
    }
    const message = !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
      ? 'Pilih gambar JPG, PNG, atau WebP.'
      : file.size > 3_000_000 ? 'Ukuran bukti maksimal 3 MB.' : ''
    if (message) {
      clearSelection()
      setError(message)
      return
    }
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    const preview = URL.createObjectURL(file)
    previewRef.current = preview
    event.currentTarget.setCustomValidity('')
    setSelected({ name: file.name, preview })
    setError('')
  }

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm text-muted">Bukti kendala (wajib)</label>
      <div className="relative rounded-xl border border-cream-dim bg-white p-4 focus-within:ring-2 focus-within:ring-brand focus-within:ring-offset-2">
        <input
          ref={inputRef}
          id={id}
          name="evidence"
          type="file"
          required
          accept="image/jpeg,image/png,image/webp"
          className="peer sr-only"
          aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`}
          aria-invalid={error ? true : undefined}
          onChange={chooseFile}
          onInvalid={event => {
            event.currentTarget.setCustomValidity('Pilih bukti kendala terlebih dahulu.')
            setError('Pilih bukti kendala terlebih dahulu.')
          }}
        />
        {selected ? (
          <div className="space-y-3">
            <div className="flex min-w-0 items-center gap-3">
              {/* The preview is a temporary local blob, not a remote image. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={selected.preview} alt="Pratinjau bukti kendala" className="h-20 w-20 shrink-0 rounded-lg border border-cream-dim object-contain" />
              <p className="min-w-0 break-all text-sm text-ink" aria-live="polite">{selected.name}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => inputRef.current?.click()} className="rounded-lg border border-cream-dim px-4 py-2 text-sm font-semibold text-brand disabled:opacity-50">Ganti</button>
              <button type="button" onClick={clearSelection} className="rounded-lg bg-brand/10 px-4 py-2 text-sm font-semibold text-brand disabled:opacity-50">Hapus</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => inputRef.current?.click()} className="flex w-full items-center justify-center gap-3 rounded-lg border border-dashed border-brand/40 bg-brand/5 px-4 py-5 text-sm font-semibold text-brand disabled:opacity-50">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 shrink-0">
              <path d="M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" />
            </svg>
            Pilih bukti
          </button>
        )}
      </div>
      <p id={`${id}-help`} className="text-xs text-muted">JPG, PNG, atau WebP. Maksimal 3 MB.</p>
      {error && <p id={`${id}-error`} role="alert" className="text-sm text-brand">{error}</p>}
    </div>
  )
}
