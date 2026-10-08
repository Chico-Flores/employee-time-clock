import React, { useMemo, useState } from 'react';
import Icon from './Icon';
import { Avatar, StatusPill, TagChips, EmptyState, ShowMessage, api, usePolling } from './ui';
import {
  STATUS_META, StatusKey, statusFromAction, fmtClock, fmtDuration, parseRecordTime,
  ACTION_LABELS, LOCATIONS, locationOf
} from '../../lib/time';

interface Row {
  avatarUrl?: string | null;
  name: string;
  pin: string;
  tags: string[];
  firstIn: number | null;
  lastOut: number | null;
  late: boolean;
  absent: boolean;
  totals: { worked: number; break: number; lunch: number; restroom: number; meeting: number; itIssue: number };
  lastAction: string | null;
  lastTime: string | null;
  sinceMinutes: number | null;
  staleOpen: boolean;
}

interface Overview {
  now: string;
  nowMinutes: number;
  lateAfterMinutes: number;
  autoClockOut: number | null;
  employees: Row[];
  activity: { name: string; pin: string; action: string; time: string; admin_action: boolean; note?: string }[];
}

type Filter = 'all' | 'onClock' | 'paused' | 'notIn' | 'absent' | 'late';

const rowStatus = (r: Row): StatusKey => {
  if (r.sinceMinutes === null && !r.staleOpen) return r.absent ? 'absent' : 'notIn';
  return statusFromAction(r.lastAction);
};

const ON_CLOCK: StatusKey[] = ['working', 'meeting', 'itIssue'];
const PAUSED: StatusKey[] = ['break', 'lunch', 'restroom'];
const SORT_ORDER: StatusKey[] = ['itIssue', 'lunch', 'break', 'restroom', 'meeting', 'working', 'notIn', 'done', 'absent'];

// How long each paused state may last before it's flagged (minutes)
const LIMITS: { [k in StatusKey]?: number } = { break: 20, restroom: 15, lunch: 65, itIssue: 30 };

