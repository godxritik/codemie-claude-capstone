# Low-level design: Day planner iteration 1 (Epic TIME-2)

Phase: 3 (design). Status: draft for human approval.
Confluence: pending sync.
Every section names the story (TIME-x) and work item (WI-x) it serves. Signatures are JavaScript (ES modules, Node >= 22.5). Pseudocode is normative for behaviour, not for exact style.

## 1. Data model and migration

No schema change and no migration SQL (TIME-14, TIME-4, TIME-5). The existing DDL stays exactly as is:

```sql
CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  start_min INTEGER NOT NULL,      -- 0..1439
  end_min INTEGER NOT NULL,        -- 1..1440 (1440 = 24:00, end only)
  category TEXT NOT NULL DEFAULT 'general',
  done INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_entries_date ON entries(date, start_min);
```

The value ranges in the comments are enforced in code, not by CHECK constraints (adding constraints would require a table rebuild; not justified for this iteration). New query used by generate (WI-06):

```sql
SELECT start_min AS start, end_min AS end FROM entries WHERE date = ? ORDER BY start_min
```

## 2. Server: errors and validation helpers (`server.js`)

### 2.1 `HttpError` (WI-04, WI-10; TIME-5, TIME-12)

```js
class HttpError extends Error {
  /** @param {number} status @param {string} message @param {{field?: string, unscheduled?: object[]}} [extra] */
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
```

Top-level catch: `if (e instanceof HttpError) return send(res, e.status, { error: e.message, ...e.extra });`. `extra` must never contain `error`.

### 2.2 `parseDate` (WI-01; TIME-14)

```js
/** @returns {string} the input unchanged when it is a real calendar date */
const parseDate = (s, field = 'date') => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const dt = new Date(0);
    dt.setUTCFullYear(y, mo - 1, d);        // not Date.UTC: it maps years 0-99 to 1900-1999
    if (dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d) return s;
  }
  throw new HttpError(400, `Invalid date "${s}", expected YYYY-MM-DD`, { field });
};
```

| Input | Result |
|---|---|
| `2030-01-15`, `2032-02-29`, `0001-01-01`, `0099-12-31` | accepted |
| `2030-02-31`, `2031-02-29`, `2030-13-01`, `2030-00-10`, `2030-01-00`, `2030-1-5`, `null`, missing | 400 |

### 2.3 `parseTime` (WI-01; TIME-14, D5)

```js
/** @returns {number} minutes 0..1439, or 1440 only when allowEnd24 */
const parseTime = (s, { allowEnd24 = false, field } = {}) => {
  const str = String(s);
  if (str === '24:00') {
    if (allowEnd24) return 1440;
    throw new HttpError(400, '24:00 is only allowed as an end time', { field });
  }
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(str);
  if (!m) throw new HttpError(400, `Invalid time "${s}", expected HH:MM`, { field });
  return Number(m[1]) * 60 + Number(m[2]);
};
```

Call sites: `createEntry` start `{field:'start'}`, end `{allowEnd24:true, field:'end'}`; `updateEntry` same when the key is present; `generateTimetable` start `{field:'start'}` (never allowEnd24). `field` is passed from WI-10 on; WI-01 introduces the options object.

### 2.4 Other helpers (WI-02, WI-10; TIME-14, TIME-12)

```js
const parseTitle = (t, field = 'title') => { /* unchanged rules, HttpError(..., { field }) */ };
const parseCategory = (c, field = 'category') => { /* unchanged rules, HttpError(..., { field }) */ };

/** @returns {boolean|undefined} */
const requireBoolean = (value, field) => {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new HttpError(400, `${field} must be true or false`, { field });
  return value;
};

/** Throws 415 unless the request media type is application/json. */
const requireJson = (req) => {
  const type = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') throw new HttpError(415, 'Content-Type must be application/json');
};

/** Used for every POST/PATCH route instead of readBody directly. */
const readJsonBody = (req) => { requireJson(req); return readBody(req); };
```

Task-level messages get the 1-based prefix and the 0-based field path, for example:

