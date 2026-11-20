import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { planTasks } from './scheduler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 3000;
// Loopback by default (no auth); set HOST=0.0.0.0 to expose on the network.
const HOST = process.env.HOST || '127.0.0.1';
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'timetable.db');

if (DB_FILE !== ':memory:') fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = new DatabaseSync(DB_FILE);
db.exec(`
  CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    title TEXT NOT NULL,
    start_min INTEGER NOT NULL,
    end_min INTEGER NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    done INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_entries_date ON entries(date, start_min);
  CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    name_key TEXT NOT NULL UNIQUE,
    tasks TEXT NOT NULL
  );
`);

const CATEGORIES = ['work', 'study', 'health', 'personal', 'break', 'general'];

class HttpError extends Error {
  // extra: additional JSON properties for the error body (never `error`)
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

// Minutes 0..1439; 1440 (24:00) only when allowEnd24 is set (end times).
const parseTime = (s, { allowEnd24 = false, field } = {}) => {
  const str = String(s);
  if (str === '24:00') {
    if (allowEnd24) return 24 * 60;
    throw new HttpError(400, '24:00 is only allowed as an end time', { field });
  }
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(str);
  if (!m) throw new HttpError(400, `Invalid time "${s}", expected HH:MM`, { field });
  return Number(m[1]) * 60 + Number(m[2]);
};

// Accepts only real calendar dates (rejects 2030-02-31, month 13, ...).
const parseDate = (s, field = 'date') => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const dt = new Date(0);
    dt.setUTCFullYear(y, mo - 1, d); // not Date.UTC: it maps years 0-99 to 1900-1999
    if (dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d) return s;
  }
  throw new HttpError(400, `Invalid date "${s}", expected YYYY-MM-DD`, { field });
};

const fmt = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

const toDto = (r) => ({
  id: r.id,
  date: r.date,
  title: r.title,
  start: fmt(r.start_min),
  end: fmt(r.end_min),
  category: r.category,
  done: !!r.done,
});

const parseTitle = (t, field = 'title') => {
  const title = String(t ?? '').trim();
  if (!title) throw new HttpError(400, 'Title is required', { field });
  if (title.length > 100) throw new HttpError(400, 'Title must be 100 characters or fewer', { field });
  return title;
};

const parseCategory = (c, field = 'category') => {
  const category = c ?? 'general';
  if (!CATEGORIES.includes(category)) throw new HttpError(400, `Category must be one of: ${CATEGORIES.join(', ')}`, { field });
  return category;
};

// Optional boolean: undefined passes through, anything but true/false is a 400.
const requireBoolean = (value, field) => {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new HttpError(400, `${field} must be true or false`, { field });
  return value;
};

// Throws 415 unless the request media type is application/json.
const requireJson = (req) => {
  const type = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') throw new HttpError(415, 'Content-Type must be application/json');
};

const findOverlap = (date, startMin, endMin, ignoreId = -1) =>
  db
    .prepare('SELECT * FROM entries WHERE date = ? AND id != ? AND start_min < ? AND end_min > ? LIMIT 1')
    .get(date, ignoreId, endMin, startMin);

const listEntries = (date) =>
  db.prepare('SELECT * FROM entries WHERE date = ? ORDER BY start_min').all(date).map(toDto);

function createEntry(body) {
  const date = parseDate(body.date);
  const title = parseTitle(body.title);
  const category = parseCategory(body.category);
  const startMin = parseTime(body.start, { field: 'start' });
  const endMin = parseTime(body.end, { allowEnd24: true, field: 'end' });
  if (endMin <= startMin) throw new HttpError(400, 'End time must be after start time', { field: 'end' });
  const clash = findOverlap(date, startMin, endMin);
  if (clash) throw new HttpError(409, `Overlaps with "${clash.title}" (${fmt(clash.start_min)}-${fmt(clash.end_min)})`);
  const info = db
    .prepare('INSERT INTO entries (date, title, start_min, end_min, category) VALUES (?, ?, ?, ?, ?)')
    .run(date, title, startMin, endMin, category);
  return toDto(db.prepare('SELECT * FROM entries WHERE id = ?').get(info.lastInsertRowid));
}

