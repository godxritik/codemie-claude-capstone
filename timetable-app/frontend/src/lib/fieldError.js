// Maps a server error field like "tasks[2].minutes" to a task row locator.
export function parseTaskField(field) {
  const m = /^tasks\[(\d+)\](?:\.(.+))?$/.exec(field ?? '');
  if (!m) return null;
  return { index: Number(m[1]), key: m[2] ?? null };
}