```js
const tasks = body.tasks.map((t, i) => {
  const at = (k) => `tasks[${i}]${k ? '.' + k : ''}`;
  if (t === null || typeof t !== 'object' || Array.isArray(t)) throw new HttpError(400, `Task ${i + 1}: must be an object`, { field: at() });
  const minutes = Number(t.minutes);
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 480) throw new HttpError(400, `Task ${i + 1}: duration must be 5-480 minutes`, { field: at('minutes') });
  const priority = Number(t.priority ?? 2);
  if (![1, 2, 3].includes(priority)) throw new HttpError(400, `Task ${i + 1}: priority must be 1 (high), 2 or 3 (low)`, { field: at('priority') });
  const title = withPrefix(i, () => parseTitle(t.title, at('title')));        // message "Task 2: Title is required"
  const category = withPrefix(i, () => parseCategory(t.category, at('category')));
  return { title, category, minutes, priority, order: i };
});
// withPrefix(i, fn): runs fn; on HttpError rethrows new HttpError(e.status, `Task ${i + 1}: ${e.message}`, e.extra)
```

Validation order in `generateTimetable` (first failure wins): date, start, breakMinutes, replace, tasks array, then each task in order. Unchanged deliberately: `breakMinutes` and `minutes` keep `Number()` coercion (the UI sends numbers; tightening is not in any AC).

Static path (WI-02):

```js
let pathname;
try { pathname = decodeURIComponent(url.pathname); } catch { throw new HttpError(400, 'Bad request'); }
serveStatic(res, pathname);
```

### 2.5 `createEntry` / `updateEntry` (WI-01, WI-02, WI-10; TIME-14, TIME-3)

```js
function createEntry(body)            // returns Entry; throws 400/409
function updateEntry(id, body)        // returns Entry; throws 400/404/409
```

Changes only:
- `end` parsed with `allowEnd24:true`.
- `updateEntry`: `const done = requireBoolean(body.done, 'done'); const doneInt = done === undefined ? row.done : (done ? 1 : 0);`
- `End time must be after start time` gets `{field:'end'}`.
- 409 message unchanged (`Overlaps with "<title>" (HH:MM-HH:MM)`), no `field`.

### 2.6 Routing (WI-02)

`handleApi` replaces `readBody(req)` with `readJsonBody(req)` in the three POST/PATCH branches. Route matching is unchanged, so unknown routes still return 404 regardless of Content-Type.

## 3. Generator

### 3.1 `scheduler.js` (NEW, WI-06; TIME-4, TIME-5) - Recommendation Q4

```js
export const DAY_END = 1440;

/**
 * Free intervals within [from, to) not covered by busy. Half-open intervals; adjacency is not overlap.
 * @param {{start:number, end:number}[]} busy  any order, may overlap each other
 * @returns {{start:number, end:number}[]} sorted, non-empty gaps
 */
export function freeGaps(busy, from, to = DAY_END)

/**
 * Pure placement (D3, D4). Does not mutate inputs.
 * @param {object} p
 * @param {{title:string, category:string, minutes:number, priority:number, order:number}[]} p.tasks  validated
 * @param {{start:number, end:number}[]} p.busy   [] when replace is on
 * @param {number} p.startMin  0..1439
 * @param {number} p.breakMin  0..120
 * @param {number} [p.dayEnd=1440]
 * @returns {{ plan: {title:string, category:string, start:number, end:number}[],
 *             skipped: {title:string, minutes:number, priority:number, order:number}[] }}
 *   plan sorted by start; skipped in priority order
 */
export function planTasks({ tasks, busy, startMin, breakMin, dayEnd = DAY_END })
```

Pseudocode:

```
freeGaps(busy, from, to):
  gaps = []; c = from
  for b in busy sorted by start:
    if b.end <= c: continue            # ends before cursor (incl. entries before chosen start)
    if b.start >= to: break
    if b.start > c: gaps.push({start: c, end: b.start})
    c = max(c, b.end)                  # entry spanning `from` pushes c to its end
  if c < to: gaps.push({start: c, end: to})
  return gaps

planTasks({tasks, busy, startMin, breakMin, dayEnd}):
  ordered = copy(tasks) sorted by (priority asc, order asc)
  gaps = freeGaps(busy, startMin, dayEnd)
  cursor = startMin
  lastGenEnd = null                    # end of the most recently placed generated task
  plan = []; skipped = []
  for t in ordered:
    placed = false
    for g in gaps:
      if g.end <= cursor: continue     # forward-only: gaps behind the cursor are abandoned
      s = max(g.start, cursor)
      adjacent = (lastGenEnd !== null and s == lastGenEnd)
      if adjacent and breakMin > 0 and s + breakMin + t.minutes <= g.end:
        plan.push({title:'Break', category:'break', start:s, end:s+breakMin})
        s = s + breakMin
      else if s + t.minutes > g.end:
        continue                       # task does not fit in this gap (with or without break)
      plan.push({title:t.title, category:t.category, start:s, end:s+t.minutes})
      cursor = s + t.minutes; lastGenEnd = cursor; placed = true
      break
    if not placed: skipped.push(t)     # cursor and lastGenEnd unchanged
  return {plan, skipped}
```