function updateEntry(id, body) {
  const row = db.prepare('SELECT * FROM entries WHERE id = ?').get(id);
  if (!row) throw new HttpError(404, 'Entry not found');
  const title = body.title !== undefined ? parseTitle(body.title) : row.title;
  const category = body.category !== undefined ? parseCategory(body.category) : row.category;
  const startMin = body.start !== undefined ? parseTime(body.start, { field: 'start' }) : row.start_min;
  const endMin = body.end !== undefined ? parseTime(body.end, { allowEnd24: true, field: 'end' }) : row.end_min;
  const doneFlag = requireBoolean(body.done, 'done');
  const done = doneFlag === undefined ? row.done : doneFlag ? 1 : 0;
  if (endMin <= startMin) throw new HttpError(400, 'End time must be after start time', { field: 'end' });
  const clash = findOverlap(row.date, startMin, endMin, id);
  if (clash) throw new HttpError(409, `Overlaps with "${clash.title}" (${fmt(clash.start_min)}-${fmt(clash.end_min)})`);
  db.prepare('UPDATE entries SET title = ?, category = ?, start_min = ?, end_min = ?, done = ? WHERE id = ?').run(
    title, category, startMin, endMin, done, id,
  );
  return toDto(db.prepare('SELECT * FROM entries WHERE id = ?').get(id));
}

// Shared by /api/generate and /api/templates so both apply the same task rules.
function parseTasks(list) {
  if (!Array.isArray(list) || list.length === 0) throw new HttpError(400, 'Add at least one task', { field: 'tasks' });
  if (list.length > 50) throw new HttpError(400, 'At most 50 tasks per timetable', { field: 'tasks' });

  const withPrefix = (i, fn) => {
    try {
      return fn();
    } catch (e) {
      if (e instanceof HttpError) throw new HttpError(e.status, `Task ${i + 1}: ${e.message}`, e.extra);
      throw e;
    }
  };
  const tasks = list.map((t, i) => {
    const at = (k) => `tasks[${i}]${k ? `.${k}` : ''}`;
    if (t === null || typeof t !== 'object' || Array.isArray(t)) {
      throw new HttpError(400, `Task ${i + 1}: must be an object`, { field: at() });
    }
    const minutes = Number(t.minutes);
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 480) {
      throw new HttpError(400, `Task ${i + 1}: duration must be 5-480 minutes`, { field: at('minutes') });
    }
    const priority = Number(t.priority ?? 2);
    if (![1, 2, 3].includes(priority)) throw new HttpError(400, `Task ${i + 1}: priority must be 1 (high), 2 or 3 (low)`, { field: at('priority') });
    return {
      title: withPrefix(i, () => parseTitle(t.title, at('title'))),
      category: withPrefix(i, () => parseCategory(t.category, at('category'))),
      minutes,
      priority,
      order: i,
    };
  });
  return tasks;
}

