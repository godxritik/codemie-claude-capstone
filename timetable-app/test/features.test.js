import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PORT = 3998; // api.test.js uses 3999; test files run in parallel
const ORIGIN = `http://127.0.0.1:${PORT}`;
let server;

const call = async (p, method = 'GET', body) => {
  const res = await fetch(`${ORIGIN}/api${p}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: res.status === 204 ? null : await res.json() };
};

const add = (date, title, start, end, category = 'general') =>
  call('/entries', 'POST', { date, title, start, end, category });

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

// ---- TIME-6 templates ----

test('templates: save, list, load shape and delete', async () => {
  const tasks = [{ title: 'Write', minutes: 60, priority: 1, category: 'work' }, { title: 'Read', minutes: 30 }];
  const saved = await call('/templates', 'POST', { name: '  Morning  ', tasks });
  assert.equal(saved.status, 201);
  assert.equal(saved.data.name, 'Morning');
  assert.deepEqual(saved.data.tasks[1], { title: 'Read', category: 'general', minutes: 30, priority: 2 });
  const list = await call('/templates');
  assert.deepEqual(list.data.map((t) => t.name), ['Morning']);
  assert.equal((await call(`/templates/${saved.data.id}`, 'DELETE')).status, 204);
  assert.deepEqual((await call('/templates')).data, []);
  assert.equal((await call(`/templates/${saved.data.id}`, 'DELETE')).status, 404);
});

test('templates: name rules, duplicates (case-insensitive) and replace', async () => {
  const tasks = [{ title: 'A', minutes: 30 }];
  assert.equal((await call('/templates', 'POST', { name: '   ', tasks })).status, 400);
  assert.equal((await call('/templates', 'POST', { name: 'x'.repeat(51), tasks })).status, 400);
  assert.equal((await call('/templates', 'POST', { name: 'x'.repeat(50), tasks })).status, 201);
  assert.equal((await call('/templates', 'POST', { name: 'Routine', tasks })).status, 201);
  const dup = await call('/templates', 'POST', { name: ' ROUTINE ', tasks });
  assert.equal(dup.status, 409);
  assert.match(dup.data.error, /already exists/);
  const over = await call('/templates', 'POST', { name: 'routine', tasks: [{ title: 'B', minutes: 45 }], replace: true });
  assert.equal(over.status, 201);
  const found = (await call('/templates')).data.filter((t) => t.name.toLowerCase() === 'routine');
  assert.equal(found.length, 1);
  assert.equal(found[0].tasks[0].title, 'B');
});

test('templates: tasks validated like /generate; empty list rejected', async () => {
  const bad = (tasks) => call('/templates', 'POST', { name: 'Bad', tasks });
  assert.equal((await bad([])).status, 400);
  assert.equal((await bad(undefined)).status, 400);
  assert.equal((await bad([{ title: '', minutes: 30 }])).data.field, 'tasks[0].title');
  assert.equal((await bad([{ title: 'a', minutes: 4 }])).status, 400);
  assert.equal((await bad([{ title: 'a', minutes: 30, priority: 5 }])).status, 400);
  assert.equal((await bad([{ title: 'a', minutes: 30, category: 'zzz' }])).status, 400);
  assert.equal((await bad(Array.from({ length: 51 }, () => ({ title: 'a', minutes: 30 })))).status, 400);
  assert.equal((await call('/templates')).data.some((t) => t.name === 'Bad'), false);
});

// ---- TIME-7 copy a day ----

test('copy: copies titles, times, categories and breaks with done reset', async () => {
  const a = (await add('2031-01-01', 'Work', '09:00', '10:00', 'work')).data;
  await add('2031-01-01', 'Break', '10:00', '10:10', 'break');
  await call(`/entries/${a.id}`, 'PATCH', { done: true });
  const res = await call('/copy', 'POST', { from: '2031-01-01', to: '2031-01-02' });
  assert.equal(res.status, 201);
  const copied = (await call('/entries?date=2031-01-02')).data;
  assert.deepEqual(copied.map((e) => [e.title, e.start, e.end, e.category, e.done]), [
    ['Work', '09:00', '10:00', 'work', false],
    ['Break', '10:00', '10:10', 'break', false],
  ]);
  assert.equal((await call('/entries?date=2031-01-01')).data[0].done, true);
});

test('copy: validation errors', async () => {
  assert.equal((await call('/copy', 'POST', { from: '2031-01-01', to: '2031-01-01' })).status, 400);
  assert.equal((await call('/copy', 'POST', { from: '2031-02-01', to: '2031-02-02' })).status, 400); // empty source
  assert.equal((await call('/copy', 'POST', { from: '2031-02-31', to: '2031-02-02' })).status, 400);
  assert.equal((await call('/copy', 'POST', { from: '2031-01-01', to: 'nope' })).status, 400);
  assert.equal((await call('/copy', 'POST', { from: '2031-01-01' })).status, 400);
});

test('copy: non-empty target gives 409 with count and writes nothing; replace swaps atomically', async () => {
  await add('2031-03-01', 'S', '08:00', '09:00');
  await add('2031-03-02', 'T1', '12:00', '13:00');
  await add('2031-03-02', 'T2', '14:00', '15:00');
  const res = await call('/copy', 'POST', { from: '2031-03-01', to: '2031-03-02' });
  assert.equal(res.status, 409);
  assert.equal(res.data.existing, 2);
  assert.deepEqual((await call('/entries?date=2031-03-02')).data.map((e) => e.title), ['T1', 'T2']);
  const ok = await call('/copy', 'POST', { from: '2031-03-01', to: '2031-03-02', replace: true });
  assert.equal(ok.status, 201);
  assert.deepEqual((await call('/entries?date=2031-03-02')).data.map((e) => e.title), ['S']);
});