const TodayView: React.FC<{ showMessage: ShowMessage }> = ({ showMessage }) => {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [location, setLocation] = useState('');
  const [search, setSearch] = useState('');
  const [busyPin, setBusyPin] = useState<string | null>(null);

  const load = () => {
    api<Overview>('/admin/overview')
      .then(d => { setData(d); setError(''); })
      .catch(e => setError(e.message));
  };
  usePolling(load, 30000);

  const rows = useMemo(() => (data?.employees || []).map(r => {
    const status = rowStatus(r);
    const duration = r.sinceMinutes !== null ? Math.max(0, data!.nowMinutes - r.sinceMinutes) : null;
    const limit = LIMITS[status];
    return { ...r, status, duration, overLimit: !!(limit && duration !== null && duration > limit) };
  }), [data]);

  const counts = useMemo(() => ({
    onClock: rows.filter(r => ON_CLOCK.includes(r.status)).length,
    paused: rows.filter(r => PAUSED.includes(r.status)).length,
    notIn: rows.filter(r => r.status === 'notIn').length,
    absent: rows.filter(r => r.status === 'absent').length,
    late: rows.filter(r => r.late).length,
    done: rows.filter(r => r.status === 'done').length,
    hours: rows.reduce((sum, r) => sum + r.totals.worked, 0)
  }), [rows]);

  const visible = rows
    .filter(r => !location || locationOf(r.tags) === location)
    .filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()))
    .filter(r => {
      switch (filter) {
        case 'onClock': return ON_CLOCK.includes(r.status);
        case 'paused': return PAUSED.includes(r.status);
        case 'notIn': return r.status === 'notIn';
        case 'absent': return r.status === 'absent';
        case 'late': return r.late;
        default: return true;
      }
    })
    .sort((a, b) =>
      Number(b.overLimit) - Number(a.overLimit) ||
      SORT_ORDER.indexOf(a.status) - SORT_ORDER.indexOf(b.status) ||
      a.name.localeCompare(b.name));

  const alerts = useMemo(() => {
    if (!data) return [];
    const list: { tone: string; title: string; text: string }[] = [];
    rows.filter(r => r.staleOpen).forEach(r => list.push({
      tone: 'red', title: `${r.name} never clocked out`, text: `Still "${STATUS_META[statusFromAction(r.lastAction)].label}" since ${r.lastTime}`
    }));
    rows.filter(r => r.overLimit).forEach(r => list.push({
      tone: r.status === 'itIssue' ? 'red' : 'amber',
      title: `${r.name}: ${STATUS_META[r.status].label.toLowerCase()} for ${fmtDuration(r.duration)}`,
      text: `Started at ${fmtClock(r.sinceMinutes)}`
    }));
    const missing = rows.filter(r => r.status === 'notIn');
    const autoOut = data.autoClockOut ?? 24 * 60;
    if (missing.length && data.nowMinutes > data.lateAfterMinutes && data.nowMinutes < autoOut) {
      list.push({
        tone: 'slate',
        title: `${missing.length} not clocked in yet`,
        text: missing.map(r => r.name).join(', ')
      });
    }
    const late = rows.filter(r => r.late);
    if (late.length) {
      list.push({
        tone: 'blue',
        title: `${late.length} late arrival${late.length > 1 ? 's' : ''} today`,
        text: late.map(r => `${r.name} (${fmtClock(r.firstIn)})`).join(', ')
      });
    }
    return list;
  }, [rows, data]);

  const clockOut = async (r: Row) => {
    const note = window.prompt(`Clock out ${r.name}? Add an optional note:`, '');
    if (note === null) return;
    setBusyPin(r.pin);
    try {
      await api('/manual-clock-out', { method: 'POST', body: JSON.stringify({ pin: r.pin, note }) });
      showMessage(`${r.name} clocked out`, 'success');
      load();
    } catch (e: any) {
      showMessage(e.message, 'error');
    } finally {
      setBusyPin(null);
    }
  };

  const markAbsent = async (r: Row) => {
    if (!data || !window.confirm(`Mark ${r.name} absent today? This posts an absence alert to Discord.`)) return;
    setBusyPin(r.pin);
    try {
      await api('/mark-absent', { method: 'POST', body: JSON.stringify({ pin: r.pin, date: data.now, force: true }) });
      showMessage(`${r.name} marked absent`, 'success');
      load();
    } catch (e: any) {
      showMessage(e.message, 'error');
    } finally {
      setBusyPin(null);
    }
  };

  const clockOutAll = async () => {
    const targets = rows.filter(r => !['notIn', 'done', 'absent'].includes(r.status));
    if (!targets.length || !window.confirm(`Clock out all ${targets.length} agents who are still on the clock?`)) return;
    const results = await Promise.allSettled(targets.map(r =>
      api('/manual-clock-out', { method: 'POST', body: JSON.stringify({ pin: r.pin, note: 'Bulk clock-out by admin' }) })));
    const failed = results.filter(x => x.status === 'rejected').length;
    showMessage(failed ? `${targets.length - failed} clocked out, ${failed} failed` : `Clocked out ${targets.length} agents`, failed ? 'warning' : 'success');
    load();
  };

  if (error && !data) return <div className="card"><EmptyState icon="⚠️" title="Couldn't load today's data" text={error} /></div>;
  if (!data) return <div className="card"><div className="skeleton" /></div>;

  const tiles: { key: Filter; label: string; value: number | string; tone: string; sub?: string }[] = [
    { key: 'onClock', label: 'On the clock', value: counts.onClock, tone: 'green', sub: `${counts.done} done for the day` },
    { key: 'paused', label: 'On break / lunch', value: counts.paused, tone: 'amber' },
    { key: 'notIn', label: 'Not in yet', value: counts.notIn, tone: 'slate' },
    { key: 'late', label: 'Late today', value: counts.late, tone: 'blue', sub: `after ${fmtClock(data.lateAfterMinutes)}` },
    { key: 'absent', label: 'Absent', value: counts.absent, tone: 'red' },
    { key: 'all', label: 'Hours today', value: `${(counts.hours / 60).toFixed(1)}h`, tone: 'violet', sub: `${rows.length} active agents` }
  ];

  return (
    <div className="today">
      <div className="kpi-grid">
        {tiles.map(t => (
          <button
            key={t.label}
            className={`kpi tone-${t.tone} ${filter === t.key && t.key !== 'all' ? 'selected' : ''}`}
            onClick={() => setFilter(filter === t.key ? 'all' : t.key)}
          >
            <span className="kpi-label">{t.label}</span>
            <span className="kpi-value">{t.value}</span>
            {t.sub && <span className="kpi-sub">{t.sub}</span>}
          </button>
        ))}
      </div>

      <div className="today-grid">
        <section className="card roster-card">
          <div className="card-head">
            <div>
              <h2>Live roster</h2>
              <p className="muted">
                {filter === 'all' ? 'Everyone' : tiles.find(t => t.key === filter)?.label} · {visible.length} shown
                {filter !== 'all' && <button className="link-btn" onClick={() => setFilter('all')}>Show all</button>}
              </p>
            </div>
            <div className="card-actions">
              <div className="search">
                <Icon name="search" size={16} />
                <input placeholder="Search agents" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              {counts.onClock + counts.paused > 0 && (
                <button className="btn btn-ghost" onClick={clockOutAll}>Clock out all</button>
              )}
            </div>
          </div>

          <div className="chip-row">
            <button className={`chip ${!location ? 'active' : ''}`} onClick={() => setLocation('')}>All locations</button>
            {LOCATIONS.filter(l => rows.some(r => locationOf(r.tags) === l.key)).map(l => (
              <button key={l.key} className={`chip ${location === l.key ? 'active' : ''}`} onClick={() => setLocation(location === l.key ? '' : l.key)}>
                {l.label} <span className="chip-count">{rows.filter(r => locationOf(r.tags) === l.key).length}</span>
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <EmptyState icon="🔍" title="No one matches" text="Try a different filter or search." />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Status</th>
                    <th>Clocked in</th>
                    <th className="num">On the clock</th>
                    <th className="num">Break · Lunch</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visible.map(r => (
                    <tr key={r.pin} className={r.overLimit || r.staleOpen ? 'row-alert' : ''}>
                      <td>
                        <div className="agent-cell">
                          <Avatar name={r.name} tags={r.tags} url={r.avatarUrl} />
                          <div>
                            <div className="agent-name">{r.name}</div>
                            <TagChips tags={r.tags} skipLocation />
                          </div>
                        </div>
                      </td>
                      <td>
                        <StatusPill
                          status={r.status}
                          detail={r.duration !== null && !['done', 'absent', 'notIn'].includes(r.status) ? fmtDuration(r.duration) : undefined}
                        />
                      </td>
                      <td>
                        {r.firstIn !== null ? fmtClock(r.firstIn) : <span className="muted">—</span>}
                        {r.late && <span className="badge badge-late">Late</span>}
                      </td>
                      <td className="num strong">{r.totals.worked ? fmtDuration(r.totals.worked) : <span className="muted">—</span>}</td>
                      <td className="num muted">
                        {r.firstIn !== null ? `${fmtDuration(r.totals.break + r.totals.restroom)} · ${fmtDuration(r.totals.lunch)}` : '—'}
                      </td>
                      <td className="row-actions">
                        {!['notIn', 'done', 'absent'].includes(r.status) && (
                          <button className="btn btn-sm btn-ghost" disabled={busyPin === r.pin} onClick={() => clockOut(r)}>Clock out</button>
                        )}
                        {r.status === 'notIn' && (
                          <button className="btn btn-sm btn-ghost" disabled={busyPin === r.pin} onClick={() => markAbsent(r)}>Mark absent</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="today-side">
          <section className="card">
            <div className="card-head"><h2><Icon name="alert" size={18} /> Needs attention</h2></div>
            {alerts.length === 0 ? (
              <EmptyState icon="✅" title="All clear" text="No long breaks, missed clock-outs or IT issues." />
            ) : (
              <ul className="alert-list">
                {alerts.map((a, i) => (
                  <li key={i} className={`alert-item tone-${a.tone}`}>
                    <div className="alert-title">{a.title}</div>
                    <div className="alert-text">{a.text}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <div className="card-head"><h2><Icon name="activity" size={18} /> Activity</h2></div>
            {data.activity.length === 0 ? (
              <EmptyState icon="🌙" title="Quiet so far" text="Clock-ins will show up here." />
            ) : (
              <ul className="feed">
                {data.activity.map((a, i) => (
                  <li key={i} className="feed-item">
                    <span className={`feed-dot tone-${STATUS_META[statusFromAction(a.action)].tone}`} />
                    <div className="feed-body">
                      <span className="strong">{a.name}</span> {(ACTION_LABELS[a.action] || a.action).toLowerCase()}
                      {a.admin_action && <span className="badge">admin</span>}
                      {a.note && <div className="muted small">{a.note}</div>}
                    </div>
                    <span className="feed-time">{fmtClock(parseRecordTime(a.time)?.minutes)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
};

export default TodayView;
