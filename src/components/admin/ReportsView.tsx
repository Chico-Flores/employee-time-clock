import React, { useEffect, useMemo, useState } from 'react';
import Icon from './Icon';
import { Avatar, LocationBadge, EmptyState, ShowMessage, api, downloadCsv } from './ui';
import { fmtDuration, fmtHours, todayIso, shiftIso, isoLabel, LOCATIONS, locationOf, roleOf } from '../../lib/time';

interface HoursRow {
  avatarUrl?: string | null;
  name: string;
  pin: string;
  tags: string[];
  active: boolean;
  daysWorked: number;
  workedMinutes: number;
  breakMinutes: number;
  lunchMinutes: number;
  lateDays: number;
  absentDays: number;
  missingClockOuts: number;
}

type SortKey = 'name' | 'daysWorked' | 'workedMinutes' | 'avg' | 'lateDays' | 'absentDays';

const monthStart = (iso: string) => iso.slice(0, 8) + '01';
const monthEnd = (iso: string) => {
  const d = new Date(`${iso.slice(0, 8)}01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
};
const weekStart = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7; // Monday
  return shiftIso(iso, -offset);
};

const presets = () => {
  const today = todayIso();
  const thisWeek = weekStart(today);
  const lastMonthEnd = shiftIso(monthStart(today), -1);
  const day = parseInt(today.slice(8), 10);
  return [
    { label: 'This week', start: thisWeek, end: today },
    { label: 'Last week', start: shiftIso(thisWeek, -7), end: shiftIso(thisWeek, -1) },
    { label: '1st – 15th', start: monthStart(today), end: day <= 15 ? today : today.slice(0, 8) + '15' },
    ...(day > 15 ? [{ label: '16th – end', start: today.slice(0, 8) + '16', end: today }] : []),
    { label: 'This month', start: monthStart(today), end: today },
    { label: 'Last month', start: monthStart(lastMonthEnd), end: monthEnd(lastMonthEnd) }
  ];
};

const ReportsView: React.FC<{ showMessage: ShowMessage }> = ({ showMessage }) => {
  const initial = presets()[0];
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [rows, setRows] = useState<HoursRow[] | null>(null);
  const [location, setLocation] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'workedMinutes', dir: -1 });
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!start || !end || end < start) return;
    setRows(null);
    api<{ employees: HoursRow[] }>(`/admin/hours?start=${start}&end=${end}`)
      .then(d => setRows(d.employees))
      .catch(e => { showMessage(e.message, 'error'); setRows([]); });
  }, [start, end]);

  const value = (r: HoursRow, key: SortKey): number | string =>
    key === 'avg' ? (r.daysWorked ? r.workedMinutes / r.daysWorked : 0) : key === 'name' ? r.name : r[key];

  const visible = useMemo(() => (rows || [])
    .filter(r => !location || locationOf(r.tags) === location)
    .sort((a, b) => {
      const va = value(a, sort.key), vb = value(b, sort.key);
      return (typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number)) * sort.dir;
    }), [rows, location, sort]);

  const max = Math.max(1, ...visible.map(r => r.workedMinutes));
  const total = visible.reduce((acc, r) => ({
    worked: acc.worked + r.workedMinutes, days: acc.days + r.daysWorked, late: acc.late + r.lateDays,
    absent: acc.absent + r.absentDays, missing: acc.missing + r.missingClockOuts
  }), { worked: 0, days: 0, late: 0, absent: 0, missing: 0 });

  const header = (key: SortKey, label: string, num = true) => (
    <th className={`${num ? 'num' : ''} sortable`} onClick={() => setSort({ key, dir: sort.key === key ? (sort.dir === 1 ? -1 : 1) : (key === 'name' ? 1 : -1) })}>
      {label}{sort.key === key && (sort.dir === 1 ? ' ↑' : ' ↓')}
    </th>
  );

  const exportSummary = () => downloadCsv(`hours_${start}_to_${end}.csv`, [
    ['Agent', 'PIN', 'Location', 'Role', 'Days worked', 'Hours worked', 'Avg hours/day', 'Break hours', 'Lunch hours', 'Late days', 'Absences', 'Missing clock-outs'],
    ...visible.map(r => [
      r.name, r.pin, locationOf(r.tags), roleOf(r.tags), r.daysWorked, fmtHours(r.workedMinutes),
      r.daysWorked ? fmtHours(r.workedMinutes / r.daysWorked) : '0.0', fmtHours(r.breakMinutes), fmtHours(r.lunchMinutes),
      r.lateDays, r.absentDays, r.missingClockOuts
    ])
  ]);

  const downloadRaw = async () => {
    setDownloading(true);
    try {
      const response = await fetch(`/download-records?startDate=${start}&endDate=${end}`, { method: 'POST', credentials: 'include' });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Download failed');
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `records_${start}_to_${end}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      showMessage(e.message, 'error');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="reports">
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Hours report</h2>
            <p className="muted">{isoLabel(start)} – {isoLabel(end)} · worked time excludes breaks and lunch</p>
          </div>
          <div className="card-actions">
            <button className="btn btn-ghost" disabled={downloading} onClick={downloadRaw}><Icon name="download" size={16} /> Raw records</button>
            <button className="btn btn-primary" disabled={!visible.length} onClick={exportSummary}><Icon name="download" size={16} /> Export CSV</button>
          </div>
        </div>

        <div className="chip-row">
          {presets().map(p => (
            <button key={p.label} className={`chip ${p.start === start && p.end === end ? 'active' : ''}`} onClick={() => { setStart(p.start); setEnd(p.end); }}>
              {p.label}
            </button>
          ))}
          <span className="date-range">
            <input type="date" value={start} max={end} onChange={e => e.target.value && setStart(e.target.value)} />
            <span className="muted">to</span>
            <input type="date" value={end} min={start} max={todayIso()} onChange={e => e.target.value && setEnd(e.target.value)} />
          </span>
        </div>
        <div className="chip-row">
          <button className={`chip ${!location ? 'active' : ''}`} onClick={() => setLocation('')}>All locations</button>
          {LOCATIONS.map(l => (
            <button key={l.key} className={`chip ${location === l.key ? 'active' : ''}`} onClick={() => setLocation(location === l.key ? '' : l.key)}>{l.label}</button>
          ))}
        </div>

        <div className="summary-strip">
          <div><span>Total hours</span><strong>{fmtHours(total.worked)}</strong></div>
          <div><span>Shifts worked</span><strong>{total.days}</strong></div>
          <div><span>Late arrivals</span><strong>{total.late}</strong></div>
          <div><span>Absences</span><strong>{total.absent}</strong></div>
          <div className={total.missing ? 'text-red' : ''}><span>Missing clock-outs</span><strong>{total.missing}</strong></div>
        </div>

        {!rows ? <div className="skeleton" /> : visible.length === 0 ? (
          <EmptyState icon="📭" title="No hours in this range" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  {header('name', 'Agent', false)}
                  <th>Location</th>
                  {header('daysWorked', 'Days')}
                  {header('workedMinutes', 'Hours worked')}
                  {header('avg', 'Avg / day')}
                  <th className="num">Break · Lunch</th>
                  {header('lateDays', 'Late')}
                  {header('absentDays', 'Absent')}
                </tr>
              </thead>
              <tbody>
                {visible.map(r => (
                  <tr key={r.pin} className={r.active ? '' : 'row-muted'}>
                    <td>
                      <div className="agent-cell">
                        <Avatar name={r.name} tags={r.tags} url={r.avatarUrl} />
                        <div>
                          <div className="agent-name">{r.name}</div>
                          <div className="muted small">{roleOf(r.tags)}{!r.active && ' · inactive'}</div>
                        </div>
                      </div>
                    </td>
                    <td><LocationBadge tags={r.tags} /></td>
                    <td className="num">{r.daysWorked}</td>
                    <td className="num">
                      <div className="bar-cell">
                        <span className="bar-track"><span className="bar" style={{ width: `${(r.workedMinutes / max) * 100}%` }} /></span>
                        <strong>{fmtHours(r.workedMinutes)}h</strong>
                      </div>
                    </td>
                    <td className="num">{r.daysWorked ? fmtDuration(r.workedMinutes / r.daysWorked) : '—'}</td>
                    <td className="num muted">{fmtDuration(r.breakMinutes)} · {fmtDuration(r.lunchMinutes)}</td>
                    <td className="num">{r.lateDays || <span className="muted">0</span>}</td>
                    <td className="num">
                      {r.absentDays || <span className="muted">0</span>}
                      {r.missingClockOuts > 0 && <span className="badge badge-absent" title="Days with no clock-out">{r.missingClockOuts} open</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default ReportsView;
