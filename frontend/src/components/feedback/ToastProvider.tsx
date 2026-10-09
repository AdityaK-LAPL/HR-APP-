import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { ToastContext, type ToastApi, type ToastType } from './toastContext'

interface Toast {
  id: number
  type: ToastType
  title?: string
  message: string
}

const ICONS = { success: CheckCircle2, error: AlertCircle, info: Info }
const LIFETIME_MS = { success: 4000, info: 4000, error: 8000 }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const show = useCallback(
    (message: string, type: ToastType = 'info', title?: string) => {
      const id = nextId.current++
      setToasts((current) => [...current, { id, type, message, ...(title ? { title } : {}) }])
      setTimeout(() => dismiss(id), LIFETIME_MS[type])
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (message, title) => show(message, 'success', title),
      error: (message, title) => show(message, 'error', title),
      info: (message, title) => show(message, 'info', title),
    }),
    [show],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region" aria-live="polite" aria-relevant="additions">
        {toasts.map((toast) => {
          const Icon = ICONS[toast.type]
          return (
            <div
              key={toast.id}
              className={`toast toast-${toast.type}`}
              role={toast.type === 'error' ? 'alert' : 'status'}
            >
              <Icon size={20} aria-hidden="true" />
              <div style={{ flex: 1, minWidth: 0 }}>
                {toast.title && <div className="toast-title">{toast.title}</div>}
                <div className="toast-message">{toast.message}</div>
              </div>
              <button
                type="button"
                className="icon-btn"
                style={{ minWidth: 28, minHeight: 28 }}
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss notification"
              >
                <X size={16} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
