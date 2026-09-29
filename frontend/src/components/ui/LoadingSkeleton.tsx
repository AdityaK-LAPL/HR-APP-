import React from 'react';

export interface SkeletonProps {
  height?: string | number;
  width?: string | number;
  borderRadius?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  height = '20px',
  width = '100%',
  borderRadius = 'var(--radius-sm)',
  className = '',
  style,
}) => {
  return (
    <div
      className={className}
      style={{
        height,
        width,
        borderRadius,
        backgroundColor: 'rgba(30, 41, 59, 0.6)',
        animation: 'skeleton-pulse 1.5s ease-in-out 0.5s infinite',
        ...style,
      }}
    />
  );
};

export const CardSkeleton: React.FC = () => {
  return (
    <div
      style={{
        padding: '20px',
        backgroundColor: 'var(--bg-card)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      <Skeleton height="24px" width="60%" />
      <Skeleton height="16px" width="90%" />
      <Skeleton height="16px" width="75%" />
      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
        <Skeleton height="28px" width="80px" borderRadius="var(--radius-full)" />
        <Skeleton height="28px" width="100px" borderRadius="var(--radius-full)" />
      </div>
    </div>
  );
};
