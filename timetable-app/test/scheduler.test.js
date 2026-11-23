import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freeGaps, planTasks } from '../scheduler.js';

const t = (h, m = 0) => h * 60 + m;
const iv = (a, b) => ({ start: t(...a), end: t(...b) });
const task = (title, minutes, priority = 2, order = 0) => ({ title, category: 'general', minutes, priority, order });
const show = (plan) => plan.map((p) => `${p.title} ${fmt(p.start)}-${fmt(p.end)}`);
const fmt = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const run = (tasks, busy, start, breakMin = 10) => {
  const r = planTasks({ tasks: tasks.map((x, i) => ({ ...x, order: i })), busy, startMin: start, breakMin });
  return { plan: show(r.plan), skipped: r.skipped.map((s) => s.title) };
};

test('freeGaps: adjacency, spanning entries, entries before from, overlapping busy', () => {
  assert.deepEqual(freeGaps([], t(9)), [{ start: t(9), end: 1440 }]);
  assert.deepEqual(freeGaps([iv([9], [10]), iv([11], [12])], t(9)), [{ start: t(10), end: t(11) }, { start: t(12), end: 1440 }]);
  assert.deepEqual(freeGaps([iv([8], [10])], t(9)), [{ start: t(10), end: 1440 }]);
  assert.deepEqual(freeGaps([iv([7], [8])], t(9)), [{ start: t(9), end: 1440 }]);
  assert.deepEqual(freeGaps([iv([9], [11]), iv([10], [12])], t(9)), [{ start: t(12), end: 1440 }]);
  assert.deepEqual(freeGaps([iv([0], [24])], t(9)), []);
  assert.deepEqual(freeGaps([iv([12], [13]), iv([9], [10])], t(9), t(14)), [{ start: t(10), end: t(12) }, { start: t(13), end: t(14) }]);
});

test('E0 replace-on regression with breaks', () => {
  const r = run([task('Email', 30, 3), task('Report', 90, 1), task('Read', 45, 2)], [], t(9), 15);
  assert.deepEqual(r.plan, [
    'Report 09:00-10:30', 'Break 10:30-10:45', 'Read 10:45-11:30', 'Break 11:30-11:45', 'Email 11:45-12:15',
  ]);
  assert.deepEqual(r.skipped, []);
});

test('E1 exact-fit gap', () => {
  assert.deepEqual(run([task('A', 60)], [iv([9], [10]), iv([11], [12])], t(9)).plan, ['A 10:00-11:00']);
});

test('E2 entry spanning the start', () => {
  assert.deepEqual(run([task('A', 30)], [iv([8], [10])], t(9)).plan, ['A 10:00-10:30']);
});

test('E3 entry before start ignored, adjacent entry is not a conflict', () => {
  assert.deepEqual(run([task('A', 30)], [iv([7], [8]), iv([9], [10])], t(10)).plan, ['A 10:00-10:30']);
});

test('E4 skipped task, later smaller tasks still placed', () => {
  const r = run([task('Big', 120, 1), task('Small', 45, 2), task('Tiny', 30, 3)], [iv([10], [12]), iv([13], [24])], t(9));
  assert.deepEqual(r.plan, ['Small 09:00-09:45', 'Tiny 12:00-12:30']);
  assert.deepEqual(r.skipped, ['Big']);
});

test('E5 forward-only cursor', () => {
  const r = run([task('A', 90, 1), task('B', 30, 2)], [iv([10], [11])], t(9));
  assert.deepEqual(r.plan, ['A 11:00-12:30', 'Break 12:30-12:40', 'B 12:40-13:10']);
});

test('E6 no break next to an existing entry', () => {
  const r = run([task('A', 60, 1), task('B', 30, 2)], [iv([10], [11])], t(9));
  assert.deepEqual(r.plan, ['A 09:00-10:00', 'B 11:00-11:30']);
});

test('E7 break dropped when only the task fits; ends at 24:00', () => {
  const r = run([task('A', 60), task('B', 60)], [], t(22), 15);
  assert.deepEqual(r.plan, ['A 22:00-23:00', 'B 23:00-24:00']);
});

test('E8 skipped task between two placed ones', () => {
  const r = run([task('A', 60, 1), task('B', 180, 2), task('C', 30, 3)], [], t(22), 15);
  assert.deepEqual(r.plan, ['A 22:00-23:00', 'Break 23:00-23:15', 'C 23:15-23:45']);
  assert.deepEqual(r.skipped, ['B']);
});

test('E9 no trailing break', () => {
  const r = run([task('A', 30), task('B', 60)], [], t(23));
  assert.deepEqual(r.plan, ['A 23:00-23:30']);
  assert.deepEqual(r.skipped, ['B']);
});

test('E10 nothing fits before midnight', () => {
  const r = run([task('Long', 180)], [], t(22));
  assert.deepEqual(r.plan, []);
  assert.deepEqual(r.skipped, ['Long']);
});

test('E11 fully booked day', () => {
  const r = run([task('A', 30)], [iv([0], [24])], t(9));
  assert.deepEqual(r.plan, []);
  assert.deepEqual(r.skipped, ['A']);
});

test('E12 break of zero minutes', () => {
  assert.deepEqual(run([task('A', 30), task('B', 30)], [], t(9), 0).plan, ['A 09:00-09:30', 'B 09:30-10:00']);
});

test('priority ties keep entry order and inputs are not mutated', () => {
  const tasks = [task('First', 30, 2, 0), task('Second', 30, 2, 1), task('Urgent', 30, 1, 2)];
  const busy = [iv([12], [13]), iv([9], [10])];
  const copy = JSON.stringify({ tasks, busy });
  const r = planTasks({ tasks, busy, startMin: t(8), breakMin: 0 });
  assert.deepEqual(r.plan.map((p) => p.title), ['Urgent', 'First', 'Second']);
  assert.equal(JSON.stringify({ tasks, busy }), copy);
});

test('break needs room in the same gap as the next task', () => {
  // gap 09:00-10:00 holds A (45) but not break (10) + B (30); B goes to the next gap with no break
  const r = run([task('A', 45, 1), task('B', 30, 2)], [iv([10], [11])], t(9));
  assert.deepEqual(r.plan, ['A 09:00-09:45', 'B 11:00-11:30']);
});
