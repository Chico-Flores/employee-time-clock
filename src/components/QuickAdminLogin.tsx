// src/components/QuickAdminLogin.tsx
// NEW FILE - Create this component for PIN-based admin access
import React, { useState } from 'react';

interface QuickAdminLoginProps {
  onLoginSuccess: () => void;
  onSwitchToRegularLogin: () => void;
}

const QuickAdminLogin: React.FC<QuickAdminLoginProps> = ({ 
  onLoginSuccess, 
  onSwitchToRegularLogin 
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    if (value.length <= 4) {
      setPin(value);
      setError('');
    }
  };

  const handleQuickLogin = async () => {
    if (pin.length !== 4) {
      setError('Please enter a 4-digit PIN');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/quick-admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      if (data.success) {
        onLoginSuccess();
      }
    } catch (err: any) {
      setError(err.message || 'Invalid PIN or not authorized for admin access');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && pin.length === 4) {
      handleQuickLogin();
    }
  };

  return (
    <div style={{ width: '100%' }}>
      <div style={{ 
        textAlign: 'center', 
        marginBottom: '24px'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔑</div>
        <h2 style={{ 
          margin: '0', 
          color: '#1e3a8a', 
          fontSize: '1.5rem',
          fontWeight: '700'
        }}>
          Quick Admin Access
        </h2>
      </div>

      <div>
        <label style={{ 
          display: 'block', 
          marginBottom: '8px', 
          fontWeight: '600', 
          color: '#374151',
          fontSize: '15px'
        }}>
          Enter Your PIN:
        </label>
        <input
          type="text"
          placeholder="4-digit PIN"
          value={pin}
          onChange={handlePinChange}
          onKeyPress={handleKeyPress}
          maxLength={4}
          inputMode="numeric"
          pattern="[0-9]{4}"
          autoFocus
          style={{
            width: '100%',
            padding: '14px 18px',
            border: error ? '2px solid #ef4444' : '2px solid #e5e7eb',
            borderRadius: '12px',
            fontSize: '24px',
            letterSpacing: '0.5em',
            textAlign: 'center',
            fontWeight: '700',
            transition: 'all 0.2s ease',
            marginBottom: '12px'
          }}
          onFocus={(e) => !error && (e.target.style.borderColor = '#2563eb')}
          onBlur={(e) => !error && (e.target.style.borderColor = '#e5e7eb')}
        />
        
        <div style={{ 
          fontSize: '12px', 
          color: '#6b7280',
          textAlign: 'center',
          marginBottom: '16px'
        }}>
          {pin.length}/4 digits
        </div>
      </div>

      {error && (
        <div style={{
          background: '#fef2f2',
          color: '#991b1b',
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '16px',
          fontSize: '14px',
          fontWeight: '600',
          borderLeft: '4px solid #ef4444'
        }}>
          {error}
        </div>
      )}

      <button
        onClick={handleQuickLogin}
        disabled={loading || pin.length !== 4}
        style={{
          width: '100%',
          background: loading || pin.length !== 4
            ? '#9ca3af'
            : 'linear-gradient(135deg, #2563eb, #1e40af)',
          color: 'white',
          border: 'none',
          padding: '16px',
          fontSize: '16px',
          fontWeight: '700',
          borderRadius: '12px',
          cursor: loading || pin.length !== 4 ? 'not-allowed' : 'pointer',
          marginBottom: '16px',
          transition: 'all 0.3s ease',
          boxShadow: loading || pin.length !== 4 
            ? 'none' 
            : '0 4px 12px rgba(37, 99, 235, 0.3)',
          opacity: loading || pin.length !== 4 ? 0.6 : 1
        }}
        onMouseOver={(e) => {
          if (!loading && pin.length === 4) {
            e.currentTarget.style.background = 'linear-gradient(135deg, #1e40af, #1e3a8a)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }
        }}
        onMouseOut={(e) => {
          if (!loading && pin.length === 4) {
            e.currentTarget.style.background = 'linear-gradient(135deg, #2563eb, #1e40af)';
            e.currentTarget.style.transform = 'translateY(0)';
          }
        }}
      >
        {loading ? '⏳ Verifying...' : '🔓 Access Admin Panel'}
      </button>

      <div style={{ textAlign: 'center' }}>
        <button
          onClick={onSwitchToRegularLogin}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#2563eb',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            textDecoration: 'underline',
            padding: '8px'
          }}
          onMouseOver={(e) => e.currentTarget.style.color = '#1e40af'}
          onMouseOut={(e) => e.currentTarget.style.color = '#2563eb'}
        >
          Use Username & Password Instead →
        </button>
      </div>

      <div style={{ 
        marginTop: '24px', 
        padding: '16px', 
        background: '#fef3c7', 
        borderRadius: '12px',
        border: '2px solid #fbbf24'
      }}>
        <h4 style={{ 
          margin: '0 0 8px 0', 
          color: '#92400e', 
          fontSize: '13px',
          fontWeight: '700'
        }}>
          💡 Quick Admin Access
        </h4>
        <p style={{ 
          margin: 0, 
          color: '#92400e', 
          fontSize: '12px',
          lineHeight: '1.6'
        }}>
          Only employees with the "Admin" tag can use this feature. 
          If you don't have admin privileges, please contact your manager.
        </p>
      </div>
    </div>
  );
};

export default QuickAdminLogin;
