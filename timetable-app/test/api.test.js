import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PORT = 3999;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const BASE = `${ORIGIN}/api`;
const DATE = '2030-01-15';
let server;
let startupLine = '';

const call = async (p, method = 'GET', body) => {
  const res = await fetch(BASE + p, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: res.status === 204 ? null : await res.json() };
};

const brief = (entries) => entries.map((e) => [e.title, e.start, e.end]);

// Raw request helper: lets a test omit or override headers and send a non-JSON body.
const raw = async (p, { method = 'GET', headers = {}, body } = {}) => {
  const res = await fetch(ORIGIN + p, { method, headers, body });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
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
    server.stdout.on('data', (d) => {
      if (String(d).includes('running')) {
        startupLine = String(d);
        resolve();
      }
    });
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
    res.data.entries.map((e) => [e.title, e.start, e.end]),
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
  assert.equal(clash.status, 201);
  assert.deepEqual(brief(clash.data.entries), [['Busy', '09:00', '10:00'], ['T', '10:00', '10:30']]);
});

test('generate saves tasks that fit and lists the skipped ones in priority order', async () => {
  const res = await call('/generate', 'POST', {
    date: '2030-03-01', start: '21:00', breakMinutes: 15, replace: true,
    tasks: [
      { title: 'Huge', minutes: 300, priority: 2 },
      { title: 'Short', minutes: 30, priority: 1 },
      { title: 'Huge low', minutes: 240, priority: 3 },
    ],
  });
  assert.equal(res.status, 201);
  assert.deepEqual(brief(res.data.entries), [['Short', '21:00', '21:30']]);
  assert.deepEqual(res.data.unscheduled, [
    { title: 'Huge', minutes: 300, reason: 'does not fit before midnight' },
    { title: 'Huge low', minutes: 240, reason: 'does not fit before midnight' },
  ]);
  assert.equal((await call('/entries?date=2030-03-01')).data.length, 1);
});

test('generate reports an empty unscheduled list when everything fits', async () => {
  const res = await call('/generate', 'POST', {
    date: '2030-03-02', start: '09:00', breakMinutes: 10, replace: true, tasks: [{ title: 'A', minutes: 30 }],
  });
  assert.equal(res.status, 201);
  assert.deepEqual(res.data.unscheduled, []);
});

test('a task ending exactly at 24:00 counts as fitting', async () => {
  const res = await call('/generate', 'POST', {
    date: '2030-03-03', start: '23:00', replace: true, tasks: [{ title: 'Edge', minutes: 60 }],
  });
  assert.equal(res.status, 201);
  assert.deepEqual(brief(res.data.entries), [['Edge', '23:00', '24:00']]);
  assert.deepEqual(res.data.unscheduled, []);
});

test('generate with nothing that fits returns 400 and keeps existing entries even with replace', async () => {
  await call('/entries', 'POST', { date: '2030-03-04', title: 'Keep me', start: '08:00', end: '09:00' });
  const res = await call('/generate', 'POST', {
    date: '2030-03-04', start: '22:00', replace: true, tasks: [{ title: 'Long', minutes: 180 }, { title: 'Longer', minutes: 240 }],
  });
  assert.equal(res.status, 400);
  assert.match(res.data.error, /No task fits/);
  assert.deepEqual(res.data.unscheduled.map((u) => u.title), ['Long', 'Longer']);
  assert.deepEqual(brief((await call('/entries?date=2030-03-04')).data), [['Keep me', '08:00', '09:00']]);
});

