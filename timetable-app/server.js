import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 3000;
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
`);

const CATEGORIES = ['work', 'study', 'health', 'personal', 'break', 'general'];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const parseTime = (s) => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(s));
  if (!m) throw new HttpError(400, `Invalid time "${s}", expected HH:MM`);
  return Number(m[1]) * 60 + Number(m[2]);
};

const parseDate = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s)) || Number.isNaN(Date.parse(s))) {
    throw new HttpError(400, `Invalid date "${s}", expected YYYY-MM-DD`);
  }
  return s;
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

const parseTitle = (t) => {
  const title = String(t ?? '').trim();
  if (!title) throw new HttpError(400, 'Title is required');
  if (title.length > 100) throw new HttpError(400, 'Title must be 100 characters or fewer');
  return title;
};

const parseCategory = (c) => {
  const category = c ?? 'general';
  if (!CATEGORIES.includes(category)) throw new HttpError(400, `Category must be one of: ${CATEGORIES.join(', ')}`);
  return category;
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
  const startMin = parseTime(body.start);
  const endMin = parseTime(body.end);
  if (endMin <= startMin) throw new HttpError(400, 'End time must be after start time');
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
  const startMin = body.start !== undefined ? parseTime(body.start) : row.start_min;
  const endMin = body.end !== undefined ? parseTime(body.end) : row.end_min;
  const done = body.done !== undefined ? (body.done ? 1 : 0) : row.done;
  if (endMin <= startMin) throw new HttpError(400, 'End time must be after start time');
  const clash = findOverlap(row.date, startMin, endMin, id);
  if (clash) throw new HttpError(409, `Overlaps with "${clash.title}" (${fmt(clash.start_min)}-${fmt(clash.end_min)})`);
  db.prepare('UPDATE entries SET title = ?, category = ?, start_min = ?, end_min = ?, done = ? WHERE id = ?').run(
    title, category, startMin, endMin, done, id,
  );
  return toDto(db.prepare('SELECT * FROM entries WHERE id = ?').get(id));
}

// Lays tasks out back to back from `start`, highest priority first, with breaks in between.
function generateTimetable(body) {
  const date = parseDate(body.date);
  const startMin = parseTime(body.start ?? '09:00');
  const breakMin = Number(body.breakMinutes ?? 10);
  if (!Number.isInteger(breakMin) || breakMin < 0 || breakMin > 120) {
    throw new HttpError(400, 'Break must be a whole number of minutes between 0 and 120');
  }
  if (!Array.isArray(body.tasks) || body.tasks.length === 0) throw new HttpError(400, 'Add at least one task');
  if (body.tasks.length > 50) throw new HttpError(400, 'At most 50 tasks per timetable');

  const tasks = body.tasks.map((t, i) => {
    const minutes = Number(t.minutes);
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 480) {
      throw new HttpError(400, `Task ${i + 1}: duration must be 5-480 minutes`);
    }
    const priority = Number(t.priority ?? 2);
    if (![1, 2, 3].includes(priority)) throw new HttpError(400, `Task ${i + 1}: priority must be 1 (high), 2 or 3 (low)`);
    return { title: parseTitle(t.title), category: parseCategory(t.category), minutes, priority, order: i };
  });
  tasks.sort((a, b) => a.priority - b.priority || a.order - b.order);

  const plan = [];
  let cursor = startMin;
  tasks.forEach((t, i) => {
    if (cursor + t.minutes > 24 * 60) throw new HttpError(400, `"${t.title}" does not fit before midnight; shorten tasks or start earlier`);
    plan.push({ title: t.title, category: t.category, start: cursor, end: cursor + t.minutes });
    cursor += t.minutes;
    const next = tasks[i + 1];
    if (breakMin > 0 && next && cursor + breakMin + next.minutes <= 24 * 60) {
      plan.push({ title: 'Break', category: 'break', start: cursor, end: cursor + breakMin });
      cursor += breakMin;
    }
  });

  const insert = db.prepare('INSERT INTO entries (date, title, start_min, end_min, category) VALUES (?, ?, ?, ?, ?)');
  db.exec('BEGIN');
  try {
    if (body.replace) db.prepare('DELETE FROM entries WHERE date = ?').run(date);
    else {
      const clash = plan.map((p) => findOverlap(date, p.start, p.end)).find(Boolean);
      if (clash) throw new HttpError(409, `Generated plan overlaps with "${clash.title}"; choose another start time or replace the day`);
    }
    for (const p of plan) insert.run(date, p.title, p.start, p.end, p.category);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return listEntries(date);
}

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
    if (id === undefined && req.method === 'POST') return send(res, 201, createEntry(await readBody(req)));
    if (id !== undefined && req.method === 'PATCH') return send(res, 200, updateEntry(id, await readBody(req)));
    if (id !== undefined && req.method === 'DELETE') {
      const info = db.prepare('DELETE FROM entries WHERE id = ?').run(id);
      if (!info.changes) throw new HttpError(404, 'Entry not found');
      return send(res, 204);
    }
  }

  if (resource === 'generate' && req.method === 'POST') return send(res, 201, generateTimetable(await readBody(req)));
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
    serveStatic(res, decodeURIComponent(url.pathname));
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    console.error(e);
    send(res, 500, { error: 'Internal server error' });
  }
});

server.listen(PORT, () => console.log(`Timetable app running at http://localhost:${PORT}`));
