import React, { useEffect, useMemo, useState } from 'react';
import Icon from './Icon';
import { Avatar, LocationBadge, TagChips, Modal, EmptyState, ShowMessage, api, downloadCsv } from './ui';
import { EMPLOYEE_TAG_OPTIONS } from '../../config/employeeTags';
import { LOCATIONS, locationOf, roleOf } from '../../lib/time';
import { prepareAvatar } from '../../lib/image';

interface Agent {
  name: string;
  pin: string;
  tags: string[];
  active: boolean;
  avatarUrl: string | null;
  discordId: string | null;
}

const TAG_LABELS = EMPLOYEE_TAG_OPTIONS.map(t => t.label);

const TagPicker: React.FC<{ value: string[]; onChange: (tags: string[]) => void }> = ({ value, onChange }) => (
  <div className="tag-picker">
    {TAG_LABELS.map(tag => {
      const on = value.includes(tag);
      return (
        <button
          type="button"
          key={tag}
          className={`chip ${on ? 'active' : ''}`}
          onClick={() => onChange(on ? value.filter(t => t !== tag) : [...value, tag])}
        >
          {on && <Icon name="check" size={13} />} {tag}
        </button>
      );
    })}
  </div>
);

const AgentsView: React.FC<{ showMessage: ShowMessage; addRequested: number }> = ({ showMessage, addRequested }) => {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState('');
  const [role, setRole] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [editing, setEditing] = useState<Agent | null>(null);
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editDiscord, setEditDiscord] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', pin: '', tags: [] as string[] });
  const [saving, setSaving] = useState(false);

  const load = () => api<any[]>('/get-users', { method: 'POST' })
    .then(users => setAgents(users
      .filter(u => !u.username && u.pin && u.name)
      .map(u => ({ name: u.name, pin: u.pin, tags: u.tags || [], active: u.active !== false, avatarUrl: u.avatarUrl || null, discordId: u.discordId || null }))
      .sort((a, b) => a.name.localeCompare(b.name))))
    .catch(e => showMessage(e.message, 'error'));

  useEffect(() => { load(); }, []);
  useEffect(() => { if (addRequested) openAdd(); }, [addRequested]);

  const openAdd = () => {
    setForm({ name: '', pin: '', tags: [] });
    setAdding(true);
  };

  const generatePin = () => {
    const used = new Set((agents || []).map(a => a.pin));
    let pin = '';
    do {
      pin = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    } while (used.has(pin) || new Set(pin).size <= 2 || '0123456789'.includes(pin) || '9876543210'.includes(pin));
    setForm(f => ({ ...f, pin }));
  };

  const saveNew = async () => {
    if (form.name.trim().length < 2) return showMessage('Name must be at least 2 characters', 'error');
    if (!/^\d{4}$/.test(form.pin)) return showMessage('PIN must be exactly 4 digits', 'error');
    setSaving(true);
    try {
      await api('/add-employee', { method: 'POST', body: JSON.stringify({ name: form.name.trim(), pin: form.pin }) });
      if (form.tags.length) {
        await api('/update-employee-tags', { method: 'POST', body: JSON.stringify({ pin: form.pin, tags: form.tags }) });
      }
      showMessage(`${form.name.trim()} added with PIN ${form.pin}`, 'success');
      setAdding(false);
      load();
    } catch (e: any) {
      showMessage(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveTags = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await api('/update-employee-tags', { method: 'POST', body: JSON.stringify({ pin: editing.pin, tags: editTags }) });
      if ((editing.discordId || '') !== editDiscord.trim()) {
        await api('/admin/agent-profile', { method: 'POST', body: JSON.stringify({ pin: editing.pin, discordId: editDiscord.trim() }) });
      }
      showMessage(`Updated ${editing.name}`, 'success');
      setEditing(null);
      load();
    } catch (e: any) {
      showMessage(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (agent: Agent) => {
    setEditing(agent);
    setEditTags(agent.tags);
    setEditDiscord(agent.discordId || '');
  };

  const changePhoto = async (file?: File, remove = false) => {
    if (!editing || (!file && !remove)) return;
    setPhotoBusy(true);
    try {
      const body = remove ? { pin: editing.pin, remove: true } : { pin: editing.pin, image: await prepareAvatar(file!) };
      const { avatarUrl } = await api<{ avatarUrl: string | null }>('/admin/agent-avatar', { method: 'POST', body: JSON.stringify(body) });
      setEditing({ ...editing, avatarUrl });
      setAgents(list => (list || []).map(a => a.pin === editing.pin ? { ...a, avatarUrl } : a));
      showMessage(remove ? 'Photo removed' : 'Photo updated', 'success');
    } catch (e: any) {
      showMessage(e.message, 'error');
    } finally {
      setPhotoBusy(false);
    }
  };

  const toggleActive = async (agent: Agent) => {
    const active = !agent.active;
    if (!active && !window.confirm(`Deactivate ${agent.name}? They won't be able to clock in. History is kept and you can reactivate any time.`)) return;
    try {
      await api('/set-employee-active', { method: 'POST', body: JSON.stringify({ pin: agent.pin, active }) });
      setAgents(list => (list || []).map(a => a.pin === agent.pin ? { ...a, active } : a));
      showMessage(`${agent.name} ${active ? 'reactivated' : 'deactivated'}`, 'success');
    } catch (e: any) {
      showMessage(e.message, 'error');
    }
  };

  const remove = async (agent: Agent) => {
    const typed = window.prompt(`Permanently delete ${agent.name}? Time records are kept, but the agent can't be restored.\n\nType the name to confirm:`);
    if (typed === null) return;
    if (typed.trim().toLowerCase() !== agent.name.toLowerCase()) return showMessage('Name did not match. Nothing deleted.', 'warning');
    try {
      await api('/delete-employee', { method: 'POST', body: JSON.stringify({ pin: agent.pin }) });
      showMessage(`${agent.name} deleted`, 'success');
      setEditing(null);
      load();
    } catch (e: any) {
      showMessage(e.message, 'error');
    }
  };

  const list = agents || [];
  const visible = useMemo(() => list
    .filter(a => showInactive || a.active)
    .filter(a => !location || locationOf(a.tags) === location)
    .filter(a => !role || roleOf(a.tags) === role)
    .filter(a => !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.pin.includes(search)),
  [list, showInactive, location, role, search]);

  const activeCount = list.filter(a => a.active).length;

  const exportRoster = () => downloadCsv('agents.csv', [
    ['Name', 'PIN', 'Location', 'Role', 'Tags', 'Active'],
    ...visible.map(a => [a.name, a.pin, locationOf(a.tags), roleOf(a.tags), a.tags.join('; '), a.active ? 'yes' : 'no'])
  ]);

  return (
    <div className="agents">
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Agents</h2>
            <p className="muted">{activeCount} active · {list.length - activeCount} inactive</p>
          </div>
          <div className="card-actions">
            <div className="search">
              <Icon name="search" size={16} />
              <input placeholder="Search name or PIN" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <button className="btn btn-ghost" onClick={exportRoster}><Icon name="download" size={16} /> Export</button>
            <button className="btn btn-primary" onClick={openAdd}><Icon name="plus" size={16} /> Add agent</button>
          </div>
        </div>

        <div className="chip-row">
          <button className={`chip ${!location ? 'active' : ''}`} onClick={() => setLocation('')}>All locations</button>
          {LOCATIONS.map(l => (
            <button key={l.key} className={`chip ${location === l.key ? 'active' : ''}`} onClick={() => setLocation(location === l.key ? '' : l.key)}>{l.label}</button>
          ))}
          <span className="chip-sep" />
          {['Closer', 'Jr Closer', 'Dialer', 'Admin'].map(r => (
            <button key={r} className={`chip ${role === r ? 'active' : ''}`} onClick={() => setRole(role === r ? '' : r)}>{r}</button>
          ))}
          <label className="switch-label">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
            <span className="switch" /> Show inactive
          </label>
        </div>

        {!agents ? <div className="skeleton" /> : visible.length === 0 ? (
          <EmptyState icon="👥" title="No agents match" text="Adjust the filters or add a new agent." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>PIN</th>
                  <th>Location</th>
                  <th>Tags</th>
                  <th>Active</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map(a => (
                  <tr key={a.pin} className={a.active ? '' : 'row-muted'}>
                    <td>
                      <div className="agent-cell">
                        <Avatar name={a.name} tags={a.tags} url={a.avatarUrl} />
                        <div>
                          <div className="agent-name">{a.name}</div>
                          <div className="muted small">{roleOf(a.tags) || '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <button className="pin-reveal" onClick={() => setRevealed(revealed === a.pin ? null : a.pin)} title="Show PIN">
                        {revealed === a.pin ? a.pin : '••••'} <Icon name="eye" size={14} />
                      </button>
                    </td>
                    <td><LocationBadge tags={a.tags} /></td>
                    <td><TagChips tags={a.tags} skipLocation /></td>
                    <td>
                      <label className="switch-label">
                        <input type="checkbox" checked={a.active} onChange={() => toggleActive(a)} />
                        <span className="switch" />
                      </label>
                    </td>
                    <td className="row-actions">
                      <button className="icon-btn" title="Edit agent" onClick={() => openEdit(a)}>
                        <Icon name="edit" size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {adding && (
        <Modal
          title="Add agent"
          onClose={() => setAdding(false)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={saving} onClick={saveNew}>{saving ? 'Saving…' : 'Add agent'}</button>
          </>}
        >
          <label className="field">
            <span>Name or initials</span>
            <input autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. JDC" />
          </label>
          <label className="field">
            <span>4-digit PIN</span>
            <div className="field-row">
              <input
                inputMode="numeric"
                maxLength={4}
                value={form.pin}
                onChange={e => setForm({ ...form, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                placeholder="0000"
              />
              <button type="button" className="btn btn-ghost" onClick={generatePin}>Generate</button>
            </div>
          </label>
          <div className="field">
            <span>Tags</span>
            <TagPicker value={form.tags} onChange={tags => setForm({ ...form, tags })} />
          </div>
        </Modal>
      )}

      {editing && (
        <Modal
          title={`Edit ${editing.name}`}
          onClose={() => setEditing(null)}
          footer={<>
            <button className="btn btn-danger-ghost" onClick={() => remove(editing)}><Icon name="trash" size={16} /> Delete</button>
            <span className="spacer" />
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={saving} onClick={saveTags}>{saving ? 'Saving…' : 'Save'}</button>
          </>}
        >
          <div className="photo-row">
            <Avatar name={editing.name} tags={editing.tags} url={editing.avatarUrl} />
            <div className="photo-row-actions">
              <label className={`btn btn-ghost btn-sm ${photoBusy ? 'disabled' : ''}`}>
                {editing.avatarUrl ? 'Change photo' : 'Upload photo'}
                <input type="file" accept="image/*" hidden disabled={photoBusy} onChange={e => changePhoto(e.target.files?.[0])} />
              </label>
              {editing.avatarUrl && <button className="btn btn-ghost btn-sm" disabled={photoBusy} onClick={() => changePhoto(undefined, true)}>Remove</button>}
              <span className="muted small">Agents can also add their own photo on the clock-in screen.</span>
            </div>
          </div>
          <div className="field">
            <span>Tags</span>
            <TagPicker value={editTags} onChange={setEditTags} />
          </div>
          <label className="field">
            <span>Discord user ID <span className="muted small">(optional)</span></span>
            <input
              inputMode="numeric"
              value={editDiscord}
              onChange={e => setEditDiscord(e.target.value.replace(/\D/g, ''))}
              placeholder="e.g. 123456789012345678"
            />
            <span className="muted small">In Discord: Settings → Advanced → Developer Mode, then right-click the person → Copy User ID. Shows their Discord name on clock-in messages.</span>
          </label>
          <p className="muted small">PIN {editing.pin} · {editing.active ? 'Active' : 'Inactive'}</p>
        </Modal>
      )}
    </div>
  );
};

export default AgentsView;
