import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  footer?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  action,
  footer,
  children,
  className = '',
  style,
  ...props
}) => {
  return (
    <div
      className={`glass-card ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        ...style,
      }}
      {...props}
    >
      {(title || subtitle || action) && (
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div>
            {title && (
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>{title}</h3>
            )}
            {subtitle && (
              <p style={{ margin: '3px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                {subtitle}
              </p>
            )}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}

      <div style={{ padding: '20px', flex: 1 }}>{children}</div>

      {footer && (
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border-subtle)',
            backgroundColor: 'rgba(11, 17, 32, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );
};
