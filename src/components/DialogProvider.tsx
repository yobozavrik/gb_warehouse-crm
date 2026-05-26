'use client'

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react'
import { AlertTriangle, Info, XCircle } from 'lucide-react'

type Tone = 'info' | 'error' | 'warning'

type ConfirmOptions = {
  title?: string
  confirmText?: string
  cancelText?: string
  tone?: Tone
}

type AlertOptions = {
  title?: string
  okText?: string
  tone?: Tone
}

type DialogState =
  | { kind: 'confirm'; message: string; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'alert'; message: string; opts: AlertOptions; resolve: () => void }
  | null

type DialogApi = {
  confirm: (message: string, opts?: ConfirmOptions) => Promise<boolean>
  alert: (message: string, opts?: AlertOptions) => Promise<void>
}

const DialogCtx = createContext<DialogApi | null>(null)

export function useDialog(): DialogApi {
  const ctx = useContext(DialogCtx)
  if (!ctx) throw new Error('useDialog must be used inside <DialogProvider>')
  return ctx
}

const TONE_ACCENT: Record<Tone, { ring: string; btn: string; icon: ReactNode }> = {
  info: {
    ring: 'border-blue-200',
    btn: 'bg-blue-600 hover:bg-blue-700',
    icon: <Info className="w-5 h-5 text-blue-600" />,
  },
  warning: {
    ring: 'border-amber-200',
    btn: 'bg-amber-600 hover:bg-amber-700',
    icon: <AlertTriangle className="w-5 h-5 text-amber-600" />,
  },
  error: {
    ring: 'border-red-200',
    btn: 'bg-red-600 hover:bg-red-700',
    icon: <XCircle className="w-5 h-5 text-red-600" />,
  },
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState>(null)

  const confirm = useCallback<DialogApi['confirm']>((message, opts = {}) => {
    return new Promise<boolean>(resolve => {
      setDialog({ kind: 'confirm', message, opts, resolve })
    })
  }, [])

  const alert = useCallback<DialogApi['alert']>((message, opts = {}) => {
    return new Promise<void>(resolve => {
      setDialog({ kind: 'alert', message, opts, resolve })
    })
  }, [])

  const close = useCallback((result?: boolean) => {
    if (!dialog) return
    if (dialog.kind === 'confirm') dialog.resolve(result === true)
    else dialog.resolve()
    setDialog(null)
  }, [dialog])

  useEffect(() => {
    if (!dialog) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false)
      else if (e.key === 'Enter') close(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialog, close])

  const tone: Tone = dialog?.opts.tone || (dialog?.kind === 'confirm' ? 'warning' : 'info')
  const accent = TONE_ACCENT[tone]
  const isConfirm = dialog?.kind === 'confirm'
  const title = dialog?.opts.title || (isConfirm ? 'Підтвердження' : 'Повідомлення')

  return (
    <DialogCtx.Provider value={{ confirm, alert }}>
      {children}
      {dialog && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dialog-title"
          onClick={() => close(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className={`w-full max-w-md bg-white rounded-2xl border ${accent.ring} shadow-xl overflow-hidden`}
          >
            <div className="flex items-start gap-3 p-5">
              <div className="shrink-0 mt-0.5">{accent.icon}</div>
              <div className="flex-1 min-w-0">
                <h2 id="dialog-title" className="font-semibold text-gray-900 text-base">
                  {title}
                </h2>
                <p className="text-sm text-gray-700 mt-1 whitespace-pre-line break-words">
                  {dialog.message}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 bg-gray-50 border-t border-gray-100">
              {isConfirm && (
                <button
                  type="button"
                  onClick={() => close(false)}
                  className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  {dialog.opts.cancelText || 'Скасувати'}
                </button>
              )}
              <button
                type="button"
                autoFocus
                onClick={() => close(true)}
                className={`px-3 py-1.5 text-sm text-white rounded-lg ${accent.btn}`}
              >
                {isConfirm
                  ? (dialog.opts.confirmText || 'Підтвердити')
                  : (dialog.opts.okText || 'OK')}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogCtx.Provider>
  )
}
