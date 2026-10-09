import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/feedback/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Lock, UserCheck, Eye, EyeOff, ShieldAlert } from 'lucide-react';
import { ApiError } from '@/services/apiClient';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { error: toastError } = useToast();

  const [employeeCode, setEmployeeCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeCode.trim() || !password) {
      setErrorMessage('Please enter both Employee ID and password.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      await login({
        employee_code: employeeCode.trim(),
        password,
      });
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      let msg = 'Authentication failed. Please verify your credentials.';
      if (err instanceof ApiError) {
        msg = err.message;
      } else if (err?.message) {
        msg = err.message;
      }
      setErrorMessage(msg);
      toastError(msg, 'Login Failed');
    } finally {
      setIsLoading(false);
    }
  };

  const fillDemoAccount = (code: string) => {
    setEmployeeCode(code);
    setPassword('Demo@1234');
    setErrorMessage(null);
  };

  return (
    <div
      className="login-screen"
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--bg-app)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      {/* Background glow effect */}
      <div
        style={{
          position: 'absolute',
          top: '20%',
          width: '320px',
          height: '320px',
          borderRadius: '50%',
          backgroundColor: 'rgba(37, 99, 235, 0.12)',
          filter: 'blur(80px)',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          padding: '32px 28px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <img
            src="/pwa-icon.svg"
            alt="OpsFlow Icon"
            style={{ width: '56px', height: '56px', margin: '0 auto 12px' }}
          />
          <h1 style={{ margin: '0 0 6px', fontSize: '1.45rem', fontWeight: 700 }}>
            Welcome to OpsFlow
          </h1>
          <p style={{ margin: 0, fontSize: '13.5px', color: 'var(--text-secondary)' }}>
            Sign in with your company-issued Employee ID
          </p>
        </div>

        {/* Error Alert Banner */}
        {errorMessage && (
          <div
            style={{
              backgroundColor: 'var(--danger-light)',
              border: '1px solid var(--danger-border)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '20px',
              color: 'var(--text-primary)',
              fontSize: '13px',
            }}
          >
            <ShieldAlert size={18} color="var(--danger)" style={{ flexShrink: 0 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <Input
            label="Employee ID"
            placeholder="e.g. EMP001, MGR001, OWN001"
            value={employeeCode}
            onChange={e => setEmployeeCode(e.target.value)}
            icon={<UserCheck size={18} />}
            required
            autoFocus
          />

          <Input
            label="Password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Enter your account password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            icon={<Lock size={18} />}
            rightAction={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ color: 'var(--text-muted)', padding: '4px' }}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            }
            required
          />

          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={isLoading}
            style={{ marginTop: '8px', width: '100%' }}
          >
            Sign In to Portal
          </Button>
        </form>

        {/* Quick Demo Logins for immediate reviewer access */}
        <div
          style={{
            marginTop: '28px',
            paddingTop: '20px',
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--text-muted)',
              marginBottom: '10px',
              textAlign: 'center',
            }}
          >
            Quick 1-Click Role Login:
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fillDemoAccount('OWN001')}
            >
              👑 Owner
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fillDemoAccount('MGR001')}
            >
              👔 Manager
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fillDemoAccount('EMP001')}
            >
              🔧 Employee
            </Button>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '20px', fontSize: '12px', color: 'var(--text-muted)' }}>
        Progressive Web App • Offline Supported • Single Responsive Codebase
      </div>
    </div>
  );
};
