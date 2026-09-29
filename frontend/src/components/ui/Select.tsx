import React from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: SelectOption[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, className = '', id, style, ...props }, ref) => {
    const selectId = id || (label ? `select-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
        {label && (
          <label
            htmlFor={selectId}
            style={{
              fontSize: '13px',
              fontWeight: 500,
              color: error ? 'var(--danger)' : 'var(--text-secondary)',
            }}
          >
            {label}
          </label>
        )}

        <select
          ref={ref}
          id={selectId}
          className={className}
          style={{
            width: '100%',
            minHeight: '44px',
            padding: '0 14px',
            backgroundColor: 'var(--bg-input)',
            border: `1px solid ${error ? 'var(--danger)' : 'var(--border-default)'}`,
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-primary)',
            fontSize: '14px',
            outline: 'none',
            cursor: 'pointer',
            ...style,
          }}
          {...props}
        >
          {options.map(opt => (
            <option key={opt.value} value={opt.value} style={{ backgroundColor: '#0f172a' }}>
              {opt.label}
            </option>
          ))}
        </select>

        {error && <span style={{ fontSize: '12px', color: 'var(--danger)' }}>{error}</span>}
      </div>
    );
  }
);

Select.displayName = 'Select';
