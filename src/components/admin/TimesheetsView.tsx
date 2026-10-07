import React, { useEffect, useMemo, useState } from 'react';
import Icon from './Icon';
import { Avatar, TagChips, EmptyState, ShowMessage, api } from './ui';
import {
  fmtClock, fmtDuration, parseRecordTime, todayIso, shiftIso, isoLabel, ACTION_LABELS, LOCATIONS, locationOf
} from '../../lib/time';

interface DayRow {
  name: string;
  pin: string;
  tags: string[];
  active: boolean;
  firstIn: number | null;
  lastOut: number | null;
  late: boolean;
  absent: boolean;
  openAtEnd: boolean;
  totals: { worked: number; break: number; lunch: number; restroom: number; meeting: number; itIssue: number };
  events: { action: string; time: string; admin_action: boolean; note?: string }[];
}

type SegmentType = 'work' | 'break' | 'lunch' | 'restroom' | 'meeting' | 'itIssue';
const PAUSE_TYPE: { [a: string]: SegmentType } = {
  StartBreak: 'break', StartLunch: 'lunch', StartRestroom: 'restroom', StartMeeting: 'meeting', StartItIssue: 'itIssue'
};

const buildSegments = (events: DayRow['events'], end: number | null) => {
  const segs: { type: SegmentType; start: number; end: number; open?: boolean }[] = [];
  let current: { type: SegmentType; start: number } | null = null;
  let last: number | null = null;
  for (const e of events) {
    const t = parseRecordTime(e.time)?.minutes;
    if (t === undefined || e.action === 'Absent') continue;
    last = t;
    if (current) segs.push({ ...current, end: t });
    if (e.action === 'ClockOut') current = null;
    else if (PAUSE_TYPE[e.action]) current = { type: PAUSE_TYPE[e.action], start: t };
    else current = { type: 'work', start: t };
  }
  const stop = end ?? last;
  if (current && stop !== null) segs.push({ ...current, end: Math.max(stop, current.start), open: true });
  return segs;
};

const Timeline: React.FC<{ row: DayRow; end: number | null }> = ({ row, end }) => {
  const segs = buildSegments(row.events, end);
  if (!segs.length) return null;
  const from = Math.min(6 * 60, ...segs.map(s => s.start));
  const to = Math.max(18 * 60, ...segs.map(s => s.end));
  const pct = (m: number) => ((m - from) / (to - from)) * 100;
  const hours: number[] = [];
  for (let h = Math.ceil(from / 60); h <= Math.floor(to / 60); h += 2) hours.push(h * 60);
  return (
    <div className="timeline">
      <div className="timeline-track">
        {segs.map((s, i) => (
          <span
            key={i}
            className={`timeline-seg seg-${s.type} ${s.open ? 'open' : ''}`}
            style={{ left: `${pct(s.start)}%`, width: `${Math.max(0.4, pct(s.end) - pct(s.start))}%` }}
            title={`${s.type === 'work' ? 'Working' : s.type} ${fmtClock(s.start)}–${s.open ? 'now' : fmtClock(s.end)} (${fmtDuration(s.end - s.start)})`}
          />
        ))}
      </div>
      <div className="timeline-axis">
        {hours.map(h => <span key={h} style={{ left: `${pct(h)}%` }}>{fmtClock(h).replace(':00', '')}</span>)}
      </div>
    </div>
  );
};

