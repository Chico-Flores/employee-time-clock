import React, { useCallback, useEffect, useState } from 'react';
import Kiosk from './components/Kiosk';
import AdminPortal from './components/admin/AdminPortal';
import Login from './components/Login';
import CreateAdmin from './components/CreateAdmin';
import './assets/css/styles.css';
import './assets/css/app.css';

type MessageType = 'success' | 'error' | 'warning' | 'info';

const THEME_COLORS: { [theme: string]: string } = { default: '#1e40af', halloween: '#1a0b2e' };
const ADMIN_IDLE_LOGOUT_MS = 30 * 60 * 1000;

// Toasts are appended straight to #message-container so any component can raise one
const showMessage = (text: string, type: MessageType) => {
  const container = document.getElementById('message-container');
  if (!container) return;
  const message = document.createElement('div');
  message.className = `toast toast-${type}`;
  message.setAttribute('role', type === 'error' ? 'alert' : 'status');
  message.textContent = text;
  container.appendChild(message);
  requestAnimationFrame(() => message.classList.add('show'));
  setTimeout(() => {
    message.classList.remove('show');
    setTimeout(() => message.remove(), 400);
  }, type === 'error' ? 5000 : 3800);
};

const App: React.FC = () => {
  const [auth, setAuth] = useState<'checking' | 'in' | 'out'>('checking');
  const [view, setView] = useState<'kiosk' | 'admin'>('kiosk');
  const [theme, setTheme] = useState('default');
  const [showLogin, setShowLogin] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);

  // Session check / first-run setup
  useEffect(() => {
    fetch('/is-logged-in', { credentials: 'include' })
      .then(r => r.json())
      .then(({ isLoggedIn }) => {
        if (isLoggedIn) {
          setAuth('in');
          setView('admin');
          return;
        }
        setAuth('out');
        return fetch('/has-users').then(r => r.json()).then(({ hasUsers }) => setNeedsSetup(!hasUsers));
      })
      .catch(() => setAuth('out'));
  }, []);

  // Holiday theme: set by admins, refreshed periodically so open kiosks pick it up
  const loadTheme = useCallback(() => {
    fetch('/settings')
      .then(r => r.json())
      .then(d => d.theme && setTheme(d.theme))
      .catch(() => { /* keep current theme */ });
  }, []);
  useEffect(() => {
    loadTheme();
    const id = setInterval(loadTheme, 5 * 60 * 1000);
    const onVisible = () => document.visibilityState === 'visible' && loadTheme();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadTheme]);

  const inAdmin = auth === 'in' && view === 'admin';

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.view = inAdmin ? 'admin' : 'kiosk';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', inAdmin ? '#0f172a' : THEME_COLORS[theme] || THEME_COLORS.default);
    document.title = inAdmin ? 'Admin · Time Clock' : 'Employee Time Clock';
  }, [theme, inAdmin]);

  const logout = useCallback(() => {
    fetch('/logout', { method: 'POST', credentials: 'include' }).finally(() => {
      setAuth('out');
      setView('kiosk');
    });
  }, []);

  // Log admins out after 30 minutes without interaction
  useEffect(() => {
    if (auth !== 'in') return;
    let timer = setTimeout(logout, ADMIN_IDLE_LOGOUT_MS);
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(logout, ADMIN_IDLE_LOGOUT_MS);
    };
    const events = ['mousemove', 'keydown', 'click', 'touchstart'];
    events.forEach(e => window.addEventListener(e, reset, { passive: true }));
    return () => {
      clearTimeout(timer);
      events.forEach(e => window.removeEventListener(e, reset));
    };
  }, [auth, logout]);

  const onLoginSuccess = () => {
    setShowLogin(false);
    setNeedsSetup(false);
    setAuth('in');
    setView('admin');
  };

  return (
    <>
      {inAdmin ? (
        <AdminPortal
          theme={theme}
          onThemeChange={setTheme}
          onOpenKiosk={() => setView('kiosk')}
          onLogout={logout}
          showMessage={showMessage}
        />
      ) : (
        <Kiosk
          theme={theme}
          isAdmin={auth === 'in'}
          onOpenAdmin={() => (auth === 'in' ? setView('admin') : setShowLogin(true))}
          showMessage={showMessage}
        />
      )}

      <Login showLogin={showLogin} onLoginSuccess={onLoginSuccess} onCloseOverlay={() => setShowLogin(false)} />
      {needsSetup && auth === 'out' && (
        <CreateAdmin onCreateSuccess={onLoginSuccess} onCloseOverlay={() => setNeedsSetup(false)} />
      )}
      <div id="message-container" aria-live="polite" />
    </>
  );
};

export default App;
