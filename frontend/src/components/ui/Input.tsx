import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
  rightAction?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, icon, rightAction, className = '', id, style, ...props }, ref) => {
    const inputId = id || (label ? `input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
        {label && (
          <label
            htmlFor={inputId}
            style={{
              fontSize: '13px',
              fontWeight: 500,
              color: error ? 'var(--danger)' : 'var(--text-secondary)',
            }}
          >
            {label}
          </label>
        )}

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          {icon && (
            <span
              style={{
                position: 'absolute',
                left: '14px',
                color: 'var(--text-muted)',
                display: 'inline-flex',
                alignItems: 'center',
                pointerEvents: 'none',
              }}
            >
              {icon}
            </span>
          )}

          <input
            ref={ref}
            id={inputId}
            className={className}
            style={{
              width: '100%',
              minHeight: '44px',
              paddingLeft: icon ? '42px' : '14px',
              paddingRight: rightAction ? '42px' : '14px',
              backgroundColor: 'var(--bg-input)',
              border: `1px solid ${error ? 'var(--danger)' : 'var(--border-default)'}`,
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              fontSize: '14px',
              outline: 'none',
              transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
              ...style,
            }}
            onFocus={e => {
              e.currentTarget.style.borderColor = error ? 'var(--danger)' : 'var(--border-focus)';
              e.currentTarget.style.boxShadow = error
                ? '0 0 0 2px var(--danger-light)'
                : '0 0 0 2px var(--primary-light)';
              props.onFocus?.(e);
            }}
            onBlur={e => {
              e.currentTarget.style.borderColor = error ? 'var(--danger)' : 'var(--border-default)';
              e.currentTarget.style.boxShadow = 'none';
              props.onBlur?.(e);
            }}
            {...props}
          />

          {rightAction && (
            <span
              style={{
                position: 'absolute',
                right: '12px',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              {rightAction}
            </span>
          )}
        </div>

        {error ? (
          <span style={{ fontSize: '12px', color: 'var(--danger)' }}>{error}</span>
        ) : helperText ? (
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{helperText}</span>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';
