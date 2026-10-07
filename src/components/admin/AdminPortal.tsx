import React, { useEffect, useState } from 'react';
import Icon from './Icon';
import TodayView from './TodayView';
import AgentsView from './AgentsView';
import TimesheetsView from './TimesheetsView';
import ReportsView from './ReportsView';
import SettingsView from './SettingsView';
import { ShowMessage } from './ui';

type Page = 'today' | 'agents' | 'timesheets' | 'reports' | 'settings';

const NAV: { key: Page; label: string; icon: string; title: string; subtitle: string }[] = [
  { key: 'today', label: 'Today', icon: 'today', title: 'Today', subtitle: 'Live status of every active agent' },
  { key: 'agents', label: 'Agents', icon: 'users', title: 'Agents', subtitle: 'Roster, PINs, tags and access' },
  { key: 'timesheets', label: 'Timesheets', icon: 'calendar', title: 'Timesheets', subtitle: 'Day-by-day punches and timelines' },
  { key: 'reports', label: 'Reports', icon: 'chart', title: 'Reports', subtitle: 'Hours for payroll, lateness and absences' },
  { key: 'settings', label: 'Settings', icon: 'settings', title: 'Settings', subtitle: 'Holiday theme, auto clock-out and admins' }
];

interface AdminPortalProps {
  theme: string;
  onThemeChange: (theme: string) => void;
  onOpenKiosk: () => void;
  onLogout: () => void;
  showMessage: ShowMessage;
}

const usePstClock = () => {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, []);
  return now.toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles', weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  });
};

const AdminPortal: React.FC<AdminPortalProps> = ({ theme, onThemeChange, onOpenKiosk, onLogout, showMessage }) => {
  const [page, setPage] = useState<Page>(() => {
    try {
      const saved = localStorage.getItem('adminPage') as Page;
      return NAV.some(n => n.key === saved) ? saved : 'today';
    } catch { return 'today'; }
  });
  const [addRequested, setAddRequested] = useState(0);
  const clock = usePstClock();
  const current = NAV.find(n => n.key === page)!;

  useEffect(() => {
    try { localStorage.setItem('adminPage', page); } catch { /* ignore */ }
    window.scrollTo(0, 0);
  }, [page]);

  const addAgent = () => {
    setPage('agents');
    setAddRequested(n => n + 1);
  };

  return (
    <div className="admin">
      <aside className="admin-side">
        <div className="admin-brand">
          <span className="admin-brand-mark" aria-hidden="true">{theme === 'halloween' ? '🎃' : '⚡'}</span>
          <div>
            <div className="admin-brand-title">PowerHouze Clock</div>
            <div className="admin-brand-sub">Admin portal</div>
          </div>
        </div>
        <nav className="admin-nav">
          {NAV.map(n => (
            <button key={n.key} className={`admin-nav-item ${page === n.key ? 'active' : ''}`} onClick={() => { setPage(n.key); setAddRequested(0); }}>
              <Icon name={n.icon} />
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="admin-side-foot">
          <button className="admin-nav-item" onClick={onOpenKiosk}><Icon name="monitor" /><span>Clock-in screen</span></button>
          <button className="admin-nav-item" onClick={onLogout}><Icon name="logout" /><span>Log out</span></button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-top">
          <div>
            <h1>{current.title}</h1>
            <p className="muted">{current.subtitle}</p>
          </div>
          <div className="admin-top-right">
            <span className="live-clock"><span className="live-dot" />{clock} PT</span>
            <button className="btn btn-primary" onClick={addAgent}><Icon name="plus" size={16} /> Add agent</button>
          </div>
        </header>

        <div className="admin-content">
          {page === 'today' && <TodayView showMessage={showMessage} />}
          {page === 'agents' && <AgentsView showMessage={showMessage} addRequested={addRequested} />}
          {page === 'timesheets' && <TimesheetsView showMessage={showMessage} />}
          {page === 'reports' && <ReportsView showMessage={showMessage} />}
          {page === 'settings' && <SettingsView theme={theme} onThemeChange={onThemeChange} showMessage={showMessage} />}
        </div>
      </main>
    </div>
  );
};

export default AdminPortal;
