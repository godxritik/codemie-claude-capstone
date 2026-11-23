import { X } from 'lucide-react';
import { categoryMeta } from '../lib/categoryMeta.js';

export default function TaskRow({ task, index, categories, error, onChange, onRemove, removable }) {
  const invalid = (key) => error?.index === index && error?.key === key;
  return (
    <div className="grid grid-cols-[1fr_72px_100px_110px_32px] items-center gap-2">
      <input
        value={task.title}
        onChange={(e) => onChange(index, { title: e.target.value })}
        placeholder="Task"
        maxLength={100}
        aria-label={`Task ${index + 1} title`}
        aria-invalid={invalid('title')}
        className={cellClass(invalid('title'))}
      />
      <input
        type="number"
        value={task.minutes}
        onChange={(e) => onChange(index, { minutes: e.target.value })}
        min={5}
        max={480}
        step={5}
        aria-label={`Task ${index + 1} minutes`}
        aria-invalid={invalid('minutes')}
        className={cellClass(invalid('minutes'))}
      />
      <select
        value={task.priority}
        onChange={(e) => onChange(index, { priority: e.target.value })}
        aria-label={`Task ${index + 1} priority`}
        className={`${cellClass(false)} [color-scheme:dark]`}
      >
        <option value={1}>High</option>
        <option value={2}>Medium</option>
        <option value={3}>Low</option>
      </select>
      <select
        value={task.category}
        onChange={(e) => onChange(index, { category: e.target.value })}
        aria-label={`Task ${index + 1} category`}
        className={`${cellClass(false)} [color-scheme:dark]`}
      >
        {categories.map((c) => (
          <option key={c} value={c}>{categoryMeta(c).label}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => onRemove(index)}
        disabled={!removable}
        aria-label={`Remove task ${index + 1}`}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-all
          hover:scale-110 hover:bg-rose-500/20 hover:text-rose-300 disabled:opacity-30 disabled:hover:scale-100"
      >
        <X size={15} />
      </button>
    </div>
  );
}

function cellClass(invalid) {
  return `rounded-lg border bg-white/5 px-2 py-1.5 text-sm text-slate-100 outline-none transition-colors
    focus-visible:ring-2 focus-visible:ring-brand-400 ${invalid ? 'border-rose-400/60' : 'border-white/10'}`;
}
