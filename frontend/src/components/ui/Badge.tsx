import React from 'react';

export interface BadgeProps {
  status: string;
  label?: string;
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({ status, label, size = 'sm' }) => {
  const norm = status.toLowerCase();

  // Color mapping based on backend enum conventions
  let bg = 'rgba(100, 116, 139, 0.15)';
  let text = '#94a3b8';
  let border = 'rgba(100, 116, 139, 0.3)';

  if (['completed', 'approved', 'present', 'resolved', 'active'].includes(norm)) {
    bg = 'var(--success-light)';
    text = 'var(--success)';
    border = 'var(--success-border)';
  } else if (['in_progress', 'planning', 'remote_support', 'field_visit_scheduled', 'field_visit_completed'].includes(norm)) {
    bg = 'var(--primary-light)';
    text = '#60a5fa';
    border = 'var(--primary-border)';
  } else if (['pending', 'partial', 'waiting_customer', 'waiting_parts', 'medium'].includes(norm)) {
    bg = 'var(--warning-light)';
    text = 'var(--warning)';
    border = 'var(--warning-border)';
  } else if (['blocked', 'rejected', 'urgent', 'high', 'absent', 'decommissioned'].includes(norm)) {
    bg = 'var(--danger-light)';
    text = '#f87171';
    border = 'var(--danger-border)';
  } else if (['not_started', 'low', 'cancelled', 'closed', 'inactive', 'on_leave'].includes(norm)) {
    bg = 'rgba(148, 163, 184, 0.12)';
    text = '#94a3b8';
    border = 'rgba(148, 163, 184, 0.25)';
  }

  const formattedText = label || status.replace(/_/g, ' ');

  const styles: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--radius-full)',
    backgroundColor: bg,
    color: text,
    border: `1px solid ${border}`,
    fontWeight: 600,
    textTransform: 'capitalize',
    letterSpacing: '0.02em',
    padding: size === 'sm' ? '2px 10px' : '4px 14px',
    fontSize: size === 'sm' ? '12px' : '13px',
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
  };

  return <span style={styles}>{formattedText}</span>;
};
