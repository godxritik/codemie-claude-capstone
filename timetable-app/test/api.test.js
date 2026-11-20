import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PORT = 3999;
const BASE = `http://localhost:${PORT}/api`;
const DATE = '2030-01-15';
let server;

const call = async (p, method = 'GET', body) => {
  const res = await fetch(BASE + p, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: res.status === 204 ? null : await res.json() };
};

before(async () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  server = spawn(process.execPath, ['--no-warnings', 'server.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(PORT), DB_FILE: ':memory:' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.stdout.on('data', (d) => String(d).includes('running') && resolve());
  });
});

after(() => server.kill());

test('creates, lists, updates and deletes an entry', async () => {
  const created = await call('/entries', 'POST', { date: DATE, title: 'Gym', start: '07:00', end: '08:00', category: 'health' });
  assert.equal(created.status, 201);
  assert.equal(created.data.start, '07:00');

  const list = await call(`/entries?date=${DATE}`);
  assert.equal(list.data.length, 1);

  const patched = await call(`/entries/${created.data.id}`, 'PATCH', { done: true });
  assert.equal(patched.data.done, true);

  assert.equal((await call(`/entries/${created.data.id}`, 'DELETE')).status, 204);
  assert.equal((await call(`/entries?date=${DATE}`)).data.length, 0);
});

test('rejects invalid input and overlaps', async () => {
  assert.equal((await call('/entries', 'POST', { date: DATE, title: '', start: '07:00', end: '08:00' })).status, 400);
  assert.equal((await call('/entries', 'POST', { date: DATE, title: 'X', start: '09:00', end: '08:00' })).status, 400);
  assert.equal((await call('/entries', 'POST', { date: DATE, title: 'X', start: '25:00', end: '26:00' })).status, 400);

  await call('/entries', 'POST', { date: '2030-01-16', title: 'A', start: '10:00', end: '11:00' });
  const clash = await call('/entries', 'POST', { date: '2030-01-16', title: 'B', start: '10:30', end: '11:30' });
  assert.equal(clash.status, 409);
  const adjacent = await call('/entries', 'POST', { date: '2030-01-16', title: 'C', start: '11:00', end: '12:00' });
  assert.equal(adjacent.status, 201);
});

test('generates a timetable ordered by priority with breaks', async () => {
  const res = await call('/generate', 'POST', {
    date: '2030-01-17',
    start: '09:00',
    breakMinutes: 15,
    replace: true,
    tasks: [
      { title: 'Email', minutes: 30, priority: 3 },
      { title: 'Report', minutes: 90, priority: 1, category: 'work' },
      { title: 'Read', minutes: 45, priority: 2, category: 'study' },
    ],
  });
  assert.equal(res.status, 201);
  assert.deepEqual(
    res.data.map((e) => [e.title, e.start, e.end]),
    [
      ['Report', '09:00', '10:30'],
      ['Break', '10:30', '10:45'],
      ['Read', '10:45', '11:30'],
      ['Break', '11:30', '11:45'],
      ['Email', '11:45', '12:15'],
    ],
  );
});

test('generate refuses plans that overflow the day or clash without replace', async () => {
  const overflow = await call('/generate', 'POST', {
    date: '2030-01-18', start: '22:00', replace: true, tasks: [{ title: 'Long', minutes: 180 }],
  });
  assert.equal(overflow.status, 400);

  await call('/entries', 'POST', { date: '2030-01-19', title: 'Busy', start: '09:00', end: '10:00' });
  const clash = await call('/generate', 'POST', {
    date: '2030-01-19', start: '09:30', replace: false, tasks: [{ title: 'T', minutes: 30 }],
  });
  assert.equal(clash.status, 409);
  assert.equal((await call('/entries?date=2030-01-19')).data.length, 1);
});
