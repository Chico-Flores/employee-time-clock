import React, { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const PWAInstaller: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallButton, setShowInstallButton] = useState(false);

  useEffect(() => {
    // Listen for the beforeinstallprompt event
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowInstallButton(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setShowInstallButton(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    // Show the install prompt
    deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    } else {
      console.log('User dismissed the install prompt');
    }

    // Clear the deferredPrompt
    setDeferredPrompt(null);
    setShowInstallButton(false);
  };

  const handleDismiss = () => {
    setShowInstallButton(false);
    // Save dismissal to localStorage so we don't show again for a while
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  };

  // Don't show if dismissed recently (within 7 days)
  useEffect(() => {
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed) {
      const dismissedTime = parseInt(dismissed);
      const daysSinceDismissal = (Date.now() - dismissedTime) / (1000 * 60 * 60 * 24);
      if (daysSinceDismissal < 7) {
        setShowInstallButton(false);
      }
    }
  }, []);

  if (!showInstallButton) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      background: 'linear-gradient(135deg, #10b981, #059669)',
      color: 'white',
      padding: '16px 24px',
      borderRadius: '16px',
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
      zIndex: 1000,
      maxWidth: '350px',
      animation: 'slideIn 0.3s ease'
    }}>
      <button
        onClick={handleDismiss}
        style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          background: 'rgba(255, 255, 255, 0.2)',
          border: 'none',
          color: 'white',
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          cursor: 'pointer',
          fontSize: '16px',
          fontWeight: 'bold',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        ×
      </button>
      
      <div style={{ marginBottom: '12px', fontSize: '18px', fontWeight: '700' }}>
        📱 Install Time Clock App
      </div>
      
      <div style={{ marginBottom: '16px', fontSize: '14px', lineHeight: '1.5', opacity: 0.95 }}>
        Get quick access from your desktop! One-click to clock in/out.
      </div>
      
      <button
        onClick={handleInstallClick}
        style={{
          background: 'white',
          color: '#059669',
          border: 'none',
          padding: '12px 24px',
          borderRadius: '10px',
          fontSize: '15px',
          fontWeight: '700',
          cursor: 'pointer',
          width: '100%',
          transition: 'all 0.2s ease',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.transform = 'scale(1.05)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
        }}
      >
        Install Now
      </button>

      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(400px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};

export default PWAInstaller;
