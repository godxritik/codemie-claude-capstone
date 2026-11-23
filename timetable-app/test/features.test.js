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

// ---- TIME-8 week overview ----

test('summary: per-day figures exclude breaks and empty days are zero', async () => {
  const a = (await add('2032-03-01', 'A', '09:00', '10:00', 'work')).data;
  await add('2032-03-01', 'B', '10:00', '10:30', 'study');
  await add('2032-03-01', 'Break', '10:30', '10:45', 'break');
  await call(`/entries/${a.id}`, 'PATCH', { done: true });
  const res = await call('/summary?from=2032-03-01&to=2032-03-07');
  assert.equal(res.status, 200);
  assert.equal(res.data.days.length, 7);
  const mon = res.data.days[0];
  assert.deepEqual([mon.date, mon.count, mon.minutes, mon.done], ['2032-03-01', 2, 90, 1]);
  const empty = res.data.days[3];
  assert.deepEqual([empty.date, empty.count, empty.minutes, empty.done], ['2032-03-04', 0, 0, 0]);
});

test('summary: ranges across month and year boundaries', async () => {
  const res = await call('/summary?from=2031-12-30&to=2032-01-02');
  assert.deepEqual(res.data.days.map((d) => d.date), ['2031-12-30', '2031-12-31', '2032-01-01', '2032-01-02']);
  const leap = await call('/summary?from=2032-02-28&to=2032-03-01');
  assert.deepEqual(leap.data.days.map((d) => d.date), ['2032-02-28', '2032-02-29', '2032-03-01']);
});

test('summary: validation and 31-day limit', async () => {
  assert.equal((await call('/summary?from=2032-03-01&to=2032-03-31')).status, 200); // 31 days
  assert.equal((await call('/summary?from=2032-03-01&to=2032-04-01')).status, 400); // 32 days
  assert.equal((await call('/summary?from=2032-03-05&to=2032-03-01')).status, 400);
  assert.equal((await call('/summary?from=2032-02-31&to=2032-03-01')).status, 400);
  assert.equal((await call('/summary?from=2032-03-01')).status, 400);
  assert.equal((await call('/summary')).status, 400);
});

// ---- TIME-9 time by category ----

test('summary: categories include breaks, share is of all planned time (done or not)', async () => {
  const a = (await add('2033-05-02', 'A', '09:00', '10:00', 'work')).data;
  await add('2033-05-02', 'B', '10:00', '10:30', 'study');
  await add('2033-05-02', 'Break', '10:30', '11:00', 'break');
  await call(`/entries/${a.id}`, 'PATCH', { done: true });
  const day = (await call('/summary?from=2033-05-02&to=2033-05-02')).data.days[0];
  assert.equal(day.totalMinutes, 120);
  assert.equal(day.totalDuration, '2h');
  assert.deepEqual(day.categories.map((c) => [c.category, c.minutes, c.duration, c.share]), [
    ['work', 60, '1h', '50%'],
    ['break', 30, '30m', '25%'],
    ['study', 30, '30m', '25%'],
  ]);
});

test('summary: empty day has no categories; edits and deletes are reflected', async () => {
  const empty = (await call('/summary?from=2033-06-01&to=2033-06-01')).data.days[0];
  assert.deepEqual(empty.categories, []);
  const e = (await add('2033-06-01', 'X', '09:00', '09:30', 'work')).data;
  await call(`/entries/${e.id}`, 'PATCH', { end: '10:00' });
  assert.equal((await call('/summary?from=2033-06-01&to=2033-06-01')).data.days[0].categories[0].minutes, 60);
  await call(`/entries/${e.id}`, 'DELETE');
  assert.deepEqual((await call('/summary?from=2033-06-01&to=2033-06-01')).data.days[0].categories, []);
});

// ---- TIME-10 export ----

const exportCsv = async (date) => {
  const res = await fetch(`${ORIGIN}/api/export${date === undefined ? '' : `?date=${date}`}`);
  // Decode by hand: res.text() would strip the BOM we want to assert on.
  return { status: res.status, res, text: Buffer.from(await res.arrayBuffer()).toString('utf8') };
};

test('export: headers, BOM, CRLF, done values', async () => {
  const a = (await add('2034-01-10', 'Plan', '09:00', '10:00', 'work')).data;
  await add('2034-01-10', 'Lunch', '12:00', '13:00', 'personal');
  await call(`/entries/${a.id}`, 'PATCH', { done: true });
  const { status, res, text } = await exportCsv('2034-01-10');
  assert.equal(status, 200);
  assert.match(res.headers.get('content-type'), /^text\/csv/);
  assert.equal(res.headers.get('content-disposition'), 'attachment; filename="timetable-2034-01-10.csv"');
  assert.equal(text, '\uFEFFdate,title,start,end,category,done\r\n2034-01-10,Plan,09:00,10:00,work,true\r\n2034-01-10,Lunch,12:00,13:00,personal,false\r\n');
});

test('export: RFC 4180 quoting and formula neutralisation', async () => {
  await add('2034-02-01', 'a, b', '01:00', '02:00');
  await add('2034-02-01', 'say "hi"', '02:00', '03:00');
  await add('2034-02-01', '=SUM(A1)', '03:00', '04:00');
  await add('2034-02-01', '+1', '04:00', '05:00');
  await add('2034-02-01', '-2', '05:00', '06:00');
  await add('2034-02-01', '@cmd', '06:00', '07:00');
  await add('2034-02-01', '=1,2', '07:00', '08:00');
  const rows = (await exportCsv('2034-02-01')).text.split('\r\n');
  assert.equal(rows[1], '2034-02-01,"a, b",01:00,02:00,general,false');
  assert.equal(rows[2], '2034-02-01,"say ""hi""",02:00,03:00,general,false');
  assert.equal(rows[3], "2034-02-01,'=SUM(A1),03:00,04:00,general,false");
  assert.equal(rows[4], "2034-02-01,'+1,04:00,05:00,general,false");
  assert.equal(rows[5], "2034-02-01,'-2,05:00,06:00,general,false");
  assert.equal(rows[6], "2034-02-01,'@cmd,06:00,07:00,general,false");
  assert.equal(rows[7], `2034-02-01,"'=1,2",07:00,08:00,general,false`);
});

test('export: invalid or missing date is 400', async () => {
  assert.equal((await exportCsv()).status, 400);
  assert.equal((await exportCsv('2034-02-31')).status, 400);
  assert.equal((await exportCsv('x')).status, 400);
});
