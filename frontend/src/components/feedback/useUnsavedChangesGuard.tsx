import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { useBlocker } from 'react-router-dom'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

/**
 * Protects a page-level form from being abandoned by accident: in-app navigation away from the
 * page asks first (confirm dialog), and closing/reloading the tab triggers the browser's own
 * prompt. Call `allowLeave()` right before navigating on purpose (e.g. after a successful submit).
 *
 * Render `dialog` anywhere in the page.
 */
export function useUnsavedChangesGuard(dirty: boolean): { dialog: ReactNode; allowLeave: () => void } {
  const allowed = useRef(false)
  const allowLeave = useCallback(() => {
    allowed.current = true
  }, [])

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !allowed.current && currentLocation.pathname !== nextLocation.pathname,
  )

  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (allowed.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const dialog = (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      title="Leave without saving?"
      message="You have entered information that has not been submitted. If you leave now it will be lost."
      confirmLabel="Leave page"
      cancelLabel="Keep editing"
      tone="danger"
      onConfirm={() => blocker.state === 'blocked' && blocker.proceed()}
      onCancel={() => blocker.state === 'blocked' && blocker.reset()}
    />
  )
  return { dialog, allowLeave }
}
