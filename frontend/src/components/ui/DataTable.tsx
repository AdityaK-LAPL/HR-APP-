import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  width?: string;
  hideOnMobile?: boolean;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (newPage: number) => void;
  isLoading?: boolean;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  page = 1,
  pageSize = 20,
  total = 0,
  onPageChange,
  isLoading = false,
  emptyMessage = 'No records found',
  onRowClick,
}: DataTableProps<T>) {
  const totalPages = Math.ceil(total / pageSize) || 1;

  if (isLoading) {
    return (
      <div
        style={{
          padding: '48px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          color: 'var(--text-muted)',
        }}
      >
        <span className="spinner" style={{ width: '28px', height: '28px' }} />
        <span style={{ fontSize: '14px' }}>Loading data...</span>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div
        style={{
          padding: '48px 24px',
          textAlign: 'center',
          color: 'var(--text-muted)',
          backgroundColor: 'var(--bg-card)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <p style={{ margin: 0, fontSize: '14px' }}>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div
      style={{
        backgroundColor: 'var(--bg-card)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)',
        overflow: 'hidden',
      }}
    >
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr
              style={{
                borderBottom: '1px solid var(--border-subtle)',
                backgroundColor: 'rgba(15, 23, 42, 0.6)',
              }}
            >
              {columns.map(col => (
                <th
                  key={col.key}
                  style={{
                    padding: '12px 16px',
                    fontSize: '12px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--text-muted)',
                    width: col.width,
                  }}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((item, idx) => (
              <tr
                key={keyExtractor(item)}
                onClick={() => onRowClick?.(item)}
                style={{
                  borderBottom: idx === data.length - 1 ? 'none' : '1px solid var(--border-subtle)',
                  cursor: onRowClick ? 'pointer' : 'default',
                  transition: 'background-color 0.15s ease',
                }}
                onMouseEnter={e => {
                  if (onRowClick) e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)';
                }}
                onMouseLeave={e => {
                  if (onRowClick) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                {columns.map(col => (
                  <td
                    key={col.key}
                    style={{
                      padding: '14px 16px',
                      fontSize: '14px',
                      color: 'var(--text-primary)',
                      verticalAlign: 'middle',
                    }}
                  >
                    {col.render ? col.render(item) : (item as any)[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > pageSize && (
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border-subtle)',
            backgroundColor: 'rgba(11, 17, 32, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            Showing {Math.min((page - 1) * pageSize + 1, total)} to {Math.min(page * pageSize, total)} of {total} entries
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => onPageChange?.(page - 1)}
              icon={<ChevronLeft size={16} />}
            >
              Prev
            </Button>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', padding: '0 4px' }}>
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => onPageChange?.(page + 1)}
              icon={<ChevronRight size={16} />}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