Properties guaranteed by construction: a break is always followed immediately by a generated task (no trailing break, no break before a skipped task); a break starts only where a generated task ended (never next to an existing entry on its left; on its right is the new task); `<=` makes exact fit and 24:00 ends valid.

### 3.2 Worked examples (become unit tests in `test/scheduler.test.js`)

Times as HH:MM for readability; break = 10 unless stated.

| # | Case | busy | start | tasks (priority order) | plan | skipped |
|---|---|---|---|---|---|---|
| E0 | Replace-on regression (existing test, break 15) | none | 09:00 | Report 90 p1, Read 45 p2, Email 30 p3 | Report 09:00-10:30, Break 10:30-10:45, Read 10:45-11:30, Break 11:30-11:45, Email 11:45-12:15 | - |
| E1 | Exact-fit gap | 09:00-10:00, 11:00-12:00 | 09:00 | A 60 | A 10:00-11:00 (10:00+60 = gap end) | - |
| E2 | Entry spanning start | 08:00-10:00 | 09:00 | A 30 | A 10:00-10:30, no break before it | - |
| E3 | Entry before start ignored; adjacent entry not a conflict | 07:00-08:00, 09:00-10:00 | 10:00 | A 30 | A 10:00-10:30 (starts at existing end) | - |
| E4 | Skipped task, later smaller tasks still placed | 10:00-12:00, 13:00-24:00 | 09:00 | Big 120 p1, Small 45 p2, Tiny 30 p3 | Small 09:00-09:45; Tiny: break+30 and 30 both overflow 10:00 in gap 1, so Tiny 12:00-12:30 in gap 2 without break | Big |
| E5 | Forward-only consequence | 10:00-11:00 | 09:00 | A 90 p1, B 30 p2 | A 11:00-12:30 (gap 09-10 too short), Break 12:30-12:40, B 12:40-13:10. B is not placed at 09:00 because the cursor already passed that gap | - |
| E6 | No break next to an existing entry | 10:00-11:00 | 09:00 | A 60 p1, B 30 p2 | A 09:00-10:00 (exact fit), B 11:00-11:30 (s=11:00 != lastGenEnd 10:00, so no break) | - |
| E7 | Break dropped when only the task fits; ends at 24:00 (break 15) | none | 22:00 | A 60, B 60 | A 22:00-23:00; break+B = 24:15 > 24:00, B alone = 24:00 fits: B 23:00-24:00, no break | - |
| E8 | Skipped task between two placed ones, break between the placed ones (break 15) | none | 22:00 | A 60 p1, B 180 p2, C 30 p3 | A 22:00-23:00, Break 23:00-23:15, C 23:15-23:45 | B |
| E9 | No trailing break | none | 23:00 | A 30, B 60 | A 23:00-23:30; B neither with nor without break fits (24:30); nothing added after A | B |
| E10 | Nothing fits (replace on) | none | 22:00 | Long 180 | [] -> server returns 400 with `unscheduled:[Long]` | Long |
| E11 | Fully booked day (replace off) | 00:00-24:00 | 09:00 | A 30 | [] -> 400, nothing saved | A |
| E12 | break = 0 | none | 09:00 | A 30, B 30 | A 09:00-09:30, B 09:30-10:00 | - |

### 3.3 `generateTimetable(body)` (WI-04, WI-06; TIME-5, TIME-4)

```js
/** @returns {{entries: Entry[], unscheduled: {title:string, minutes:number, reason:string}[]}} */
function generateTimetable(body)
```

