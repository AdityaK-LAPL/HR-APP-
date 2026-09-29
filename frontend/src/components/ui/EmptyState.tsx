import React from 'react';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}) => {
  return (
    <div
      style={{
        padding: '48px 24px',
        textAlign: 'center',
        backgroundColor: 'var(--bg-card)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        maxWidth: '480px',
        margin: '0 auto',
      }}
    >
      {icon && (
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: 'var(--radius-full)',
            backgroundColor: 'rgba(30, 41, 59, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            marginBottom: '16px',
          }}
        >
          {icon}
        </div>
      )}

      <h3 style={{ margin: '0 0 6px', fontSize: '1.1rem', fontWeight: 600 }}>{title}</h3>

      {description && (
        <p style={{ margin: '0 0 20px', fontSize: '14px', color: 'var(--text-muted)' }}>
          {description}
        </p>
      )}

      {actionLabel && onAction && (
        <Button variant="primary" size="md" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
