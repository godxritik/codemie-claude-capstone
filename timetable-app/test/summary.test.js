import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration, shareLabel, buildSummary } from '../summary.js';

test('formatDuration', () => {
  assert.equal(formatDuration(0), '0m');
  assert.equal(formatDuration(45), '45m');
  assert.equal(formatDuration(90), '1h 30m');
  assert.equal(formatDuration(120), '2h');
});

test('shareLabel rounds, shows <1% and handles zero total', () => {
  assert.equal(shareLabel(30, 90), '33%');
  assert.equal(shareLabel(60, 90), '67%');
  assert.equal(shareLabel(5, 1000), '<1%');
  assert.equal(shareLabel(90, 90), '100%');
  assert.equal(shareLabel(0, 0), '0%');
});

test('buildSummary: counts exclude breaks, categories include them', () => {
  const rows = [
    { date: 'd1', category: 'work', minutes: 60, done: 1, count: 1 },
    { date: 'd1', category: 'break', minutes: 30, done: 0, count: 2 },
  ];
  const [d1, d2] = buildSummary(['d1', 'd2'], rows);
  assert.deepEqual([d1.count, d1.minutes, d1.done, d1.totalMinutes, d1.totalDuration], [1, 60, 1, 90, '1h 30m']);
  assert.deepEqual(d1.categories.map((c) => [c.category, c.share]), [['work', '67%'], ['break', '33%']]);
  assert.deepEqual([d2.count, d2.categories.length], [0, 0]);
});
