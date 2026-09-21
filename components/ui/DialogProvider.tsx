'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

type Toast = { id: number; message: string; type: 'success' | 'error' | 'info' }

type ConfirmOptions = {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

type PromptOptions = {
  title: string
  description?: string
}

type DialogContextType = {
  toast: (message: string, type?: Toast['type']) => void
  confirm: (options: ConfirmOptions) => Promise<boolean>
  promptPassword: (options: PromptOptions) => Promise<string | null>
}

const DialogContext = createContext<DialogContextType | null>(null)

export function useDialog() {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error('useDialog harus dipakai di dalam DialogProvider')
  return ctx
}

export default function DialogProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [confirmState, setConfirmState] = useState<{
    options: ConfirmOptions
    resolve: (value: boolean) => void
  } | null>(null)
  const [promptState, setPromptState] = useState<{
    options: PromptOptions
    resolve: (value: string | null) => void
  } | null>(null)
  const [promptValue, setPromptValue] = useState('')

  const toast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500)
  }, [])

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ options, resolve })
    })
  }, [])

  const promptPassword = useCallback((options: PromptOptions) => {
    setPromptValue('')
    return new Promise<string | null>((resolve) => {
      setPromptState({ options, resolve })
    })
  }, [])

  function handleConfirmClose(result: boolean) {
    confirmState?.resolve(result)
    setConfirmState(null)
  }

  function handlePromptClose(result: string | null) {
    promptState?.resolve(result)
    setPromptState(null)
  }

  const toastStyle: Record<Toast['type'], string> = {
    success: 'bg-success text-white',
    error: 'bg-brand text-white',
    info: 'bg-ink text-cream',
  }

  return (
    <DialogContext.Provider value={{ toast, confirm, promptPassword }}>
      {children}

      {/* Toast stack */}
      <div className="fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-5">
        {toasts.map((t) => (
          <div key={t.id} className={`w-full max-w-sm rounded-xl px-4 py-3 text-sm shadow-md ${toastStyle[t.type]}`}>
            {t.message}
          </div>
        ))}
      </div>

      {/* Confirm dialog */}
      {confirmState && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/30 px-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-cream-card p-5">
            <p className="text-sm font-semibold text-ink">{confirmState.options.title}</p>
            {confirmState.options.description && (
              <p className="mt-2 text-xs text-muted">{confirmState.options.description}</p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => handleConfirmClose(false)}
                className="flex-1 rounded-xl border border-cream-dim py-2.5 text-sm font-semibold text-ink"
              >
                {confirmState.options.cancelLabel || 'Batal'}
              </button>
              <button
                onClick={() => handleConfirmClose(true)}
                className={`flex-1 rounded-xl py-2.5 text-sm font-semibold text-white ${
                  confirmState.options.danger ? 'bg-brand' : 'bg-success'
                }`}
              >
                {confirmState.options.confirmLabel || 'Ya'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password prompt dialog */}
      {promptState && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/30 px-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-cream-card p-5">
            <p className="text-sm font-semibold text-ink">{promptState.options.title}</p>
            {promptState.options.description && (
              <p className="mt-2 text-xs text-muted">{promptState.options.description}</p>
            )}
            <input
              type="password"
              autoFocus
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handlePromptClose(promptValue) }}
              className="mt-3 w-full rounded-xl border border-cream-dim bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-brand"
              placeholder="Password"
            />
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => handlePromptClose(null)}
                className="flex-1 rounded-xl border border-cream-dim py-2.5 text-sm font-semibold text-ink"
              >
                Batal
              </button>
              <button
                onClick={() => handlePromptClose(promptValue)}
                className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-semibold text-white"
              >
                Konfirmasi
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  )
}