const TimesheetsView: React.FC<{ showMessage: ShowMessage }> = ({ showMessage }) => {
  const [date, setDate] = useState(todayIso());
  const [rows, setRows] = useState<DayRow[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [location, setLocation] = useState('');
  const [onlyActivity, setOnlyActivity] = useState(true);

  const load = () => {
    setRows(null);
    api<{ employees: DayRow[] }>(`/admin/day?date=${date}`)
      .then(d => setRows(d.employees))
      .catch(e => showMessage(e.message, 'error'));
  };
  useEffect(load, [date]);

  const isToday = date === todayIso();
  const nowMinutes = (() => {
    const n = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
    return n.getHours() * 60 + n.getMinutes();
  })();

  const visible = useMemo(() => (rows || [])
    .filter(r => !location || locationOf(r.tags) === location)
    .filter(r => !onlyActivity || r.events.length)
    .sort((a, b) => (a.firstIn ?? 9999) - (b.firstIn ?? 9999) || a.name.localeCompare(b.name)), [rows, location, onlyActivity]);

  const totals = useMemo(() => {
    const r = rows || [];
    return {
      present: r.filter(x => x.firstIn !== null).length,
      hours: r.reduce((s, x) => s + x.totals.worked, 0),
      late: r.filter(x => x.late).length,
      absent: r.filter(x => x.absent).length,
      open: r.filter(x => x.openAtEnd && !isToday).length
    };
  }, [rows, isToday]);

  const markAbsent = async (r: DayRow) => {
    if (!window.confirm(`Mark ${r.name} absent on ${isoLabel(date)}? This posts an absence alert to Discord.`)) return;
    const [y, m, d] = date.split('-');
    try {
      await api('/mark-absent', { method: 'POST', body: JSON.stringify({ pin: r.pin, date: `${m}/${d}/${y}, 08:00:00 AM`, force: true }) });
      showMessage(`${r.name} marked absent`, 'success');
      load();
    } catch (e: any) {
      showMessage(e.message, 'error');
    }
  };

  return (
    <div className="timesheets">
      <section className="card">
        <div className="card-head">
          <div className="date-nav">
            <button className="icon-btn" onClick={() => setDate(shiftIso(date, -1))} aria-label="Previous day"><Icon name="left" /></button>
            <div className="date-nav-label">
              <h2>{isoLabel(date)}</h2>
              <input type="date" value={date} max={todayIso()} onChange={e => e.target.value && setDate(e.target.value)} />
            </div>
            <button className="icon-btn" disabled={isToday} onClick={() => setDate(shiftIso(date, 1))} aria-label="Next day"><Icon name="right" /></button>
            {!isToday && <button className="btn btn-ghost btn-sm" onClick={() => setDate(todayIso())}>Today</button>}
          </div>
          <div className="mini-stats">
            <span><strong>{totals.present}</strong> worked</span>
            <span><strong>{fmtDuration(totals.hours)}</strong> total</span>
            <span><strong>{totals.late}</strong> late</span>
            <span><strong>{totals.absent}</strong> absent</span>
            {totals.open > 0 && <span className="text-red"><strong>{totals.open}</strong> missing clock-out</span>}
          </div>
        </div>

        <div className="chip-row">
          <button className={`chip ${!location ? 'active' : ''}`} onClick={() => setLocation('')}>All locations</button>
          {LOCATIONS.map(l => (
            <button key={l.key} className={`chip ${location === l.key ? 'active' : ''}`} onClick={() => setLocation(location === l.key ? '' : l.key)}>{l.label}</button>
          ))}
          <label className="switch-label">
            <input type="checkbox" checked={!onlyActivity} onChange={e => setOnlyActivity(!e.target.checked)} />
            <span className="switch" /> Include agents with no activity
          </label>
          <span className="legend">
            <i className="seg-work" /> Working <i className="seg-break" /> Break <i className="seg-lunch" /> Lunch <i className="seg-meeting" /> Meeting <i className="seg-itIssue" /> IT
          </span>
        </div>

        {!rows ? <div className="skeleton" /> : visible.length === 0 ? (
          <EmptyState icon="🗓️" title="No activity on this day" text="Pick another date or include agents with no activity." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>In</th>
                  <th>Out</th>
                  <th className="num">Worked</th>
                  <th className="num">Break</th>
                  <th className="num">Lunch</th>
                  <th>Flags</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map(r => (
                  <React.Fragment key={r.pin}>
                    <tr className="row-click" onClick={() => setExpanded(expanded === r.pin ? null : r.pin)}>
                      <td>
                        <div className="agent-cell">
                          <Avatar name={r.name} tags={r.tags} />
                          <div>
                            <div className="agent-name">{r.name}</div>
                            <TagChips tags={r.tags} />
                          </div>
                        </div>
                      </td>
                      <td>{fmtClock(r.firstIn)}</td>
                      <td>{r.openAtEnd ? (isToday ? <span className="muted">On shift</span> : <span className="text-red">Missing</span>) : fmtClock(r.lastOut)}</td>
                      <td className="num strong">{r.totals.worked ? fmtDuration(r.totals.worked) : '—'}</td>
                      <td className="num">{fmtDuration(r.totals.break + r.totals.restroom)}</td>
                      <td className="num">{fmtDuration(r.totals.lunch)}</td>
                      <td>
                        {r.late && <span className="badge badge-late">Late</span>}
                        {r.absent && <span className="badge badge-absent">Absent</span>}
                        {!r.active && <span className="badge">Inactive</span>}
                      </td>
                      <td className="row-actions">
                        {!r.events.length && (
                          <button className="btn btn-sm btn-ghost" onClick={(e) => { e.stopPropagation(); markAbsent(r); }}>Mark absent</button>
                        )}
                        {r.events.length > 0 && <span className={`chevron ${expanded === r.pin ? 'open' : ''}`}><Icon name="down" size={16} /></span>}
                      </td>
                    </tr>
                    {expanded === r.pin && r.events.length > 0 && (
                      <tr className="row-detail">
                        <td colSpan={8}>
                          <Timeline row={r} end={isToday ? nowMinutes : null} />
                          <ol className="event-list">
                            {r.events.map((e, i) => (
                              <li key={i}>
                                <span className="event-time">{fmtClock(parseRecordTime(e.time)?.minutes)}</span>
                                <span>{ACTION_LABELS[e.action] || e.action}</span>
                                {e.admin_action && <span className="badge">admin</span>}
                                {e.note && <span className="muted small">{e.note}</span>}
                              </li>
                            ))}
                          </ol>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default TimesheetsView;
