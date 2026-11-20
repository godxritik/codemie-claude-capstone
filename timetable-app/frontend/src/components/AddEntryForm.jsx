import { useState } from 'react';
import { Plus } from 'lucide-react';
import GlassCard from './ui/GlassCard.jsx';
import Button from './ui/Button.jsx';
import { categoryMeta } from '../lib/categoryMeta.js';
import { api } from '../lib/api.js';

const EMPTY = { title: '', start: '', end: '', category: 'general' };

export default function AddEntryForm({ date, categories, busy, run, refresh }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      await run(() => api.createEntry({ date, ...form }), { success: 'Entry added.' });
      setForm((f) => ({ ...EMPTY, category: f.category }));
      setError(null);
      refresh();
    } catch (err) {
      setError({ message: err.message, field: err.field });
    }
  }

  return (
    <GlassCard className="p-5">
      <h2 className="mb-3 text-base font-semibold text-white">Add entry</h2>
      {error && (
        <p role="alert" className="mb-3 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error.message}
        </p>
      )}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-400">
          Title
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            maxLength={100}
            required
            aria-invalid={error?.field === 'title'}
            className={inputClass(error?.field === 'title')}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-400">
            Start
            <input
              type="time"
              value={form.start}
              onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))}
              required
              aria-invalid={error?.field === 'start'}
              className={`${inputClass(error?.field === 'start')} [color-scheme:dark]`}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-400">
            End
            <input
              type="time"
              value={form.end}
              onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))}
              required
              aria-invalid={error?.field === 'end'}
              className={`${inputClass(error?.field === 'end')} [color-scheme:dark]`}
            />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-400">
          Category
          <select
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            className={`${inputClass(false)} [color-scheme:dark]`}
          >
            {categories.map((c) => (
              <option key={c} value={c}>{categoryMeta(c).label}</option>
            ))}
          </select>
        </label>
        <Button type="submit" disabled={busy} className="mt-1 self-start">
          <Plus size={16} /> Add entry
        </Button>
      </form>
    </GlassCard>
  );
}

function inputClass(invalid) {
  return `rounded-lg border bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none transition-colors
    focus-visible:ring-2 focus-visible:ring-brand-400
    ${invalid ? 'border-rose-400/60' : 'border-white/10'}`;
}
