import { Eye, EyeOff } from 'lucide-react'
import { forwardRef, useState } from 'react'
import { Input, type InputProps } from './Input'

/** Password field with an accessible show/hide toggle. */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputProps, 'type' | 'action'>>(
  function PasswordInput(props, ref) {
    const [visible, setVisible] = useState(false)
    return (
      <Input
        ref={ref}
        {...props}
        type={visible ? 'text' : 'password'}
        action={
          <button
            type="button"
            className="icon-btn"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-pressed={visible}
          >
            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        }
      />
    )
  },
)
