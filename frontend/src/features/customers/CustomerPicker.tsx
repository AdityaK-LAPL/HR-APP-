import { useState } from 'react'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/fields'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { useCustomerSearch } from './queries'

/**
 * Pick a customer from a directory that may be large: type to search by name, then choose from the
 * matches (the 20 best by name). `selectedName` keeps an already-chosen customer selectable even
 * when it is not among the current matches.
 */
export function CustomerPicker({
  value,
  selectedName,
  onChange,
  error,
  disabled = false,
  label = 'Customer',
}: {
  value: string
  selectedName?: string | undefined
  onChange: (id: string, name: string) => void
  error?: string | undefined
  disabled?: boolean
  label?: string
}) {
  const [text, setText] = useState('')
  const search = useDebouncedValue(text.trim())
  const matches = useCustomerSearch(search, !disabled)
  const options = (matches.data?.items ?? []).map((customer) => ({ value: customer.id, label: `${customer.name} · ${customer.customer_code}` }))
  if (value && selectedName && !options.some((option) => option.value === value)) options.unshift({ value, label: selectedName })

  return (
    <div className="stack" style={{ gap: 8 }}>
      {!disabled && (
        <Input
          label={`Find ${label.toLowerCase()}`}
          placeholder="Start typing a name"
          value={text}
          onChange={(event) => setText(event.target.value)}
          hint={matches.data && matches.data.total > matches.data.items.length ? `Showing ${matches.data.items.length} of ${matches.data.total} - type more to narrow it down.` : undefined}
        />
      )}
      <Select
        label={label}
        required
        value={value}
        disabled={disabled}
        placeholder={matches.isPending ? 'Searching…' : options.length ? 'Choose a customer' : 'No customer matches'}
        options={options}
        error={error}
        onChange={(event) => {
          const chosen = options.find((option) => option.value === event.target.value)
          onChange(event.target.value, chosen?.label.split(' · ')[0] ?? '')
        }}
      />
    </div>
  )
}
