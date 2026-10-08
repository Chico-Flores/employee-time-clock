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

const LATE_TEAMS = [
  { key: 'PH', label: 'Philippines' },
  { key: 'EG', label: 'Egypt' },
  { key: 'TJ', label: 'Tijuana' },
  { key: 'RS', label: 'Rosarito' },
  { key: 'default', label: 'Everyone else' }
];

// 400 <-> "06:40" for <input type="time">
const toTimeInput = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const fromTimeInput = (v: string) => {
  const [h, m] = v.split(':').map(Number);
  return Number.isInteger(h) && Number.isInteger(m) ? h * 60 + m : null;
};

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
  type TeamTimes = { [team: string]: string };
  interface ScheduleForm { late: TeamTimes; auto: TeamTimes; noshow: TeamTimes; limits: { [k: string]: string } }
  const [form, setForm] = useState<ScheduleForm | null>(null);
  const [savedForm, setSavedForm] = useState<ScheduleForm | null>(null);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [alertsConnected, setAlertsConnected] = useState(false);
  const [webhookInput, setWebhookInput] = useState('');
  const [webhookBusy, setWebhookBusy] = useState(false);

  const applySettings = (d: any) => {
    const late: TeamTimes = {}, auto: TeamTimes = {}, noshow: TeamTimes = {};
    for (const t of LATE_TEAMS) {
      late[t.key] = toTimeInput(d.lateRules[t.key] ?? d.lateRules.default);
      const a = d.schedule.autoClockOut[t.key];
      auto[t.key] = a === null || a === undefined ? '' : toTimeInput(a);
      const n = d.schedule.noShowAt[t.key];
      noshow[t.key] = n === null || n === undefined ? '' : toTimeInput(n);
    }
    const limits: { [k: string]: string } = {};
    for (const k of Object.keys(d.schedule.alertLimits)) limits[k] = String(d.schedule.alertLimits[k]);
    const next = { late, auto, noshow, limits };
    setForm(next);
    setSavedForm(JSON.parse(JSON.stringify(next)));
    if (d.teamLeadAlerts !== undefined) setAlertsConnected(!!d.teamLeadAlerts);
  };

  useEffect(() => {
    api('/settings').then(applySettings).catch(() => setForm(null));
  }, []);

  const scheduleDirty = !!form && JSON.stringify(form) !== JSON.stringify(savedForm);

  const saveSchedule = async () => {
    if (!form || !savedForm) return;
    const lateRules: { [team: string]: number } = {};
    const autoClockOut: { [team: string]: number | null } = {};
    const noShowAt: { [team: string]: number | null } = {};
    for (const t of LATE_TEAMS) {
      const late = fromTimeInput(form.late[t.key]);
      if (late === null) return showMessage(`Enter a late time for ${t.label}`, 'error');
      lateRules[t.key] = late;
      const auto = form.auto[t.key] ? fromTimeInput(form.auto[t.key]) : null;
      if (auto === null && (t.key === 'default' || form.auto[t.key])) return showMessage(`Enter an auto clock-out time for ${t.label}`, 'error');
      autoClockOut[t.key] = auto;
      noShowAt[t.key] = form.noshow[t.key] ? fromTimeInput(form.noshow[t.key]) : null;
    }
    const alertLimits: { [k: string]: number } = {};
    for (const [k, v] of Object.entries(form.limits)) {
      const n = parseInt(v, 10);
      if (!Number.isInteger(n) || n < 1) return showMessage('Alert limits must be at least 1 minute', 'error');
      alertLimits[k] = n;
    }
    const body: any = { schedule: { autoClockOut, noShowAt, alertLimits } };
    // Only send late rules when they changed (each save starts a new dated rule)
    if (JSON.stringify(form.late) !== JSON.stringify(savedForm.late)) body.lateRules = lateRules;
    setSavingSchedule(true);
    try {
      applySettings(await api('/settings', { method: 'POST', body: JSON.stringify(body) }));
      showMessage(body.lateRules ? 'Schedule saved. New late times apply from today.' : 'Schedule saved', 'success');
    } catch (e: any) {
      showMessage(e.message, 'error');
    } finally {
      setSavingSchedule(false);
    }
  };

  const saveWebhook = async (url: string) => {
    setWebhookBusy(true);
    try {
      const d = await api<{ teamLeadAlerts: boolean }>('/settings', { method: 'POST', body: JSON.stringify({ teamLeadWebhook: url }) });
      setAlertsConnected(d.teamLeadAlerts);
      setWebhookInput('');
      showMessage(url ? 'Team lead channel connected' : 'Team lead alerts turned off', 'success');
    } catch (e: any) {
      showMessage(e.message, 'error');
    } finally {
      setWebhookBusy(false);
    }
  };

  const sendTestAlert = async () => {
    try {
      await api('/admin/test-alert', { method: 'POST' });
      showMessage('Test alert sent. Check the team lead channel.', 'success');
    } catch (e: any) {
      showMessage(e.message, 'error');
    }
  };

  const setTeam = (field: 'late' | 'auto' | 'noshow', team: string, value: string) =>
    form && setForm({ ...form, [field]: { ...form[field], [team]: value } });

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

      <section className="card">
        <div className="card-head">
          <div>
            <h2>Team schedule</h2>
            <p className="muted">All times Pacific. Late rule changes apply from today; past days keep the rules they were worked under.</p>
          </div>
          <button className="btn btn-primary" disabled={!scheduleDirty || savingSchedule} onClick={saveSchedule}>
            {savingSchedule ? 'Saving…' : 'Save'}
          </button>
        </div>
        {!form ? <div className="skeleton" style={{ height: 120 }} /> : (
          <div className="table-wrap schedule-wrap">
            <table className="table schedule-table">
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Late after</th>
                  <th>“Possibly absent” alert</th>
                  <th>Auto clock-out</th>
                </tr>
              </thead>
              <tbody>
                {LATE_TEAMS.map(t => (
                  <tr key={t.key}>
                    <td className="strong">{t.label}</td>
                    <td><input type="time" step={300} value={form.late[t.key]} onChange={e => setTeam('late', t.key, e.target.value)} /></td>
                    <td>
                      <div className="time-or-off">
                        <input type="time" step={300} value={form.noshow[t.key]} onChange={e => setTeam('noshow', t.key, e.target.value)} />
                        {form.noshow[t.key]
                          ? <button className="link-btn" onClick={() => setTeam('noshow', t.key, '')}>Turn off</button>
                          : <span className="muted small">Off</span>}
                      </div>
                    </td>
                    <td>
                      <div className="time-or-off">
                        <input type="time" step={300} value={form.auto[t.key]} onChange={e => setTeam('auto', t.key, e.target.value)} />
                        {t.key !== 'default' && (form.auto[t.key]
                          ? <button className="link-btn" onClick={() => setTeam('auto', t.key, '')}>Turn off</button>
                          : <span className="muted small">Off</span>)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted small schedule-note">
          “Possibly absent” alerts post to the team lead channel on weekdays, listing anyone on that team who hasn’t clocked in yet.
          Auto clock-out clocks out anyone still on the clock (including on break) at their team’s time, with a note in Discord.
        </p>
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>Team lead alerts</h2>
            <p className="muted">Discord messages for long breaks, long IT issues and morning no-shows.</p>
          </div>
          <span className={`badge ${alertsConnected ? 'badge-live' : ''}`}>{alertsConnected ? 'Connected' : 'Not connected'}</span>
        </div>
        <div className="alerts-grid">
          <div className="field">
            <span>Team lead channel webhook</span>
            <div className="field-row">
              <input
                type="url"
                value={webhookInput}
                onChange={e => setWebhookInput(e.target.value)}
                placeholder={alertsConnected ? 'Connected. Paste a new URL to replace it' : 'https://discord.com/api/webhooks/…'}
              />
              <button className="btn btn-primary" disabled={!webhookInput.trim() || webhookBusy} onClick={() => saveWebhook(webhookInput.trim())}>
                {alertsConnected ? 'Replace' : 'Connect'}
              </button>
            </div>
            <span className="muted small">In Discord: team lead channel → ⚙️ Edit Channel → Integrations → Webhooks → New Webhook → Copy Webhook URL.</span>
            <div className="card-actions">
              <button className="btn btn-ghost btn-sm" disabled={!alertsConnected} onClick={sendTestAlert}>Send test alert</button>
              {alertsConnected && <button className="btn btn-ghost btn-sm" disabled={webhookBusy} onClick={() => saveWebhook('')}>Turn off</button>}
            </div>
          </div>
          {form && (
            <div className="field">
              <span>Alert when longer than (minutes)</span>
              <div className="limit-grid">
                {[['break', '☕ Break'], ['lunch', '🍔 Lunch'], ['restroom', '🚻 Restroom'], ['itIssue', '💻 IT issue']].map(([k, label]) => (
                  <label key={k} className="limit-field">
                    <span>{label}</span>
                    <input
                      inputMode="numeric"
                      value={form.limits[k] ?? ''}
                      onChange={e => setForm({ ...form, limits: { ...form.limits, [k]: e.target.value.replace(/\D/g, '').slice(0, 3) } })}
                    />
                  </label>
                ))}
              </div>
              <span className="muted small">Saved with the team schedule. These limits also drive “Needs attention” on the Today screen.</span>
            </div>
          )}
        </div>
      </section>

      <div className="settings-grid">
        <section className="card">
          <div className="card-head"><h2>Auto clock-out</h2></div>
          <p>Each team is clocked out automatically at its time in the <strong>Team schedule</strong> above, with a note in Discord.</p>
          <p className="muted small">Clock-in is open 5:45 AM – 4:00 PM Pacific.</p>
          <button className="btn btn-ghost" onClick={runAutoClockOut}>Clock out everyone now</button>
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