```
date = parseDate(body.date)
startMin = parseTime(body.start ?? '09:00', {field:'start'})
breakMin = validated as today (+ field 'breakMinutes')
replace = requireBoolean(body.replace, 'replace') ?? false
tasks = validated list (section 2.4)
reason = replace ? 'does not fit before midnight' : `no free gap long enough at or after ${fmt(startMin)}`
db.exec('BEGIN')
try:
  busy = replace ? [] : db.prepare(SELECT_BUSY).all(date)
  {plan, skipped} = planTasks({tasks, busy, startMin, breakMin})
  unscheduled = skipped.map(t => ({title: t.title, minutes: t.minutes, reason}))
  if plan is empty:
    throw HttpError(400, replace ? 'No task fits before midnight; shorten tasks or start earlier'
                                 : `No task fits in the free time at or after ${fmt(startMin)}`, {unscheduled})
  if replace: DELETE FROM entries WHERE date = ?
  for p in plan: INSERT ...
  db.exec('COMMIT')
catch e: db.exec('ROLLBACK'); throw e
return {entries: listEntries(date), unscheduled}
```

The nothing-fits check happens before the DELETE, so with `replace:true` nothing is deleted (D2, R3). The 409 clash branch is removed: in gap mode generated items cannot overlap busy intervals by construction. `DatabaseSync` is synchronous and the function has no `await`, so no other request can interleave between reading busy and inserting.

Route: `send(res, 201, generateTimetable(await readJsonBody(req)))` - unchanged except the body reader.

### 3.4 Optional bind (WI-14, Recommendation Q1; TIME-14)

```js
const HOST = process.env.HOST || '127.0.0.1';
server.listen(PORT, HOST, () => console.log(`Timetable app running at http://${HOST}:${PORT}`));
```

The log line must still contain `running` (the test harness waits for it). Test `BASE` changes to `http://127.0.0.1:${PORT}/api`.

## 4. Error and status code table (TIME-14, TIME-5, TIME-12)

| Status | When | Body | `field` |
|---|---|---|---|
| 200 | GET entries, PATCH, GET categories | Entry[] / Entry / string[] | - |
| 201 | POST entries; generate with at least one task placed | Entry / `{entries, unscheduled}` | - |
| 204 | DELETE entry, DELETE day | empty | - |
| 400 | invalid date | `Invalid date "x", expected YYYY-MM-DD` | `date` |
| 400 | invalid time | `Invalid time "x", expected HH:MM` | `start` / `end` |
| 400 | 24:00 as start (entries, PATCH, generate) | `24:00 is only allowed as an end time` | `start` |
| 400 | end <= start | `End time must be after start time` | `end` |
| 400 | title / category | existing messages (tasks prefixed `Task N:`) | `title`, `category`, `tasks[i].title`, `tasks[i].category` |
| 400 | non-boolean `done` / `replace` | `done must be true or false` / `replace must be true or false` | `done` / `replace` |
| 400 | break, tasks array, task fields | existing messages; `Task N: must be an object` new | `breakMinutes`, `tasks`, `tasks[i]`, `tasks[i].minutes`, `tasks[i].priority` |
| 400 | nothing fits (D2) | `No task fits ...` + `unscheduled` (all tasks) | - |
| 400 | invalid JSON, invalid id, bad URL escape | `Invalid JSON body` / `Invalid id` / `Bad request` | - |
| 404 | unknown API route, entry id not found, static file missing | `Not found` / `Entry not found` / text `Not found` | - |
| 405 | non-GET to a non-API path | `Method not allowed` | - |
| 409 | overlap on POST/PATCH entries (generate never returns 409 now) | `Overlaps with "T" (HH:MM-HH:MM)` | - |
| 413 | body > 1 MB | `Request too large` | - |
| 415 | POST/PATCH without `application/json` | `Content-Type must be application/json` | - |
| 500 | unexpected | `Internal server error` | - |

## 5. Sequence diagrams

### 5.1 Generate with partial fit (TIME-5, TIME-4)

```mermaid
sequenceDiagram
  actor U as User
  participant UI as app.js
  participant S as server.js
  participant P as scheduler.planTasks
  participant DB as SQLite
  U->>UI: submit generate form
  UI->>UI: clearError(#gen-error); validate (checkValidity); setBusy(form, true)
  UI->>S: POST /api/generate (application/json)
  S->>S: requireJson, readBody, validate fields
  S->>DB: BEGIN; SELECT busy (replace off)
  S->>P: planTasks(tasks, busy, startMin, breakMin)
  P-->>S: plan, skipped
  alt plan empty
    S->>DB: ROLLBACK
    S-->>UI: 400 {error, unscheduled}
    UI->>UI: showError(#gen-error, list); focus region
  else at least one placed
    S->>DB: DELETE day (replace on); INSERT plan; COMMIT
    S-->>UI: 201 {entries, unscheduled}
    UI->>UI: currentEntries = entries; render()
    UI->>UI: showMessage(warning listing skipped, 'warn') or ('Timetable generated.', 'ok')
  end
  UI->>UI: setBusy(form, false)
```

