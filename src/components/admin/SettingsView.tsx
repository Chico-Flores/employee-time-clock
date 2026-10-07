import React, { useEffect, useState } from 'react';
import CreateAdmin from '../CreateAdmin';
import { ShowMessage, api } from './ui';

const THEMES = [
  {
    key: 'default',
    name: 'Classic',
    text: 'PowerHouze blue. Clean and simple, all year round.',
    preview: 'theme-preview-default'
  },
  {
    key: 'halloween',
    name: 'Halloween',
    text: 'Night sky, glowing pumpkins, bats and a countdown to October 31.',
    preview: 'theme-preview-halloween'
  }
];

interface SettingsViewProps {
  theme: string;
  onThemeChange: (theme: string) => void;
  showMessage: ShowMessage;
}

const SettingsView: React.FC<SettingsViewProps> = ({ theme, onThemeChange, showMessage }) => {
  const [saving, setSaving] = useState('');
  const [admins, setAdmins] = useState<string[]>([]);
  const [pinAdmins, setPinAdmins] = useState<string[]>([]);
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);

  const loadAdmins = () => api<any[]>('/get-users', { method: 'POST' })
    .then(users => {
      setAdmins(users.filter(u => u.username).map(u => u.username));
      setPinAdmins(users.filter(u => !u.username && u.active !== false && (u.tags || []).includes('Admin')).map(u => u.name));
    })
    .catch(() => { setAdmins([]); setPinAdmins([]); });
  useEffect(() => { loadAdmins(); }, []);

  const chooseTheme = async (key: string) => {
    if (key === theme) return;
    setSaving(key);
    try {
      await api('/settings', { method: 'POST', body: JSON.stringify({ theme: key }) });
      onThemeChange(key);
      showMessage(`${THEMES.find(t => t.key === key)?.name} theme is now live on every clock-in screen`, 'success');
    } catch (e: any) {
      showMessage(e.message, 'error');
    } finally {
      setSaving('');
    }
  };

  const runAutoClockOut = async () => {
    if (!window.confirm('Clock out everyone who is still on the clock right now?')) return;
    try {
      const data = await api<{ message: string }>('/test-auto-clockout', { method: 'POST' });
      showMessage(data.message, 'success');
    } catch (e: any) {
      showMessage(e.message, 'error');
    }
  };

  return (
    <div className="settings">
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Holiday theme</h2>
            <p className="muted">Changes the agent clock-in screen for everyone. Open screens update within a few minutes.</p>
          </div>
        </div>
        <div className="theme-grid">
          {THEMES.map(t => (
            <button key={t.key} className={`theme-card ${theme === t.key ? 'selected' : ''}`} onClick={() => chooseTheme(t.key)} disabled={!!saving}>
              <span className={`theme-preview ${t.preview}`}>
                {t.key === 'halloween' && <span className="theme-preview-emoji">🎃🦇</span>}
                <span className="theme-preview-keys"><i /><i /><i /><i /><i /><i /></span>
              </span>
              <span className="theme-card-body">
                <span className="theme-card-title">
                  {t.name}
                  {theme === t.key && <span className="badge badge-live">Live</span>}
                  {saving === t.key && <span className="muted small">Saving…</span>}
                </span>
                <span className="muted small">{t.text}</span>
              </span>
            </button>
          ))}
          <div className="theme-card theme-card-soon">
            <span className="theme-preview theme-preview-soon">🎄❄️</span>
            <span className="theme-card-body">
              <span className="theme-card-title">More holidays</span>
              <span className="muted small">Christmas, New Year and more can be added the same way.</span>
            </span>
          </div>
        </div>
      </section>

      <div className="settings-grid">
        <section className="card">
          <div className="card-head"><h2>Auto clock-out</h2></div>
          <p>Everyone still on the clock is clocked out automatically at <strong>4:30 PM Pacific</strong> every day, with a note in Discord.</p>
          <p className="muted small">Clock-in is open 6:15 AM – 4:00 PM Pacific. Clock-ins after 7:10 AM are marked late.</p>
          <button className="btn btn-ghost" onClick={runAutoClockOut}>Run auto clock-out now</button>
        </section>

        <section className="card">
          <div className="card-head"><h2>Admin access</h2></div>
          <p className="muted small">Username & password accounts</p>
          <div className="tag-chips spaced">
            {admins.length ? admins.map(a => <span key={a} className="tag-chip">{a}</span>) : <span className="muted">None</span>}
          </div>
          <p className="muted small">Quick PIN access (agents tagged “Admin”)</p>
          <div className="tag-chips spaced">
            {pinAdmins.length ? pinAdmins.map(a => <span key={a} className="tag-chip tag-admin">{a}</span>) : <span className="muted">None</span>}
          </div>
          <button className="btn btn-ghost" onClick={() => setShowCreateAdmin(true)}>Add username & password admin</button>
        </section>
      </div>

      {showCreateAdmin && (
        <CreateAdmin
          onCreateSuccess={() => { setShowCreateAdmin(false); loadAdmins(); showMessage('Admin account created', 'success'); }}
          onCloseOverlay={() => setShowCreateAdmin(false)}
        />
      )}
    </div>
  );
};

export default SettingsView;
