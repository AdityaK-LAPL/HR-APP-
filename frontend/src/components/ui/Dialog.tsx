import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'

export interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  /** False while an action is running: Esc / backdrop clicks / the close button do nothing. */
  dismissible?: boolean
}

/**
 * Accessible modal built on the native <dialog>: the browser provides the focus trap, Esc,
 * `inert` background and focus return. Phones get a bottom sheet (see components.css).
 */
export function Dialog({ open, onClose, title, children, footer, dismissible = true }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault() // we control visibility through `open`
        if (dismissible) onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && dismissible) onClose() // backdrop click
      }}
    >
      {open && (
        <>
          <div className="dialog-header">
            <h2 id={titleId} className="dialog-title">
              {title}
            </h2>
            <button
              type="button"
              className="icon-btn"
              onClick={onClose}
              disabled={!dismissible}
              aria-label="Close dialog"
            >
              <X size={18} />
            </button>
          </div>
          <div className="dialog-body">{children}</div>
          {footer && <div className="dialog-footer">{footer}</div>}
        </>
      )}
    </dialog>
  )
}