### 5.2 Edit and save with overlap (TIME-3, TIME-12)

```mermaid
sequenceDiagram
  actor U as User
  participant UI as app.js
  participant S as server.js
  U->>UI: click Edit "Gym"
  UI->>UI: editingId = id; render(); focus title input
  U->>UI: change start to 09:30, press Save
  UI->>UI: diff vs original entry -> {start:"09:30"}
  UI->>S: PATCH /api/entries/:id {start}
  S-->>UI: 409 {error:"Overlaps with \"Standup\" (09:00-10:00)"}
  UI->>UI: showError(#edit-error-id, err) ; no field -> focus region
  U->>UI: press Escape
  UI->>UI: editingId = null; render(); focus Edit "Gym"
```

### 5.3 Validation error with field (TIME-12)

```mermaid
sequenceDiagram
  participant UI as app.js
  participant S as server.js
  UI->>S: POST /api/entries {start:"24:00", ...}
  S-->>UI: 400 {error:"24:00 is only allowed as an end time", field:"start"}
  UI->>UI: el = resolveField(addForm, "start")
  UI->>UI: el.aria-invalid=true; el.aria-describedby="add-error"; #add-error text; el.focus()
  Note over UI: next input event on el removes aria-invalid and clears #add-error
```

## 6. Frontend (`public/app.js`, `public/index.html`)

### 6.1 Module state and API client (WI-04, WI-10)

```js
let categories = [];
let currentEntries = [];     // last list from GET or generate (WI-08)
let editingId = null;        // id of the entry in edit mode, or null (WI-08)

class ApiError extends Error {
  constructor(message, status, body = {}) { super(message); this.status = status; this.body = body; }
}

async function api(path, options = {})   // returns parsed JSON or null (204); throws ApiError
// fetch rejects -> ApiError('Could not reach the server. Check that it is running.', 0)
// non-JSON error body -> ApiError(`Request failed (${status})`, status)
// !res.ok -> ApiError(data.error, res.status, data)
```

WI-04 minimal step: the generate handler reads `res.entries` (before WI-05/WI-10 refine it).

### 6.2 Error and message helpers (WI-05, WI-10; TIME-12, TIME-5)

```js
/** kind: 'ok' | 'warn' | '' ; '' with empty text hides #message. role=status (polite). */
function showMessage(text, kind = '')

/** Put err.message (and err.body.unscheduled as a list) into region; mark + focus the field or the region. */
function showError(region, err, resolveField = () => null)

/** Empty region; remove aria-invalid and aria-describedby from elements flagged by this region. */
function clearError(region)

/** Map a server field to an element. null if unknown (R9). */
function resolveField(form, field)
//  'date'                -> #date (header date input)
//  'tasks[i]'            -> taskRows.children[i] [name=title]
//  'tasks[i].x'          -> taskRows.children[i] [name=x]
//  'tasks'               -> #add-task button
//  other                 -> form.elements[field] ?? null

/** Client constraint check for novalidate forms. Returns true when valid; otherwise shows the first invalid element's validationMessage. */
function validateForm(form, region)

/** Disable the submit button and set aria-busy while a request runs. */
function setBusy(form, busy)
```

`showError` details:
1. `region.replaceChildren()`; append a text node with the message; if `err.body?.unscheduled?.length`, append `<ul>` with one `<li>` per task: `"<title>" (<minutes> min): <reason>` (all via `textContent`).
2. `el = resolveField(field)`. If `el`: `el.setAttribute('aria-invalid','true')`, `el.setAttribute('aria-describedby', region.id)`, `el.focus()`. Else `region.focus()` (region has `tabindex="-1"`).
3. A delegated `input`/`change` listener on each form: when the event target has `aria-invalid="true"`, remove both attributes and clear the region text. Field-less messages stay until the next submit.

The region is always present in the DOM (never `hidden` or `display:none`), empty when there is no error, so screen readers track it as a live region from page load; `role="alert"` announces new content.