test('a skipped task never leaves a trailing break', async () => {
  // A 22:00-23:00, B (180) skipped, C placed after a break between the placed tasks
  const res = await call('/generate', 'POST', {
    date: '2030-03-05', start: '22:00', breakMinutes: 15, replace: true,
    tasks: [
      { title: 'A', minutes: 60, priority: 1 },
      { title: 'B', minutes: 180, priority: 2 },
      { title: 'C', minutes: 30, priority: 3 },
    ],
  });
  assert.deepEqual(brief(res.data.entries), [
    ['A', '22:00', '23:00'], ['Break', '23:00', '23:15'], ['C', '23:15', '23:45'],
  ]);
  assert.deepEqual(res.data.unscheduled.map((u) => u.title), ['B']);

  // last placed task is followed by nothing when the next one is skipped
  const tail = await call('/generate', 'POST', {
    date: '2030-03-06', start: '23:00', breakMinutes: 15, replace: true,
    tasks: [{ title: 'A', minutes: 30, priority: 1 }, { title: 'B', minutes: 60, priority: 2 }],
  });
  assert.deepEqual(brief(tail.data.entries), [['A', '23:00', '23:30']]);
});

test('rejects dates that do not exist in the calendar on every endpoint', async () => {
  for (const bad of ['2030-02-31', '2031-02-29', '2030-13-01', '2030-00-10', '2030-01-00', '2030-1-5']) {
    assert.equal((await call(`/entries?date=${bad}`)).status, 400, `GET ${bad}`);
    assert.equal((await call('/entries', 'POST', { date: bad, title: 'X', start: '07:00', end: '08:00' })).status, 400, `POST ${bad}`);
    assert.equal((await call(`/day?date=${bad}`, 'DELETE')).status, 400, `DELETE day ${bad}`);
    assert.equal((await call('/generate', 'POST', { date: bad, tasks: [{ title: 'T', minutes: 30 }] })).status, 400, `generate ${bad}`);
  }
  assert.equal((await call('/entries')).status, 400);
  assert.equal((await call('/entries?date=2032-02-29')).status, 200);
  assert.equal((await call('/entries?date=0099-12-31')).status, 200);
  assert.match((await call('/entries?date=2030-02-31')).data.error, /2030-02-31/);
});

test('accepts 24:00 as an end time only', async () => {
  const day = '2030-02-01';
  const full = await call('/entries', 'POST', { date: day, title: 'Late', start: '23:00', end: '24:00' });
  assert.equal(full.status, 201);
  assert.equal(full.data.end, '24:00');

  // editing other fields of a 24:00 entry works, also when the client re-sends end 24:00
  const renamed = await call(`/entries/${full.data.id}`, 'PATCH', { title: 'Late night', category: 'personal', done: true });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.data.end, '24:00');
  assert.equal((await call(`/entries/${full.data.id}`, 'PATCH', { end: '24:00' })).status, 200);

  // 24:00 is never a start
  assert.equal((await call('/entries', 'POST', { date: day, title: 'X', start: '24:00', end: '24:00' })).status, 400);
  assert.equal((await call(`/entries/${full.data.id}`, 'PATCH', { start: '24:00' })).status, 400);
  assert.equal((await call('/generate', 'POST', { date: '2030-02-02', start: '24:00', tasks: [{ title: 'T', minutes: 30 }] })).status, 400);
  assert.equal((await call('/entries', 'POST', { date: day, title: 'X', start: '07:00', end: '24:01' })).status, 400);

  // a generated entry that ends exactly at midnight is stored and can be edited
  const gen = await call('/generate', 'POST', { date: '2030-02-03', start: '23:00', replace: true, tasks: [{ title: 'Last hour', minutes: 60 }] });
  assert.equal(gen.status, 201);
  const [g] = (await call('/entries?date=2030-02-03')).data;
  assert.equal(g.end, '24:00');
  assert.equal((await call(`/entries/${g.id}`, 'PATCH', { title: 'Renamed', end: '24:00' })).status, 200);
});

