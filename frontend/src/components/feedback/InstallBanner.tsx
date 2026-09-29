import React, { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const InstallBanner: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Also check if running in standalone mode (already installed)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setDeferredPrompt(null);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  if (!deferredPrompt || isDismissed) {
    return null;
  }

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'calc(var(--bottom-nav-height) + var(--safe-bottom) + 12px)',
        left: '16px',
        right: '16px',
        maxWidth: '480px',
        margin: '0 auto',
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        padding: '12px 16px',
        boxShadow: 'var(--shadow-lg)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--primary-light)',
            color: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Download size={20} />
        </div>
        <div>
          <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>Install OpsFlow App</h4>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
            Faster access &amp; offline ready for mobile and desktop
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Button size="sm" variant="primary" onClick={handleInstallClick}>
          Install
        </Button>
        <button
          onClick={() => setIsDismissed(true)}
          style={{
            color: 'var(--text-muted)',
            padding: '6px',
            borderRadius: 'var(--radius-xs)',
          }}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};
