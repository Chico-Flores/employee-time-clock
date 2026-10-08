// Shared helpers for the PST wall-clock time strings stored on records
// ("MM/DD/YYYY, hh:mm:ss AM") and for employee status display.

export interface ParsedTime {
  dateKey: string;
  minutes: number;
}

export const parseRecordTime = (str?: string | null): ParsedTime | null => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)/i.exec(str || '');
  if (!m) return null;
  let hour = parseInt(m[4], 10) % 12;
  if (m[7].toUpperCase() === 'PM') hour += 12;
  return {
    dateKey: `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[3]}`,
    minutes: hour * 60 + parseInt(m[5], 10) + parseInt(m[6] || '0', 10) / 60
  };
};

// 435 -> "7:15 AM"
export const fmtClock = (minutes: number | null | undefined): string => {
  if (minutes === null || minutes === undefined) return '—';
  const m = Math.round(minutes);
  const h24 = Math.floor(m / 60) % 24;
  const h12 = h24 % 12 || 12;
  return `${h12}:${String(m % 60).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
};

// 312 -> "5h 12m", 42 -> "42m"
export const fmtDuration = (minutes: number | null | undefined): string => {
  if (minutes === null || minutes === undefined || minutes < 0) return '—';
  const m = Math.round(minutes);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
};

export const fmtHours = (minutes: number): string => (minutes / 60).toFixed(1);

// Difference between the server's clock and this PC's clock. Some kiosk PCs
// have the wrong time or time zone set, so all "now" checks use server time.
let clockOffsetMs = 0;
export const serverNow = (): Date => new Date(Date.now() + clockOffsetMs);

export const syncClock = async (): Promise<void> => {
  try {
    const sent = Date.now();
    const res = await fetch('/get-pst-time', { cache: 'no-store' });
    const { epoch } = await res.json();
    if (typeof epoch === 'number') {
      const received = Date.now();
      clockOffsetMs = epoch - (sent + received) / 2;
    }
  } catch {
    // offline: keep the last known offset
  }
};

// Current wall-clock time in Pacific, as a Date whose local fields read PST
export const pstNow = (): Date =>
  new Date(serverNow().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));

// Current PST date as YYYY-MM-DD
export const todayIso = (): string => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(serverNow());
  const get = (t: string) => parts.find(p => p.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
};

export const shiftIso = (iso: string, days: number): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const isoLabel = (iso: string): string =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });

export type StatusKey =
  | 'working' | 'break' | 'lunch' | 'restroom' | 'meeting' | 'itIssue' | 'done' | 'notIn' | 'absent';

export const STATUS_META: { [K in StatusKey]: { label: string; tone: string; icon: string } } = {
  working: { label: 'Working', tone: 'green', icon: '🟢' },
  meeting: { label: 'In a meeting', tone: 'blue', icon: '📊' },
  itIssue: { label: 'IT issue', tone: 'red', icon: '💻' },
  break: { label: 'On break', tone: 'amber', icon: '☕' },
  lunch: { label: 'At lunch', tone: 'amber', icon: '🍔' },
  restroom: { label: 'Restroom', tone: 'amber', icon: '🚻' },
  done: { label: 'Clocked out', tone: 'gray', icon: '🔴' },
  notIn: { label: 'Not in yet', tone: 'slate', icon: '⏳' },
  absent: { label: 'Absent', tone: 'red', icon: '❌' }
};

export const statusFromAction = (action: string | null | undefined): StatusKey => {
  switch (action) {
    case 'ClockIn': case 'EndBreak': case 'EndLunch': case 'EndRestroom': case 'EndMeeting': case 'EndItIssue':
      return 'working';
    case 'StartBreak': return 'break';
    case 'StartLunch': return 'lunch';
    case 'StartRestroom': return 'restroom';
    case 'StartMeeting': return 'meeting';
    case 'StartItIssue': return 'itIssue';
    case 'ClockOut': return 'done';
    case 'Absent': return 'absent';
    default: return 'notIn';
  }
};

export const ACTION_LABELS: { [action: string]: string } = {
  ClockIn: 'Clocked in', ClockOut: 'Clocked out',
  StartBreak: 'Started break', EndBreak: 'Ended break',
  StartLunch: 'Started lunch', EndLunch: 'Ended lunch',
  StartRestroom: 'Restroom', EndRestroom: 'Back from restroom',
  StartMeeting: 'Joined meeting', EndMeeting: 'Left meeting',
  StartItIssue: 'Reported IT issue', EndItIssue: 'IT issue resolved',
  Absent: 'Marked absent'
};

export const LOCATIONS: { key: string; label: string }[] = [
  { key: 'PH', label: 'Philippines' },
  { key: 'TJ', label: 'Tijuana' },
  { key: 'EG', label: 'Egypt' },
  { key: 'RS', label: 'Rosarito' }
];

export const locationOf = (tags: string[] = []): string => {
  if (tags.includes('PH')) return 'PH';
  if (tags.includes('TJ') || tags.includes('MX')) return 'TJ';
  if (tags.includes('EG')) return 'EG';
  if (tags.includes('RS')) return 'RS';
  return '';
};

export const roleOf = (tags: string[] = []): string =>
  ['Admin', 'Jr Closer', 'Closer', 'Dialer'].find(r => tags.includes(r)) || '';

export const initials = (name: string): string => name.slice(0, 2).toUpperCase();
