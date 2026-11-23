import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import GlassCard from './ui/GlassCard.jsx';
import Button from './ui/Button.jsx';
import { api } from '../lib/api.js';
import { weekDates, addDays, toISODate, formatDayLabel } from '../lib/dateUtils.js';
import { formatDuration } from '../lib/format.js';

export default function WeekView({ date, onSelectDate, notifyError }) {
  const [days, setDays] = useState([]);
  const dates = weekDates(date);
  const [weekStart, weekEnd] = [dates[0], dates[6]];
  const today = toISODate(new Date());

  useEffect(() => {
    api.summary(weekStart, weekEnd).then((res) => setDays(res.days)).catch(notifyError);
  }, [weekStart, weekEnd, notifyError]);

  function shiftWeek(delta) {
    onSelectDate(addDays(weekStart, delta * 7));
  }

  return (
    <GlassCard className="p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Week overview</h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" className="px-2" aria-label="Previous week" onClick={() => shiftWeek(-1)}>
            <ChevronLeft size={16} />
          </Button>
          <Button variant="ghost" className="px-2" aria-label="Next week" onClick={() => shiftWeek(1)}>
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-7">
        {dates.map((d) => {
          const info = days.find((x) => x.date === d) ?? { count: 0, minutes: 0, done: 0 };
          const isToday = d === today;
          const isSelected = d === date;
          return (
            <button
              key={d}
              type="button"
              onClick={() => onSelectDate(d)}
              aria-pressed={isSelected}
              className={`flex flex-col gap-1 rounded-xl border p-3 text-left transition-all duration-150 hover:scale-[1.03] hover:bg-white/10
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400
                ${isSelected ? 'border-brand-400/60 bg-brand-500/15' : 'border-white/10 bg-white/[0.03]'}`}
            >
              <span className="text-xs font-medium text-slate-400">
                {formatDayLabel(d)} {isToday && <span className="text-brand-300">· Today</span>}
              </span>
              <span className="text-lg font-semibold text-white">{info.count}</span>
              <span className="text-xs text-slate-400">{info.count === 1 ? 'entry' : 'entries'} · {formatDuration(info.minutes)}</span>
              <span className="text-xs text-slate-500">{info.done}/{info.count} done</span>
            </button>
          );
        })}
      </div>
    </GlassCard>
  );
}
