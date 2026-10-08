import React, { useEffect } from 'react';
import Icon from './Icon';
import { STATUS_META, StatusKey, initials, locationOf } from '../../lib/time';

export type MessageType = 'success' | 'error' | 'warning' | 'info';
export type ShowMessage = (text: string, type: MessageType) => void;

export const Avatar: React.FC<{ name: string; tags?: string[]; url?: string | null }> = ({ name, tags = [], url }) => (
  url
    ? <img className="avatar avatar-photo" src={url} alt="" loading="lazy" />
    : <span className={`avatar loc-${locationOf(tags) || 'none'}`}>{initials(name)}</span>
);

export const LocationBadge: React.FC<{ tags?: string[] }> = ({ tags = [] }) => {
  const loc = locationOf(tags);
  return loc ? <span className={`loc-badge loc-${loc}`}>{loc}</span> : null;
};

export const TagChips: React.FC<{ tags?: string[]; skipLocation?: boolean }> = ({ tags = [], skipLocation }) => (
  <span className="tag-chips">
    {tags
      .filter(t => !skipLocation || !['PH', 'TJ', 'MX', 'EG', 'RS'].includes(t))
      .map(t => <span key={t} className={`tag-chip tag-${t.replace(/\s+/g, '-').toLowerCase()}`}>{t}</span>)}
  </span>
);

export const StatusPill: React.FC<{ status: StatusKey; detail?: string }> = ({ status, detail }) => {
  const meta = STATUS_META[status];
  return (
    <span className={`status-pill tone-${meta.tone}`}>
      <span className="status-dot" />
      {meta.label}
      {detail && <span className="status-pill-detail">{detail}</span>}
    </span>
  );
};

export const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }> = ({
  title, onClose, children, footer
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
};

export const EmptyState: React.FC<{ icon?: string; title: string; text?: string }> = ({ icon = '✨', title, text }) => (
  <div className="empty-state">
    <div className="empty-icon">{icon}</div>
    <div className="empty-title">{title}</div>
    {text && <div className="empty-text">{text}</div>}
  </div>
);

// Small JSON helper with error messages from the API
export async function api<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json', ...(options.headers || {}) } : options.headers
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error: any = new Error(data.error || data.warning || `Request failed (${response.status})`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data as T;
}

// Re-poll while the tab is visible
export function usePolling(fn: () => void, ms: number, deps: React.DependencyList = []) {
  useEffect(() => {
    fn();
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') fn();
    }, ms);
    const onVisible = () => document.visibilityState === 'visible' && fn();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export const downloadCsv = (filename: string, rows: (string | number)[][]) => {
  const csv = rows
    .map(r => r.map(v => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','))
    .join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