Error routing:

| Action | Region | Focus target |
|---|---|---|
| Add form submit | `#add-error` | field or region |
| Generate submit | `#gen-error` | field (including task row inputs) or region |
| Edit Save | `#edit-error-<id>` | field in the edit form or region |
| Edit Save 404 | close edit, reload, `#schedule-error` | region |
| Toggle done, Delete, Clear day, day load, date navigation | `#schedule-error` | region (only for user-initiated actions, not on initial load) |

`#schedule-error` and `#message` are cleared on date navigation (as `showMessage('')` is today).

### 6.3 Markup changes (`index.html`, WI-10)

```html
<!-- schedule panel, after .panel-head -->
<div id="schedule-error" class="form-error" role="alert" tabindex="-1"></div>
<p id="message" role="status" class="message" hidden></p>        <!-- success / warning only -->

<form id="add-form" novalidate>
  <div id="add-error" class="form-error" role="alert" tabindex="-1"></div>
  ... unchanged fields ...
</form>

<form id="gen-form" novalidate>
  <div id="gen-error" class="form-error" role="alert" tabindex="-1"></div>
  ... unchanged fields ...
</form>
```

Regions sit at the top of their form so they are visually next to the fields and before them in reading order.

### 6.4 Day view entry row (WI-08, WI-11; TIME-3, TIME-12)

Normal row (DOM order = tab order: checkbox, Edit, Delete):

```html
<li class="entry cat-work" data-id="7">
  <span class="time">09:00 - 10:00</span>
  <span class="title"><strong>Gym</strong><span class="cat">work</span></span>
  <span class="actions">
    <input type="checkbox" aria-label='Mark "Gym" done'>
    <button class="secondary small edit" aria-label='Edit "Gym"'>Edit</button>
    <button class="danger small" aria-label='Delete "Gym"'>Delete</button>
  </span>
</li>
```

Edit-mode row (`e.id === editingId`):

```html
<li class="entry cat-work editing" data-id="7">
  <form class="edit-form" novalidate aria-label='Edit "Gym"'>
    <div id="edit-error-7" class="form-error" role="alert" tabindex="-1"></div>
    <label>Title <input name="title" required maxlength="100" value="Gym"></label>
    <div class="row">
      <label>Start <input type="time" name="start" required value="09:00"></label>
      <label>End <input type="time" name="end" required value="10:00"></label>
    </div>
    <label>Category <select name="category">...</select></label>
    <div class="edit-actions">
      <button type="submit">Save</button>
      <button type="button" class="secondary">Cancel</button>
    </div>
  </form>
</li>
```

24:00 fallback (A4), only when `e.end === '24:00'`:

```html
<label>End
  <input type="text" name="end" required value="24:00" inputmode="numeric" placeholder="HH:MM"
         pattern="([01]\d|2[0-3]):[0-5]\d|24:00" aria-describedby="edit-end-hint-7">
</label>
<small id="edit-end-hint-7" class="muted">HH:MM, 24:00 = midnight</small>
```

(When an error flags `end` in this case, `aria-describedby` is set to `edit-error-7 edit-end-hint-7`.)

### 6.5 Edit behaviour (WI-08, WI-09; TIME-3)

```js
function render(entries = currentEntries)        // stores currentEntries; builds rows; edit row for editingId
function renderEditForm(li, entry)               // builds the form above; focuses title on open
function openEdit(id)                            // editingId = id; render(); focus title
function cancelEdit(id)                          // editingId = null; render(); focusEditButton(id)
async function saveEdit(form, entry)             // see below
function focusEditButton(id)                     // scheduleEl.querySelector(`li[data-id="${id}"] .edit`)?.focus()
```

`saveEdit`:

```
region = form.querySelector('.form-error'); clearError(region)
if !validateForm(form, region): return
changes = {}
for k in ['title','start','end','category']:
  v = form.elements[k].value; if k == 'title' or k == 'end': v = v.trim()
  if v !== entry[k]: changes[k] = v          // never include done
if changes is empty: cancelEdit(entry.id); return
setBusy(form, true)
try:
  await api(`/entries/${entry.id}`, {method:'PATCH', body: changes})
  editingId = null; await load(); focusEditButton(entry.id)    // row may have moved after re-sort
catch err:
  if err.status == 404: editingId = null; await load(); showError(#schedule-error, err)
  else showError(region, err, f => form.elements[f] ?? null)  // entry unchanged, form stays open
finally: setBusy(form, false)   (if still in DOM)
```