// Places tasks from `start`, highest priority first, in free time (see scheduler.js); skipped tasks are reported.
function generateTimetable(body) {
  const date = parseDate(body.date);
  const startMin = parseTime(body.start ?? '09:00', { field: 'start' });
  const breakMin = Number(body.breakMinutes ?? 10);
  if (!Number.isInteger(breakMin) || breakMin < 0 || breakMin > 120) {
    throw new HttpError(400, 'Break must be a whole number of minutes between 0 and 120', { field: 'breakMinutes' });
  }
  const replace = requireBoolean(body.replace, 'replace') ?? false;

  const tasks = parseTasks(body.tasks);
  const reason = replace ? 'does not fit before midnight' : `no free gap long enough at or after ${fmt(startMin)}`;
  const insert = db.prepare('INSERT INTO entries (date, title, start_min, end_min, category) VALUES (?, ?, ?, ?, ?)');
  let unscheduled;
  db.exec('BEGIN');
  try {
    // Replace on: the whole day is free. Off: fit around the entries already saved.
    const busy = replace
      ? []
      : db.prepare('SELECT start_min AS start, end_min AS end FROM entries WHERE date = ? ORDER BY start_min').all(date);
    const { plan, skipped } = planTasks({ tasks, busy, startMin, breakMin });
    unscheduled = skipped.map((t) => ({ title: t.title, minutes: t.minutes, reason }));
    if (!plan.length) {
      // Decided before any DELETE, so a day being replaced is left untouched.
      throw new HttpError(
        400,
        replace ? 'No task fits before midnight; shorten tasks or start earlier' : `No task fits in the free time at or after ${fmt(startMin)}`,
        { unscheduled },
      );
    }
    if (replace) db.prepare('DELETE FROM entries WHERE date = ?').run(date);
    for (const p of plan) insert.run(date, p.title, p.start, p.end, p.category);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { entries: listEntries(date), unscheduled };
}

const templateDto = (r) => ({ id: r.id, name: r.name, tasks: JSON.parse(r.tasks) });

const listTemplates = () => db.prepare('SELECT * FROM templates ORDER BY name_key').all().map(templateDto);

function saveTemplate(body) {
  const name = String(body.name ?? '').trim();
  if (!name || name.length > 50) throw new HttpError(400, 'Template name must be 1-50 characters', { field: 'name' });
  const tasks = parseTasks(body.tasks).map(({ title, category, minutes, priority }) => ({ title, category, minutes, priority }));
  const replace = requireBoolean(body.replace, 'replace') ?? false;
  const key = name.toLowerCase();
  const existing = db.prepare('SELECT id FROM templates WHERE name_key = ?').get(key);
  if (existing && !replace) throw new HttpError(409, `A template named "${name}" already exists`, { field: 'name' });
  const json = JSON.stringify(tasks);
  if (existing) {
    db.prepare('UPDATE templates SET name = ?, tasks = ? WHERE id = ?').run(name, json, existing.id);
    return templateDto(db.prepare('SELECT * FROM templates WHERE id = ?').get(existing.id));
  }
  const info = db.prepare('INSERT INTO templates (name, name_key, tasks) VALUES (?, ?, ?)').run(name, key, json);
  return templateDto(db.prepare('SELECT * FROM templates WHERE id = ?').get(info.lastInsertRowid));
}

function copyDay(body) {
  const from = parseDate(body.from, 'from');
  const to = parseDate(body.to, 'to');
  const replace = requireBoolean(body.replace, 'replace') ?? false;
  if (from === to) throw new HttpError(400, 'Choose a different date to copy to', { field: 'to' });
  db.exec('BEGIN');
  try {
    const source = db.prepare('SELECT * FROM entries WHERE date = ? ORDER BY start_min').all(from);
    if (!source.length) throw new HttpError(400, 'The day to copy has no entries', { field: 'from' });
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM entries WHERE date = ?').get(to);
    if (n && !replace) {
      throw new HttpError(409, `${to} already has ${n} entr${n === 1 ? 'y' : 'ies'}`, { field: 'to', existing: n });
    }
    if (n) db.prepare('DELETE FROM entries WHERE date = ?').run(to);
    const insert = db.prepare('INSERT INTO entries (date, title, start_min, end_min, category, done) VALUES (?, ?, ?, ?, ?, 0)');
    for (const r of source) insert.run(to, r.title, r.start_min, r.end_min, r.category);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { copied: listEntries(to).length, entries: listEntries(to) };
}

const readJsonBody = (req) => {
  requireJson(req);
  return readBody(req);
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        reject(new HttpError(413, 'Request too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        const parsed = JSON.parse(data);
        if (parsed === null || typeof parsed !== 'object') throw new Error();
        resolve(parsed);
      } catch {
        reject(new HttpError(400, 'Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });

const send = (res, status, payload) => {
  const body = status === 204 ? '' : JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
};

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', 'entries', id?]
  const resource = parts[1];

  if (resource === 'categories' && req.method === 'GET') return send(res, 200, CATEGORIES);

  if (resource === 'entries') {
    const id = parts[2] !== undefined ? Number(parts[2]) : undefined;
    if (id !== undefined && !Number.isInteger(id)) throw new HttpError(400, 'Invalid id');

    if (id === undefined && req.method === 'GET') {
      return send(res, 200, listEntries(parseDate(url.searchParams.get('date'))));
    }
    if (id === undefined && req.method === 'POST') return send(res, 201, createEntry(await readJsonBody(req)));
    if (id !== undefined && req.method === 'PATCH') return send(res, 200, updateEntry(id, await readJsonBody(req)));
    if (id !== undefined && req.method === 'DELETE') {
      const info = db.prepare('DELETE FROM entries WHERE id = ?').run(id);
      if (!info.changes) throw new HttpError(404, 'Entry not found');
      return send(res, 204);
    }
  }

  if (resource === 'templates') {
    const id = parts[2] !== undefined ? Number(parts[2]) : undefined;
    if (id !== undefined && !Number.isInteger(id)) throw new HttpError(400, 'Invalid id');
    if (id === undefined && req.method === 'GET') return send(res, 200, listTemplates());
    if (id === undefined && req.method === 'POST') return send(res, 201, saveTemplate(await readJsonBody(req)));
    if (id !== undefined && req.method === 'DELETE') {
      const info = db.prepare('DELETE FROM templates WHERE id = ?').run(id);
      if (!info.changes) throw new HttpError(404, 'Template not found');
      return send(res, 204);
    }
  }

  if (resource === 'generate' && req.method === 'POST') return send(res, 201, generateTimetable(await readJsonBody(req)));
  if (resource === 'copy' && req.method === 'POST') return send(res, 201, copyDay(await readJsonBody(req)));
  if (resource === 'day' && req.method === 'DELETE') {
    db.prepare('DELETE FROM entries WHERE date = ?').run(parseDate(url.searchParams.get('date')));
    return send(res, 204);
  }

  throw new HttpError(404, 'Not found');
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function serveStatic(res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = path.resolve(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed');
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      throw new HttpError(400, 'Bad request');
    }
    serveStatic(res, pathname);
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { ...e.extra, error: e.message });
    console.error(e);
    send(res, 500, { error: 'Internal server error' });
  }
});

server.listen(PORT, HOST, () => console.log(`Timetable app running at http://${HOST}:${PORT}`));
