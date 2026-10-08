import React, { useEffect, useRef, useState } from 'react';
import Keypad from './Keypad';
import HalloweenDecor from './HalloweenDecor';
import PWAInstaller from './PWAInstaller';
import { STATUS_META, statusFromAction, fmtClock, fmtDuration, parseRecordTime, todayIso, initials } from '../lib/time';
import { prepareAvatar } from '../lib/image';

type MessageType = 'success' | 'error' | 'warning' | 'info';

export type ThemePref = 'auto' | 'classic';

interface KioskProps {
  theme: string;          // theme actually shown
  siteTheme: string;      // holiday theme picked by admins
  themePref: ThemePref;   // this device's choice
  onThemePrefChange: (pref: ThemePref) => void;
  isAdmin: boolean;
  onOpenAdmin: () => void;
  showMessage: (text: string, type: MessageType) => void;
}

interface Employee {
  name: string;
  action: string | null;
  since: number | null;
  todayWorked: number;
  firstIn: number | null;
  avatarUrl: string | null;
}

// Which action may follow the employee's last action (null = no records yet)
const VALID_AFTER: { [action: string]: (string | null)[] } = {
  ClockIn: ['ClockOut', 'Absent', null],
  ClockOut: ['ClockIn', 'EndBreak', 'EndRestroom', 'EndLunch', 'EndItIssue', 'EndMeeting'],
  StartBreak: ['ClockIn', 'EndRestroom', 'EndLunch', 'EndItIssue', 'EndMeeting'],
  EndBreak: ['StartBreak'],
  StartRestroom: ['ClockIn', 'EndBreak', 'EndRestroom', 'EndLunch', 'EndItIssue', 'EndMeeting'],
  EndRestroom: ['StartRestroom'],
  StartLunch: ['ClockIn', 'EndBreak', 'EndRestroom', 'EndItIssue', 'EndMeeting'],
  EndLunch: ['StartLunch'],
  StartItIssue: ['ClockIn', 'EndBreak', 'EndRestroom', 'EndLunch', 'EndMeeting'],
  EndItIssue: ['StartItIssue'],
  StartMeeting: ['ClockIn', 'EndBreak', 'EndRestroom', 'EndLunch', 'EndItIssue'],
  EndMeeting: ['StartMeeting']
};

// The single "resume" action for each paused state
const END_ACTION: { [start: string]: { action: string; label: string } } = {
  StartBreak: { action: 'EndBreak', label: '✅ End break' },
  StartLunch: { action: 'EndLunch', label: '✅ End lunch' },
  StartRestroom: { action: 'EndRestroom', label: '✅ Back from restroom' },
  StartItIssue: { action: 'EndItIssue', label: '✅ IT issue resolved' },
  StartMeeting: { action: 'EndMeeting', label: '✅ End meeting' }
};

const SECONDARY_ACTIONS = [
  { action: 'StartBreak', label: 'Break', icon: '☕' },
  { action: 'StartLunch', label: 'Lunch', icon: '🍔' },
  { action: 'StartRestroom', label: 'Restroom', icon: '🚻' },
  { action: 'StartMeeting', label: 'Meeting', icon: '📊' },
  { action: 'StartItIssue', label: 'IT issue', icon: '💻' }
];

const EARLIEST_CLOCK_IN = 6 * 60 + 15; // 6:15 AM PST
const LATEST_CLOCK_IN = 16 * 60;       // 4:00 PM PST
const LATE_AFTER = 7 * 60 + 10;        // 7:10 AM PST

const todayKey = () => {
  const [y, m, d] = todayIso().split('-');
  return `${m}/${d}/${y}`;
};

const pstNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));

const successText = (action: string, name: string, time: string, halloween: boolean): string => {
  const at = fmtClock(parseRecordTime(time)?.minutes);
  const spooky: { [a: string]: string } = {
    ClockIn: `🎃 Clocked in at ${at}. Have a spooktacular shift, ${name}!`,
    ClockOut: `👻 Clocked out at ${at}. Great work, ${name}. Rest up!`,
    StartLunch: `🍬 Enjoy your lunch, ${name}. No tricks, just treats!`,
    StartBreak: `🦇 Break started at ${at}. Back soon!`
  };
  const normal: { [a: string]: string } = {
    ClockIn: `Clocked in at ${at}. Have a great shift, ${name}!`,
    ClockOut: `Clocked out at ${at}. Great work today, ${name}!`,
    StartLunch: `Lunch started at ${at}. Enjoy!`,
    StartBreak: `Break started at ${at}.`
  };
  return (halloween ? spooky[action] : undefined) || normal[action] || `Recorded at ${at}.`;
};

