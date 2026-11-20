// Pure helpers for the week overview and time-by-category summary (no I/O).

/** Minutes as "1h 30m", "2h", "45m" or "0m". */
export function formatDuration(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Whole-percent share label; non-zero shares under 1% show as "<1%". */
export function shareLabel(minutes, total) {
  if (!total || !minutes) return '0%';
  const pct = (minutes / total) * 100;
  return pct < 1 ? '<1%' : `${Math.round(pct)}%`;
}

/**
 * Per-day figures from grouped rows ({date, category, minutes, done, count}).
 * Count/minutes/done exclude breaks (like the progress indicator); the category list includes them.
 * @param {string[]} dates every day of the range, in order
 */
export function buildSummary(dates, rows) {
  return dates.map((date) => {
    const mine = rows.filter((r) => r.date === date);
    const tasks = mine.filter((r) => r.category !== 'break');
    const total = mine.reduce((a, r) => a + r.minutes, 0);
    return {
      date,
      count: tasks.reduce((a, r) => a + r.count, 0),
      minutes: tasks.reduce((a, r) => a + r.minutes, 0),
      done: tasks.reduce((a, r) => a + r.done, 0),
      totalMinutes: total,
      categories: mine
        .map((r) => ({ category: r.category, minutes: r.minutes, duration: formatDuration(r.minutes), share: shareLabel(r.minutes, total) }))
        .sort((a, b) => b.minutes - a.minutes || a.category.localeCompare(b.category)),
    };
  });
}
