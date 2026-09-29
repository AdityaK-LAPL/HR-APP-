import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { AlertCircle } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div
      style={{
        padding: '64px 20px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <AlertCircle size={48} color="var(--warning)" style={{ marginBottom: '16px' }} />
      <h1 style={{ fontSize: '1.75rem', margin: '0 0 8px' }}>Page Not Found</h1>
      <p style={{ margin: '0 0 24px', color: 'var(--text-secondary)', maxWidth: '400px' }}>
        The page you are looking for does not exist or may have been moved.
      </p>
      <Button variant="primary" onClick={() => navigate('/dashboard')}>
        Return to Dashboard
      </Button>
    </div>
  );
};
