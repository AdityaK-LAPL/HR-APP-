import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { OfflineBanner } from '@/components/feedback/OfflineBanner'
import { ToastProvider } from '@/components/feedback/ToastProvider'
import { useToast } from '@/components/feedback/toastContext'
import { ConfirmDialog } from './ConfirmDialog'
import { Dialog } from './Dialog'
import { Input } from './Input'
import { PasswordInput } from './PasswordInput'

describe('Input', () => {
  it('links the label, the error and the invalid state for assistive tech', () => {
    render(<Input label="Employee ID" required error="Enter your Employee ID." />)
    const input = screen.getByLabelText(/employee id/i)
    expect(input).toBeRequired()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Enter your Employee ID.')
  })

  it('uses the hint as the description when there is no error', () => {
    render(<Input label="New password" hint="At least 8 characters." />)
    const input = screen.getByLabelText('New password')
    expect(input).not.toHaveAttribute('aria-invalid')
    expect(input).toHaveAccessibleDescription('At least 8 characters.')
  })
})

describe('PasswordInput', () => {
  it('toggles visibility with an accessible button', async () => {
    render(<PasswordInput label="Password" />)
    const input = screen.getByLabelText('Password')
    expect(input).toHaveAttribute('type', 'password')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show password' }))
    expect(input).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('Dialog', () => {
  it('is labelled by its title, closes with the close button, and renders nothing when closed', async () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <Dialog open={false} onClose={onClose} title="Rename">
        body
      </Dialog>,
    )
    expect(screen.queryByText('body')).not.toBeInTheDocument()

    rerender(
      <Dialog open onClose={onClose} title="Rename">
        body
      </Dialog>,
    )
    expect(screen.getByRole('dialog', { name: 'Rename' })).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Close dialog' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('cannot be dismissed while an action is running', async () => {
    const onClose = vi.fn()
    render(
      <Dialog open onClose={onClose} title="Saving" dismissible={false}>
        working
      </Dialog>,
    )
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeDisabled()
  })
})

describe('ConfirmDialog', () => {
  it('names the action and reports confirm / cancel', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
      <ConfirmDialog
        open
        tone="danger"
        title="Deactivate user"
        message="Erin will no longer be able to sign in."
        confirmLabel="Deactivate"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )
    const user = userEvent.setup()
    expect(screen.getByText('Erin will no longer be able to sign in.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Deactivate' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('disables both buttons while busy so an action cannot be submitted twice', () => {
    render(
      <ConfirmDialog open busy title="Archive" message="m" confirmLabel="Archive" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Archive/ })).toBeDisabled()
  })
})

describe('OfflineBanner', () => {
  it('appears when the browser goes offline and disappears when it returns', () => {
    render(<OfflineBanner />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(screen.getByRole('status')).toHaveTextContent(/offline/i)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('Toast', () => {
  function Trigger() {
    const toast = useToast()
    return (
      <>
        <button onClick={() => toast.success('Saved.')}>ok</button>
        <button onClick={() => toast.error('Could not save.', 'Failed')}>bad</button>
      </>
    )
  }

  it('announces successes politely and errors as alerts, and can be dismissed', async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    )
    const user = userEvent.setup()
    await user.click(screen.getByText('ok'))
    expect(screen.getByRole('status')).toHaveTextContent('Saved.')
    await user.click(screen.getByText('bad'))
    expect(screen.getByRole('alert')).toHaveTextContent('Failed')
    await user.click(screen.getAllByRole('button', { name: 'Dismiss notification' })[1]!)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
