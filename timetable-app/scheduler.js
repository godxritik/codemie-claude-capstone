// Pure placement logic for the timetable generator (no I/O, no dependencies).
// All times are minutes since midnight; intervals are half-open [start, end).

export const DAY_END = 24 * 60;

/**
 * Free intervals within [from, to) not covered by busy. Adjacency is not overlap.
 * @param {{start: number, end: number}[]} busy any order, may overlap each other
 * @returns {{start: number, end: number}[]} sorted, non-empty gaps
 */
export function freeGaps(busy, from, to = DAY_END) {
  const gaps = [];
  let c = from;
  for (const b of [...busy].sort((x, y) => x.start - y.start)) {
    if (b.end <= c) continue; // ends before the cursor (including entries before `from`)
    if (b.start >= to) break;
    if (b.start > c) gaps.push({ start: c, end: b.start });
    c = Math.max(c, b.end); // an entry spanning `from` pushes the cursor to its end
  }
  if (c < to) gaps.push({ start: c, end: to });
  return gaps;
}

/**
 * Places tasks (priority order, ties by entry order) with a forward-only cursor; each task takes
 * the first gap at or after the cursor that fits. A task that fits nowhere is skipped and later
 * tasks are still tried. A break is inserted only between two generated tasks that are adjacent in
 * time, and only when the break and the next task both fit in the same gap. Does not mutate inputs.
 * @param {object} p
 * @param {{title: string, category: string, minutes: number, priority: number, order: number}[]} p.tasks
 * @param {{start: number, end: number}[]} p.busy existing entries ([] when replacing the day)
 * @param {number} p.startMin
 * @param {number} p.breakMin
 * @param {number} [p.dayEnd]
 * @returns {{plan: {title: string, category: string, start: number, end: number}[], skipped: object[]}}
 */
export function planTasks({ tasks, busy, startMin, breakMin, dayEnd = DAY_END }) {
  const ordered = [...tasks].sort((a, b) => a.priority - b.priority || a.order - b.order);
  const gaps = freeGaps(busy, startMin, dayEnd);
  let cursor = startMin;
  let lastGenEnd = null; // end of the most recently placed generated task
  const plan = [];
  const skipped = [];

  for (const t of ordered) {
    let placed = false;
    for (const g of gaps) {
      if (g.end <= cursor) continue; // forward-only: gaps behind the cursor are abandoned
      let s = Math.max(g.start, cursor);
      const adjacent = lastGenEnd !== null && s === lastGenEnd;
      if (adjacent && breakMin > 0 && s + breakMin + t.minutes <= g.end) {
        plan.push({ title: 'Break', category: 'break', start: s, end: s + breakMin });
        s += breakMin;
      } else if (s + t.minutes > g.end) {
        continue; // does not fit in this gap, with or without a break
      }
      plan.push({ title: t.title, category: t.category, start: s, end: s + t.minutes });
      cursor = s + t.minutes;
      lastGenEnd = cursor;
      placed = true;
      break;
    }
    if (!placed) skipped.push(t);
  }
  return { plan, skipped };
}
