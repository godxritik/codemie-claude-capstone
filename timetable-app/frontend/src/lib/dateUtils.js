export function toISODate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function fromISODate(s) {
  return new Date(`${s}T00:00:00`);
}

export function addDays(dateStr, delta) {
  const d = fromISODate(dateStr);
  d.setDate(d.getDate() + delta);
  return toISODate(d);
}

// ISO week, Monday first.
export function startOfWeek(dateStr) {
  const d = fromISODate(dateStr);
  const mondayOffset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - mondayOffset);
  return toISODate(d);
}

export function weekDates(dateStr) {
  const start = startOfWeek(dateStr);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function formatDayLabel(dateStr) {
  return fromISODate(dateStr).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