test('generate rejects non-object tasks and non-boolean replace with 400', async () => {
  for (const bad of [null, 5, 'x', [1]]) {
    const res = await call('/generate', 'POST', { date: DATE, tasks: [{ title: 'OK', minutes: 30 }, bad] });
    assert.equal(res.status, 400, JSON.stringify(bad));
    assert.match(res.data.error, /^Task 2: must be an object/);
  }
  assert.equal((await call('/generate', 'POST', { date: DATE, tasks: [null] })).status, 400);
  for (const bad of ['false', 'true', 1, 0, null]) {
    const res = await call('/generate', 'POST', { date: '2030-02-04', replace: bad, tasks: [{ title: 'T', minutes: 30 }] });
    assert.equal(res.status, 400, `replace ${JSON.stringify(bad)}`);
    assert.match(res.data.error, /replace must be true or false/);
  }
  assert.equal((await call('/entries?date=2030-02-04')).data.length, 0);
  const noTitle = await call('/generate', 'POST', { date: DATE, tasks: [{ title: 'OK', minutes: 30 }, { title: '  ', minutes: 30 }] });
  assert.equal(noTitle.status, 400);
  assert.match(noTitle.data.error, /^Task 2: Title is required/);
});

test('PATCH validates done, 404 and overlap', async () => {
  const day = '2030-02-05';
  const a = await call('/entries', 'POST', { date: day, title: 'A', start: '09:00', end: '10:00' });
  const b = await call('/entries', 'POST', { date: day, title: 'B', start: '11:00', end: '12:00' });
  for (const bad of ['false', 'true', 1, 0, null]) {
    assert.equal((await call(`/entries/${a.data.id}`, 'PATCH', { done: bad })).status, 400, `done ${JSON.stringify(bad)}`);
  }
  assert.equal((await call(`/entries/${a.data.id}`, 'PATCH', { done: false })).data.done, false);
  assert.equal((await call('/entries/999999', 'PATCH', { title: 'X' })).status, 404);
  assert.equal((await call('/entries/abc', 'PATCH', { title: 'X' })).status, 400);
  const clash = await call(`/entries/${b.data.id}`, 'PATCH', { start: '09:30' });
  assert.equal(clash.status, 409);
  assert.match(clash.data.error, /Overlaps with "A"/);
  assert.equal((await call(`/entries/${b.data.id}`, 'PATCH', { start: '10:00' })).status, 200);
  assert.equal((await call(`/entries/${b.data.id}`, 'PATCH', { title: '' })).status, 400);
});

test('DELETE /api/day removes only that day', async () => {
  await call('/entries', 'POST', { date: '2030-02-06', title: 'A', start: '09:00', end: '10:00' });
  await call('/entries', 'POST', { date: '2030-02-07', title: 'B', start: '09:00', end: '10:00' });
  assert.equal((await call('/day?date=2030-02-06', 'DELETE')).status, 204);
  assert.equal((await call('/entries?date=2030-02-06')).data.length, 0);
  assert.equal((await call('/entries?date=2030-02-07')).data.length, 1);
  assert.equal((await call('/day', 'DELETE')).status, 400);
});

test('POST and PATCH require Content-Type application/json', async () => {
  const body = JSON.stringify({ date: DATE, title: 'CT', start: '05:00', end: '05:30' });
  assert.equal((await raw('/api/entries', { method: 'POST', body })).status, 415);
  assert.equal((await raw('/api/entries', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body })).status, 415);
  assert.equal((await raw('/api/generate', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' })).status, 415);
  assert.equal((await raw('/api/entries/1', { method: 'PATCH', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: '{}' })).status, 415);
  const ok = await raw('/api/entries', { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body });
  assert.equal(ok.status, 201);
  // unknown routes still 404 regardless of Content-Type
  assert.equal((await raw('/api/nope', { method: 'POST', body: '{}' })).status, 404);
});

test('malformed URL escapes return 400, not 500', async () => {
  assert.equal((await raw('/%E0%A4%A')).status, 400);
  assert.equal((await raw('/does-not-exist.js')).status, 404);
  assert.equal((await raw('/')).status, 200);
});

test('server binds to loopback by default', () => {
  assert.match(startupLine, /http:\/\/127\.0\.0\.1:3999/);
});
