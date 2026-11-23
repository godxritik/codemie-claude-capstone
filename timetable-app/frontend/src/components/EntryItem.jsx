import { useEffect, useRef, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import IconButton from './ui/IconButton.jsx';
import Button from './ui/Button.jsx';
import { categoryMeta } from '../lib/categoryMeta.js';
import { api } from '../lib/api.js';

const toForm = (e) => ({ title: e.title, start: e.start, end: e.end, category: e.category });

export default function EntryItem({ entry, categories, editing, onEdit, onCloseEdit, busy, run, refresh }) {
  const editButtonRef = useRef(null);
  const [form, setForm] = useState(() => toForm(entry));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (editing) setForm(toForm(entry));
    setError(null);
  }, [editing, entry]);

  function closeEdit() {
    setError(null);
    onCloseEdit();
    editButtonRef.current?.focus();
  }

  async function handleSave(e) {
    e.preventDefault();
    const patch = {};
    if (form.title !== entry.title) patch.title = form.title;
    if (form.start !== entry.start) patch.start = form.start;
    if (form.end !== entry.end) patch.end = form.end;
    if (form.category !== entry.category) patch.category = form.category;
    if (Object.keys(patch).length === 0) return closeEdit();
    try {
      await run(() => api.updateEntry(entry.id, patch));
      await refresh();
      closeEdit();
    } catch (err) {
      setError({ message: err.message, field: err.field });
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') closeEdit();
  }

  async function handleDelete() {
    await run(() => api.deleteEntry(entry.id));
    refresh();
  }

  async function handleToggleDone(checked) {
    try {
      await run(() => api.updateEntry(entry.id, { done: checked }));
      refresh();
    } catch (err) {
      setError({ message: err.message });
    }
  }

  const meta = categoryMeta(entry.category);
  const Icon = meta.icon;

  if (editing) {
    return (
      <li className="rounded-xl border border-brand-400/30 bg-white/[0.08] p-4 shadow-lg shadow-black/20 animate-fade-in">
        <form onSubmit={handleSave} onKeyDown={handleKeyDown} className="flex flex-col gap-3">
          {error && (
            <p role="alert" className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {error.message}
            </p>
          )}
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-400">
            Title
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              maxLength={100}
              required
              autoFocus
              aria-invalid={error?.field === 'title'}
              className={fieldClass(error?.field === 'title')}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-400">
              Start
              <input
                type="time"
                value={form.start}
                onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))}
                aria-invalid={error?.field === 'start'}
                className={`${fieldClass(error?.field === 'start')} [color-scheme:dark]`}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-400">
              End <span className="text-slate-500">(24:00 allowed)</span>
              <input
                value={form.end}
                onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))}
                pattern="^([01]\d|2[0-3]):([0-5]\d)|24:00$"
                aria-invalid={error?.field === 'end'}
                className={fieldClass(error?.field === 'end')}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-400">
            Category
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className={`${fieldClass(false)} [color-scheme:dark]`}
            >
              {categories.map((c) => (
                <option key={c} value={c}>{categoryMeta(c).label}</option>
              ))}
            </select>
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={closeEdit}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={busy}>Save</Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li
      className={`flex flex-wrap items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-3
        transition-all duration-150 hover:bg-white/[0.07] ${entry.done ? 'opacity-60' : ''}`}
    >
      <input
        type="checkbox"
        checked={entry.done}
        onChange={(e) => handleToggleDone(e.target.checked)}
        aria-label={`Mark "${entry.title}" done`}
        className="h-5 w-5 shrink-0 rounded-md border-white/20 bg-white/5 accent-brand-500 focus-visible:ring-2 focus-visible:ring-brand-400"
      />
      <span className="w-24 shrink-0 font-mono text-sm text-slate-400">{entry.start}–{entry.end}</span>
      <span className={`min-w-0 flex-1 truncate text-sm font-medium text-slate-100 ${entry.done ? 'line-through' : ''}`}>
        {entry.title}
      </span>
      <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${meta.chip}`}>
        <Icon size={12} /> {meta.label}
      </span>
      <div className="flex gap-1 no-print">
        <IconButton ref={editButtonRef} icon={Pencil} label={`Edit "${entry.title}"`} onClick={onEdit} />
        <IconButton icon={Trash2} label={`Delete "${entry.title}"`} variant="danger" onClick={handleDelete} />
      </div>
    </li>
  );
}

function fieldClass(invalid) {
  return `rounded-lg border bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none transition-colors
    focus-visible:ring-2 focus-visible:ring-brand-400
    ${invalid ? 'border-rose-400/60' : 'border-white/10'}`;
}
