import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'success' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  className = '',
  disabled,
  style,
  ...props
}) => {
  const sizeStyles: Record<'sm' | 'md' | 'lg', React.CSSProperties> = {
    sm: { minHeight: '34px', padding: '0 12px', fontSize: '13px' },
    md: { minHeight: '42px', padding: '0 16px', fontSize: '14px' },
    lg: { minHeight: '48px', padding: '0 20px', fontSize: '16px' },
  };

  return (
    <button
      className={`btn btn-${variant} ${className}`}
      disabled={disabled || loading}
      style={{
        ...sizeStyles[size],
        ...style,
      }}
      {...props}
    >
      {loading ? (
        <span className="spinner" aria-hidden="true" />
      ) : icon ? (
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>{icon}</span>
      ) : null}
      <span>{children}</span>
    </button>
  );
};
