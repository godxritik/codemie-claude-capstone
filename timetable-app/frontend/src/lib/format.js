// Mirrors timetable-app/summary.js formatDuration so the client can label
// figures it already has locally without an extra round trip.
export function formatDuration(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}