Rules:
- One at a time: `openEdit(other)` simply re-renders; the previous form is discarded without a request.
- Escape: `keydown` on the edit form, `if (ev.key === 'Escape') { ev.preventDefault(); cancelEdit(entry.id); }`.
- `load()` keeps `editingId` only if that id is still in the list; otherwise resets it.
- Toggling done or deleting another entry while a row is in edit mode re-renders and keeps the edit form (values reset to the stored entry; acceptable, noted for the manual checklist).
- Generate success sets `editingId = null`.

### 6.6 Generate behaviour (WI-04, WI-05; TIME-5)

```
clearError(#gen-error); showMessage('')
if !validateForm(genForm, #gen-error): return
(confirm dialog for replace, unchanged)
setBusy(genForm, true)
res = await api('/generate', ...)
editingId = null; render(res.entries)
if res.unscheduled.length:
  showMessage(`Timetable generated. ${n} task(s) not scheduled: ` +
              res.unscheduled.map(u => `"${u.title}" (${u.minutes} min, ${u.reason})`).join('; '), 'warn')
else showMessage('Timetable generated.', 'ok')
on ApiError: showError(#gen-error, err, f => resolveField(genForm, f))
finally setBusy(genForm, false)
Task rows are never cleared (A2).
```

## 7. CSS changes (`public/style.css`, WI-05, WI-08, WI-10, WI-11; TIME-12, TIME-3, TIME-5)

### 7.1 Contrast results

Computed with the WCAG 2.1 relative-luminance formula (sRGB linearisation, `(L1+0.05)/(L2+0.05)`), by hand in this design; the tester re-checks with a tool (for example WebAIM Contrast Checker or the browser DevTools contrast picker) in WI-12. Values rounded to two decimals.

| Token | Use | Current | Ratio on #fff | AA 4.5:1 | Proposed | Ratio on #fff |
|---|---|---|---|---|---|---|
| `--work` | category text, left bar | #2f6fed | 4.55 | pass (narrow) | keep | 4.55 |
| `--study` | category text | #8a4fd8 | 5.01 | pass | keep | 5.01 |
| `--health` | category text | #1fa56b | 3.16 | **fail** | #187a4f | 5.34 |
| `--personal` | category text | #e08a1e | 2.68 | **fail** | #a85d00 | 4.96 |
| `--break` | category text | #8e9aa8 | 2.86 | **fail** | #5f6b78 | 5.44 |
| `--general` | category text | #4a5a6a | 7.09 | pass | keep | 7.09 |
| `--muted` | labels, done title | #6b7785 | 4.56 | pass (narrow) | keep | 4.56 |
| `--danger` | Delete text, error text | #d64545 | 4.38 (3.83 on #fdecec) | **fail** | #c53030 | 5.47 (4.79 on #fdecec) |
| success | `.message.ok` | #187a4f on #e7f6ee | 4.78 | pass | keep | 4.78 |
| warning (new) | `.message.warn` | - | - | - | #7a4300 on #fff4e0 | 7.33 |
| primary button | white on #2f6fed | | 4.55 | pass | keep | 4.55 |

Non-text (WCAG 1.4.11, 3:1):

| Item | Colour | Ratio | Result |
|---|---|---|---|
| Focus ring `--focus` #2f6fed on #fff card | | 4.55 | pass |
| Focus ring on page background #f4f6fa | | 4.20 | pass |
| Invalid field border #c53030 on #fff | | 5.47 | pass |
| Input border today #dde3ea on #fff | | 1.29 | fail (pre-existing) |
| Recommendation: `--field-border` #7b8794 for input/select borders | | 3.66 | pass |

The input border change is a Recommendation (small, inside WI-11, not explicitly in the AC); the left category bar keeps the hue, and the category name is always shown as text, so category is identifiable without colour (US-10 AC 2, already true).

Done entries: `opacity: 0.7` is removed (it would push `--muted` text to about 2.6:1). Done is shown by the checked checkbox, line-through title in `--muted` (4.56:1 on white).

### 7.2 Rules

