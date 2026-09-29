import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType, title?: string) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((message: string, type: ToastType = 'info', title?: string) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, type, title, message }]);

    setTimeout(() => {
      removeToast(id);
    }, 4000);
  }, [removeToast]);

  const success = useCallback((message: string, title?: string) => addToast(message, 'success', title), [addToast]);
  const error = useCallback((message: string, title?: string) => addToast(message, 'error', title), [addToast]);
  const info = useCallback((message: string, title?: string) => addToast(message, 'info', title), [addToast]);

  return (
    <ToastContext.Provider value={{ toast: addToast, success, error, info }}>
      {children}
      {/* Toast Overlay Container */}
      <div
        style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          maxWidth: '380px',
          width: 'calc(100% - 40px)',
          pointerEvents: 'none',
        }}
      >
        {toasts.map(t => {
          const isSuccess = t.type === 'success';
          const isError = t.type === 'error';
          const borderColor = isSuccess ? 'var(--success)' : isError ? 'var(--danger)' : 'var(--primary)';
          const icon = isSuccess ? (
            <CheckCircle2 size={20} color="var(--success)" />
          ) : isError ? (
            <AlertCircle size={20} color="var(--danger)" />
          ) : (
            <Info size={20} color="var(--primary)" />
          );

          return (
            <div
              key={t.id}
              style={{
                pointerEvents: 'auto',
                backgroundColor: 'var(--bg-surface)',
                border: `1px solid ${borderColor}`,
                borderRadius: 'var(--radius-sm)',
                padding: '12px 16px',
                boxShadow: 'var(--shadow-lg)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                animation: 'slide-in 0.2s ease',
              }}
            >
              <div style={{ flexShrink: 0, marginTop: '2px' }}>{icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {t.title && (
                  <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)', marginBottom: '2px' }}>
                    {t.title}
                  </div>
                )}
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', wordBreak: 'break-word' }}>
                  {t.message}
                </div>
              </div>
              <button
                onClick={() => removeToast(t.id)}
                style={{
                  color: 'var(--text-muted)',
                  padding: '2px',
                  borderRadius: 'var(--radius-xs)',
                  flexShrink: 0,
                }}
              >
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
