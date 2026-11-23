import { useEffect, useState } from 'react';
import GlassCard from './ui/GlassCard.jsx';
import { categoryMeta } from '../lib/categoryMeta.js';
import { api } from '../lib/api.js';
import { formatDuration } from '../lib/format.js';

export default function CategorySummary({ date, entries }) {
  const [day, setDay] = useState(null);

  useEffect(() => {
    if (entries.length === 0) {
      setDay(null);
      return;
    }
    api.summary(date, date).then((res) => setDay(res.days[0] ?? null)).catch(() => setDay(null));
  }, [date, entries]);

  if (!day || day.categories.length === 0) return null;

  const max = Math.max(...day.categories.map((c) => c.minutes), 1);

  return (
    <GlassCard className="p-5 no-print">
      <h2 className="mb-3 text-base font-semibold text-white">Time by category</h2>
      <p className="mb-3 text-xs text-slate-400">Planned time: {formatDuration(day.totalMinutes)}</p>
      <ul className="flex flex-col gap-2.5">
        {day.categories.map((c) => {
          const meta = categoryMeta(c.category);
          const Icon = meta.icon;
          return (
            <li key={c.category} className="flex items-center gap-3 text-sm">
              <span className={`flex w-24 shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${meta.chip}`}>
                <Icon size={12} /> {meta.label}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${meta.bar} transition-all duration-500`}
                  style={{ width: `${(c.minutes / max) * 100}%` }}
                />
              </div>
              <span className="w-24 shrink-0 text-right text-xs text-slate-400">{c.duration} · {c.share}</span>
            </li>
          );
        })}
      </ul>
    </GlassCard>
  );
}