```css
:root {
  --danger: #c53030; --health: #187a4f; --personal: #a85d00; --break: #5f6b78;
  --focus: #2f6fed; --field-border: #7b8794;      /* field-border: Recommendation */
  --warn-bg: #fff4e0; --warn-text: #7a4300;
}
input, select { border-color: var(--field-border); }   /* Recommendation */
:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
button:focus-visible, input:focus-visible, select:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.form-error:focus-visible { outline-offset: 0; }
[aria-invalid="true"] { border-color: var(--danger); box-shadow: 0 0 0 1px var(--danger); }
.form-error:empty { padding: 0; margin: 0; border: 0; }      /* still in the DOM, not display:none */
.form-error { padding: 8px 12px; border-radius: 6px; background: #fdecec; color: var(--danger);
              border-left: 4px solid var(--danger); margin: 0; }
.form-error ul { margin: 6px 0 0; padding-left: 18px; }
.message.warn { background: var(--warn-bg); color: var(--warn-text); }
.entry.done { opacity: 1; }                                   /* or delete the old rule */
.entry.editing { grid-template-columns: 1fr; }
.edit-form .edit-actions { display: flex; gap: 6px; }
```

## 8. Work item to file/function mapping

| WI | Story / Jira | Files | Functions / elements touched |
|---|---|---|---|
| WI-01 | TIME-14 / TIME-15 | `server.js` | `parseDate` (rewrite), `parseTime` (options `{allowEnd24, field}`), `createEntry`, `updateEntry` (end parse), `generateTimetable` (start parse) |
| WI-02 | TIME-14 / TIME-16 | `server.js` | `requireBoolean`, `requireJson`, `readJsonBody` (new); `updateEntry` (`done`); `generateTimetable` (`replace`, task object check, `withPrefix`); `handleApi` (use `readJsonBody`); server callback (safe `decodeURIComponent`) |
| WI-03 | TIME-14 / TIME-17 | `test/api.test.js` | new `raw(path, {method, headers, body})` helper; tests listed in the plan |
| WI-04 | TIME-5 / TIME-20 | `server.js`, `public/app.js`, `test/api.test.js` | `HttpError` (`extra`), catch block (`...e.extra`), `generateTimetable` (skip-and-continue, return `{entries, unscheduled}`, nothing-fits 400 before DELETE); `app.js` gen submit uses `res.entries`; generate-order test uses `res.data.entries` |
| WI-05 | TIME-5 / TIME-21 | `public/app.js`, `public/style.css`, `test/api.test.js` | gen submit handler (warning text), `showMessage(text, kind)`; `.message.warn`; tests partial/all/nothing fits, no trailing break |
| WI-06 | TIME-4 / TIME-22 | `scheduler.js` (new), `server.js`, `test/scheduler.test.js` (new) | `freeGaps`, `planTasks`; `generateTimetable` (busy query, remove 409 branch, call `planTasks`); unit tests E0-E12 |
| WI-07 | TIME-4 / TIME-23 | `test/api.test.js` | rewrite 'generate refuses ... clash' test; API tests for gap cases |
| WI-08 | TIME-3 / TIME-18 | `public/app.js`, `public/style.css` | `currentEntries`, `editingId`; `render`, `renderEditForm`, `openEdit`; `.entry.editing`, `.edit-form` |
| WI-09 | TIME-3 / TIME-19 | `public/app.js` | `saveEdit`, `cancelEdit`, `focusEditButton`, Escape handler, `load` (editingId reset) |
| WI-10 | TIME-12 / TIME-24 | `server.js`, `public/index.html`, `public/app.js`, `public/style.css` | `field` at all throw sites (section 4); `#schedule-error`, `#add-error`, `#gen-error`, `novalidate`; `ApiError`, `api`, `showError`, `clearError`, `resolveField`, `validateForm`, `setBusy`, add/gen/edit/schedule handlers (replace `run`); `.form-error`, `[aria-invalid]` |
| WI-11 | TIME-12 / TIME-25 | `public/app.js`, `public/style.css` | `aria-label` on Edit/Delete in `render`; `:root` colour tokens, `:focus-visible`, `.entry.done`, `--field-border` (Recommendation) |
| WI-14 (optional, Q1) | TIME-14 | `server.js`, `test/api.test.js` | `HOST` constant, `server.listen(PORT, HOST)`; `BASE` uses 127.0.0.1 |

WI-12 (manual verification) and WI-13 (README/CHANGELOG) do not change source; WI-13 uses HLD section 2 as the API reference.