const daysUntilHalloween = (): number => {
  const now = pstNow();
  const halloween = new Date(now.getFullYear(), 9, 31);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((halloween.getTime() - today.getTime()) / 86400000);
};

const THEME_NAMES: { [theme: string]: string } = { halloween: 'Halloween' };

const Kiosk: React.FC<KioskProps> = ({ theme, siteTheme, themePref, onThemePrefChange, isAdmin, onOpenAdmin, showMessage }) => {
  const [pin, setPin] = useState('');
  const [rememberPin, setRememberPin] = useState(false);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [lookupState, setLookupState] = useState<'idle' | 'loading' | 'notFound'>('idle');
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(pstNow());
  const [shake, setShake] = useState(false);
  const [uploading, setUploading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const themePrefRef = useRef(themePref);
  themePrefRef.current = themePref;
  const halloween = theme === 'halloween';

  useEffect(() => {
    const timer = setInterval(() => setClock(pstNow()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('rememberedPin');
      if (saved) {
        setPin(saved);
        setRememberPin(true);
      }
    } catch { /* storage unavailable */ }
    containerRef.current?.focus();
  }, []);

  // Look up the employee as soon as 4 digits are entered
  useEffect(() => {
    if (pin.length !== 4) {
      setEmployee(null);
      setLookupState('idle');
      return;
    }
    let cancelled = false;
    setLookupState('loading');
    fetch('/employee-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    })
      .then(async (response) => {
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setEmployee(null);
          setLookupState('notFound');
          showMessage(response.status === 403 ? data.error : 'PIN not found. Please check and try again.', 'error');
          triggerShake();
          return;
        }
        const last = parseRecordTime(data.time);
        setEmployee({
          name: data.name,
          action: data.action,
          since: last && last.dateKey === todayKey() ? last.minutes : null,
          todayWorked: data.today?.worked || 0,
          firstIn: data.today?.firstIn ?? null,
          avatarUrl: data.avatarUrl || null
        });
        setLookupState('idle');
        // The agent's saved theme choice follows them to any device. If they never
        // chose one but turned the holiday theme off here, remember that for them.
        if (data.themePref) {
          if (data.themePref !== themePrefRef.current) onThemePrefChange(data.themePref);
        } else if (themePrefRef.current === 'classic') {
          savePref('classic');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLookupState('idle');
          showMessage('Connection problem. Please try again.', 'error');
        }
      });
    return () => { cancelled = true; };
  }, [pin]);

  const savePref = (pref: ThemePref) => {
    fetch('/me/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin, themePref: pref })
    }).catch(() => { /* device setting still applies */ });
  };

  const toggleTheme = () => {
    const next: ThemePref = themePref === 'classic' ? 'auto' : 'classic';
    onThemePrefChange(next);
    if (employee) savePref(next);
    showMessage(next === 'classic'
      ? 'Holiday theme turned off. Showing the standard look.'
      : `${THEME_NAMES[siteTheme] || 'Holiday'} theme turned on.`, 'info');
  };

  const uploadPhoto = async (file: File | undefined) => {
    if (!file || !employee) return;
    setUploading(true);
    try {
      const image = await prepareAvatar(file);
      const response = await fetch('/me/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, image })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Upload failed');
      setEmployee({ ...employee, avatarUrl: data.avatarUrl });
      showMessage('Profile photo saved. It will show on your Discord clock-ins.', 'success');
    } catch (error: any) {
      showMessage(error.message, 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removePhoto = async () => {
    if (!employee || !window.confirm('Remove your profile photo?')) return;
    try {
      const response = await fetch('/me/avatar/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });
      if (!response.ok) throw new Error((await response.json()).error || 'Could not remove photo');
      setEmployee({ ...employee, avatarUrl: null });
      showMessage('Profile photo removed', 'info');
    } catch (error: any) {
      showMessage(error.message, 'error');
    }
  };

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const pressKey = (key: string) => {
    if (pin.length < 4) setPin(pin + key);
  };
  const backspace = () => setPin(pin.slice(0, -1));
  const clearPin = () => {
    setPin('');
    setRememberPin(false);
    try { localStorage.removeItem('rememberedPin'); } catch { /* ignore */ }
  };

  const status = statusFromAction(employee?.action);
  const isWorking = status === 'working';
  const isPaused = !!(employee?.action && END_ACTION[employee.action]);
  const canClockIn = !employee?.action || employee.action === 'ClockOut' || employee.action === 'Absent';

  const record = async (action: string) => {
    if (!employee || busy) {
      if (pin.length < 4) triggerShake();
      return;
    }
    if (!VALID_AFTER[action]?.includes(employee.action)) {
      showMessage(`You can't do that right now (current status: ${STATUS_META[status].label}).`, 'error');
      return;
    }
    if (action === 'ClockIn') {
      const now = pstNow();
      const minutes = now.getHours() * 60 + now.getMinutes();
      if (minutes < EARLIEST_CLOCK_IN) {
        showMessage('Clock-in opens at 6:15 AM Pacific.', 'error');
        return;
      }
      if (minutes >= LATEST_CLOCK_IN) {
        showMessage('Clock-in is closed after 4:00 PM Pacific.', 'error');
        return;
      }
      if (minutes > LATE_AFTER) {
        showMessage('⚠️ Late clock-in recorded (after 7:10 AM).', 'warning');
      }
    }
    if (action === 'ClockOut' && !window.confirm(`Clock out for the day, ${employee.name}?`)) {
      return;
    }

    setBusy(true);
    try {
      const response = await fetch('/add-record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, action })
      });
      const data = await response.json();
      if (!response.ok) {
        // Status changed elsewhere (e.g. another device) - resync
        if (data.lastAction !== undefined) {
          setEmployee({ ...employee, action: data.lastAction, since: null });
        }
        throw new Error(data.error || 'Could not record time');
      }
      const minutes = parseRecordTime(data.time)?.minutes ?? null;
      setEmployee({
        ...employee,
        action,
        since: minutes,
        firstIn: employee.firstIn ?? (action === 'ClockIn' ? minutes : null)
      });
      if (rememberPin) {
        try { localStorage.setItem('rememberedPin', pin); } catch { /* ignore */ }
      }
      showMessage(successText(action, employee.name, data.time, halloween), 'success');
    } catch (error: any) {
      showMessage(error.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  // Keyboard input works anywhere on the page (focus is lost when buttons re-render)
  const handleKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || document.querySelector('.login-overlay')) return;
    if (e.key === 'Enter' && target.tagName === 'BUTTON') return; // the button handles it
    if (/^[0-9]$/.test(e.key)) pressKey(e.key);
    else if (e.key === 'Backspace' || e.key === 'Delete') backspace();
    else if (e.key === 'Escape') clearPin();
    else if (e.key === 'Enter' && employee) {
      if (canClockIn) record('ClockIn');
      else if (isPaused) record(END_ACTION[employee.action!].action);
    }
  };
  const keyHandler = useRef(handleKeyDown);
  keyHandler.current = handleKeyDown;
  useEffect(() => {
    const listener = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  const nowMinutes = clock.getHours() * 60 + clock.getMinutes();
  const statusMeta = STATUS_META[status];
  const days = daysUntilHalloween();

  return (
    <div className="kiosk" ref={containerRef} tabIndex={-1}>
      {halloween && <HalloweenDecor />}

      <header className="kiosk-header">
        <img
          className="kiosk-logo"
          src="https://storage.googleapis.com/msgsndr/7AsSgaSl1IdPndNHqKfs/media/68e6dc19c4bd9e7a6d37de2b.png"
          alt="PowerHouze Group"
        />
        <div className="kiosk-clock">
          <div className="kiosk-time">
            {clock.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            <span className="kiosk-seconds">{String(clock.getSeconds()).padStart(2, '0')}</span>
          </div>
          <div className="kiosk-date">
            {clock.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · Pacific Time
          </div>
          {siteTheme !== 'default' && (
            <button
              className={`theme-toggle ${themePref === 'classic' ? 'off' : 'on'}`}
              onClick={toggleTheme}
              aria-pressed={themePref !== 'classic'}
              title="Turn the holiday theme on or off for you"
            >
              <span className="theme-toggle-track"><span className="theme-toggle-thumb" /></span>
              {siteTheme === 'halloween' ? '🎃' : '🎉'} {THEME_NAMES[siteTheme] || 'Holiday'} theme
            </button>
          )}
        </div>
      </header>

      {halloween && (
        <div className="kiosk-holiday-banner">
          <span className="kiosk-holiday-title">Happy Halloween</span>
          <span className="kiosk-holiday-sub">
            {days > 1 ? `${days} days until Halloween 🎃` : days === 1 ? 'Halloween is tomorrow! 🦇' : days === 0 ? 'Trick or treat! 👻' : 'Thanks for a spooky season 👻'}
          </span>
        </div>
      )}

      <main className="kiosk-main">
        <section className={`kiosk-card ${shake ? 'shake' : ''}`}>
          <div className="kiosk-greeting">
            {employee ? (
              <div className="kiosk-who">
                <button
                  className={`kiosk-avatar ${employee.avatarUrl ? 'has-photo' : ''}`}
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  title={employee.avatarUrl ? 'Change your photo' : 'Add a profile photo'}
                  aria-label={employee.avatarUrl ? 'Change your profile photo' : 'Add a profile photo'}
                >
                  {employee.avatarUrl
                    ? <img src={employee.avatarUrl} alt="" />
                    : <span className="kiosk-avatar-initials">{initials(employee.name)}</span>}
                  <span className="kiosk-avatar-badge">{uploading ? '…' : '📷'}</span>
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => uploadPhoto(e.target.files?.[0])}
                />
                <div className="kiosk-who-text">
                  <span className="kiosk-hello">{halloween ? 'Boo! Welcome,' : 'Welcome,'}</span>
                  <span className="kiosk-name">{employee.name}</span>
                  {!employee.avatarUrl && (
                    <button className="kiosk-photo-hint" onClick={() => fileRef.current?.click()} disabled={uploading}>
                      {uploading ? 'Uploading…' : 'Add a photo so the team knows it’s you'}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
                <span className="kiosk-hello">Time clock</span>
                <span className="kiosk-name">Enter your PIN</span>
              </>
            )}
          </div>

          <div className="pin-boxes" aria-label={`PIN, ${pin.length} of 4 digits entered`}>
            {[0, 1, 2, 3].map(i => (
              <span key={i} className={`pin-box ${i < pin.length ? 'filled' : ''} ${i === pin.length ? 'active' : ''}`}>
                {i < pin.length ? '•' : ''}
              </span>
            ))}
          </div>

          {lookupState === 'loading' && <div className="kiosk-hint">Looking you up…</div>}
          {lookupState === 'notFound' && <div className="kiosk-hint kiosk-hint-error">PIN not recognized</div>}
          {!employee && lookupState === 'idle' && (
            <div className="kiosk-hint">Type your 4-digit PIN on the keypad or keyboard</div>
          )}

          {employee && (
            <>
              <div className={`status-chip tone-${statusMeta.tone}`}>
                <span>{statusMeta.icon}</span>
                <span>{statusMeta.label}</span>
                {employee.since !== null && status !== 'notIn' && (
                  <span className="status-chip-since">
                    since {fmtClock(employee.since)}
                    {status !== 'done' && status !== 'absent' && ` · ${fmtDuration(Math.max(0, nowMinutes - employee.since))}`}
                  </span>
                )}
              </div>

              {employee.firstIn !== null && (
                <div className="kiosk-today">
                  In at <strong>{fmtClock(employee.firstIn)}</strong>
                  {employee.todayWorked > 0 && <> · <strong>{fmtDuration(employee.todayWorked)}</strong> on the clock today</>}
                </div>
              )}

              {canClockIn && (
                <button className="kiosk-primary" disabled={busy} onClick={() => record('ClockIn')}>
                  {halloween ? '🎃 Clock in' : '⚡ Clock in'}
                </button>
              )}

              {isPaused && (
                <button className="kiosk-primary kiosk-primary-resume" disabled={busy} onClick={() => record(END_ACTION[employee.action!].action)}>
                  {END_ACTION[employee.action!].label}
                </button>
              )}

              {isWorking && (
                <>
                  <div className="kiosk-actions">
                    {SECONDARY_ACTIONS.map(a => (
                      <button key={a.action} className="kiosk-action" disabled={busy} onClick={() => record(a.action)}>
                        <span className="kiosk-action-icon">{a.icon}</span>
                        {a.label}
                      </button>
                    ))}
                  </div>
                  <button className="kiosk-clockout" disabled={busy} onClick={() => record('ClockOut')}>
                    {halloween ? '👻 Clock out for the day' : 'Clock out for the day'}
                  </button>
                </>
              )}
            </>
          )}

          <div className="kiosk-card-footer">
            <label className="kiosk-remember">
              <input
                type="checkbox"
                checked={rememberPin}
                disabled={pin.length !== 4}
                onChange={(e) => {
                  setRememberPin(e.target.checked);
                  try {
                    if (e.target.checked) localStorage.setItem('rememberedPin', pin);
                    else localStorage.removeItem('rememberedPin');
                  } catch { /* ignore */ }
                }}
              />
              Remember my PIN on this device
            </label>
            <span className="kiosk-footer-links">
              {employee?.avatarUrl && <button className="kiosk-link" onClick={removePhoto}>Remove photo</button>}
              {pin && <button className="kiosk-link" onClick={clearPin}>Not you? Clear</button>}
            </span>
          </div>
        </section>

        <section className="kiosk-keypad-wrap">
          <Keypad onKeyPress={pressKey} onBackspace={backspace} onClear={clearPin} />
        </section>
      </main>

      <footer className="kiosk-footer">
        <button className="kiosk-link" onClick={onOpenAdmin}>
          {isAdmin ? '← Back to admin portal' : '🔒 Admin'}
        </button>
      </footer>

      {!isAdmin && <PWAInstaller />}
    </div>
  );
};

export default Kiosk;
