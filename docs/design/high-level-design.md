# High-level design: Day planner iteration 1 (Epic TIME-2)

Phase: 3 (design). Status: draft for human approval.
Confluence: pending sync.
Traceability keys: stories TIME-14 (US-12/G11), TIME-5 (US-03), TIME-4 (US-02), TIME-3 (US-01), TIME-12 (US-10); work items WI-01..WI-14 from `docs/plan/implementation-plan.md`.

## 1. Modules and responsibilities

| Module | Responsibility | Changed by | Story |
|---|---|---|---|
| `server.js` - bootstrap | env (`PORT`, `DB_FILE`, Recommendation: `HOST`), DB open and `CREATE TABLE IF NOT EXISTS` (unchanged), listen | WI-14 (optional) | TIME-14 |
| `server.js` - errors | `HttpError(status, message, extra)`; top-level catch maps to JSON `{error, ...extra}`; unknown errors -> 500 | WI-04, WI-10 | TIME-5, TIME-12 |
| `server.js` - validation | `parseDate`, `parseTime({allowEnd24, field})`, `parseTitle`, `parseCategory`, `requireBoolean`, `requireJson`, task-object check | WI-01, WI-02, WI-10 | TIME-14, TIME-12 |
| `server.js` - entries service | `createEntry`, `updateEntry`, `listEntries`, `findOverlap` | WI-01, WI-02 | TIME-14, TIME-3 |
| `server.js` - generate service | `generateTimetable`: validate, load busy, call `planTasks`, transaction, build response | WI-04, WI-06 | TIME-5, TIME-4 |
| `scheduler.js` (NEW, pure) | `freeGaps`, `planTasks`: priority sort, first-fit placement, break rule. No I/O, no DB, no wording | WI-06 | TIME-4, TIME-5 |
| `server.js` - routing | `handleApi` (unchanged routes), `readJsonBody` (415 then body), static handler with safe decode | WI-02 | TIME-14 |
| `public/index.html` | add error regions, `novalidate` on forms | WI-10 | TIME-12 |
| `public/app.js` - API client | `api()` throws `ApiError(message, status, body)`; network failure message | WI-10 (WI-04 minimal `res.entries`) | TIME-12, TIME-5 |
| `public/app.js` - view | `render()` from cached `currentEntries`, Edit button, inline edit form, `editingId` state | WI-08, WI-09, WI-11 | TIME-3, TIME-12 |
| `public/app.js` - feedback | `showError`, `clearError`, `resolveField`, `showMessage(text, kind)` | WI-05, WI-10 | TIME-5, TIME-12 |
| `public/style.css` | focus ring, AA colours, error/invalid styles, edit layout, warning message | WI-05, WI-08, WI-10, WI-11 | TIME-3, TIME-5, TIME-12 |
| `test/api.test.js` | API regression and new behaviour; raw request helper | WI-03, WI-04, WI-05, WI-07 | TIME-14, TIME-5, TIME-4 |
| `test/scheduler.test.js` (NEW) | table-driven unit tests of `planTasks` | WI-06/WI-07 | TIME-4 |

## 2. API changes

### 2.1 Endpoint table (after this iteration)

| Method | Path | Request | Success | Errors | Change | Story |
|---|---|---|---|---|---|---|
| GET | `/api/entries?date=YYYY-MM-DD` | - | 200 `Entry[]` | 400 invalid date (`field:"date"`) | real calendar check | TIME-14 |
| POST | `/api/entries` | JSON `{date, title, start, end, category?}` | 201 `Entry` | 400 (+`field`), 409 overlap, 413, 415 | `end` may be `24:00`; 415 | TIME-14, TIME-12 |
| PATCH | `/api/entries/:id` | JSON, any of `{title, start, end, category, done}` | 200 `Entry` | 400 (+`field`), 404, 409, 413, 415 | `end` may be `24:00`; `done` must be boolean; 415 | TIME-14, TIME-3 |
| DELETE | `/api/entries/:id` | - | 204 | 400 invalid id, 404 | none | - |
| DELETE | `/api/day?date=` | - | 204 | 400 invalid date | real calendar check | TIME-14 |
| POST | `/api/generate` | JSON `{date, start?, breakMinutes?, replace?, tasks[]}` | **201 `{entries: Entry[], unscheduled: Unscheduled[]}`** | 400 validation (+`field`), 400 nothing fits (+`unscheduled`), 413, 415 | breaking response shape (D1); no 409 any more (TIME-4); 400 with task list (D2) | TIME-5, TIME-4 |
| GET | `/api/categories` | - | 200 `string[]` | - | none | - |
| GET | `/*` static | - | 200 file | 400 bad URL escape, 404, 405 | 400 instead of 500 | TIME-14 |

Types:

```
Entry       = { id: number, date: "YYYY-MM-DD", title: string, start: "HH:MM", end: "HH:MM" | "24:00",
                category: Category, done: boolean }
Unscheduled = { title: string, minutes: number, reason: string }
ErrorBody   = { error: string, field?: string, unscheduled?: Unscheduled[] }
```

### 2.2 `/api/generate` contract (D1, D2, D3, D4)

Request (unchanged fields; stricter types):

| Field | Rule | Default | Error `field` |
|---|---|---|---|
| `date` | real calendar date `YYYY-MM-DD` | required | `date` |
| `start` | `HH:MM`, `00:00`-`23:59`; `24:00` rejected (D5) | `"09:00"` | `start` |
| `breakMinutes` | integer 0-120 (unchanged coercion via `Number`) | 10 | `breakMinutes` |
| `replace` | boolean or absent; absent = false (A6) | false | `replace` |
| `tasks` | array, 1-50 items, each a non-null, non-array object | required | `tasks` / `tasks[i]` |
| `tasks[i].title` | 1-100 chars after trim | required | `tasks[i].title` |
| `tasks[i].minutes` | integer 5-480 | required | `tasks[i].minutes` |
| `tasks[i].priority` | 1, 2 or 3 | 2 | `tasks[i].priority` |
| `tasks[i].category` | one of categories | `general` | `tasks[i].category` |

`i` in `field` is the 0-based array index; the human-readable message keeps the 1-based number (`Task 2: duration must be 5-480 minutes`).

Responses:

- `201 {entries, unscheduled}`. `entries` = every entry of the day after commit, sorted by start (same as today's array). `unscheduled` = skipped tasks in priority order (ties by input order); empty array when everything fits.
- `400 {error, unscheduled}` when no task can be placed (D2). Nothing is deleted or inserted even with `replace:true`. `unscheduled` lists every task. Messages (Recommendation):
  - replace on: `No task fits before midnight; shorten tasks or start earlier`
  - replace off: `No task fits in the free time at or after HH:MM`
- Reason strings (A1, Recommendation): replace on `does not fit before midnight`; replace off `no free gap long enough at or after HH:MM` (HH:MM = chosen start).

Example (replace off, day has 10:00-12:00 and 13:00-24:00 booked, start 09:00, break 10):

```json
POST /api/generate
{"date":"2030-01-20","start":"09:00","breakMinutes":10,"replace":false,
 "tasks":[{"title":"Big","minutes":120,"priority":1},{"title":"Small","minutes":45},{"title":"Tiny","minutes":30,"priority":3}]}

201
{"entries":[{"title":"Small","start":"09:00","end":"09:45",...},{"title":"Meeting","start":"10:00","end":"12:00",...},
            {"title":"Tiny","start":"12:00","end":"12:30",...},{"title":"Evening","start":"13:00","end":"24:00",...}],
 "unscheduled":[{"title":"Big","minutes":120,"reason":"no free gap long enough at or after 09:00"}]}
```

### 2.3 Placement rules (D3, D4) - summary

1. Sort tasks by priority, then input order.
2. Busy intervals = existing day entries when `replace` is off; empty when on. Free gaps = complement of busy within `[start, 24:00)`; entries ending at or before `start` are ignored; an entry spanning `start` pushes the first gap to its end.
3. A forward-only cursor starts at `start`. Each task goes to the first gap whose usable part (from `max(gap.start, cursor)`) is long enough. `end == gap.end` counts as fitting, including `24:00`.
4. A break is placed only when the task would start exactly where the previously generated task ended, `breakMinutes > 0`, and break plus task fit in that gap. If only the task fits there, it is placed without a break. Never next to an existing entry, never trailing, never before a skipped task.
5. A task that fits nowhere is skipped; the cursor does not move; later tasks are still tried.
6. Replace on reproduces the existing order/break output exactly (existing test 'generates a timetable ordered by priority with breaks').

Consequence worth confirming: because the cursor is forward-only, a lower-priority short task is never placed in a gap that a higher-priority task already skipped past (worked example E5 in the LLD). This is what D3 says; flagged only so it is not a surprise in testing.

## 3. 24:00 handling (D5, A4, A5)

| Place | `24:00` as start | `24:00` as end |
|---|---|---|
| POST `/api/entries` | 400 `24:00 is only allowed as an end time` (`field:"start"`) | accepted, stored as 1440 |
| PATCH `/api/entries/:id` | 400 as above | accepted |
| POST `/api/generate` `start` | 400 as above | n/a |
| Generate output | never | a task may end at 24:00 (exact fit) |
| GET output | never | `fmt(1440)` = `24:00` (unchanged) |
| Edit form (UI) | native `type="time"` | native `type="time"` unless the entry's end is `24:00`; then a text input (A4, see LLD 4.3) |

A5 is confirmed by reading `updateEntry`: a PATCH of title/category/done on a 24:00 entry already works because the stored `end_min` is not re-parsed; the failure only happens when `end:"24:00"` is re-sent. The UI additionally sends only changed fields.

## 4. Error JSON and request validation (TIME-14, TIME-12)

- Body: `{error: string, field?: string, unscheduled?: Unscheduled[]}`. `field` is set only at throw sites that know the field (R9). Absent for 409 overlap, 404, 413, 415, invalid JSON, invalid id and nothing-fits.
- Field vocabulary: `date`, `title`, `start`, `end`, `category`, `done`, `breakMinutes`, `replace`, `tasks`, `tasks[i]`, `tasks[i].title|minutes|priority|category`. `End time must be after start time` uses `field:"end"`.
- Content-Type: POST and PATCH on matched API routes require media type `application/json` (parameters like `charset` allowed, case-insensitive); otherwise 415 `Content-Type must be application/json`. Checked before the body is read. GET/DELETE are not checked.
- Booleans: `done` (PATCH) and `replace` (generate) must be JSON `true`/`false` or absent. `"false"`, `0`, `1`, `null` -> 400 (A6).
- Dates: regex plus round-trip calendar check (`2030-02-31`, `2030-13-01`, `2030-00-10`, `2031-02-29` rejected; `2032-02-29`, `0001-01-01` accepted).
- Tasks: each must be a non-null, non-array object, else 400 `Task N: must be an object` (`field:"tasks[i]"`).
- Static path: `decodeURIComponent` failure -> 400 `Bad request`.

## 5. Frontend design summary (TIME-3, TIME-5, TIME-12)

- State: `currentEntries` (last loaded list) and `editingId` (null or the id in edit mode). Re-render is from `currentEntries`, so switching edit rows needs no request.
- Edit (TIME-3): Edit button per entry (including breaks), `aria-label='Edit "<title>"'`. One row at a time; opening another discards the first. Save sends PATCH with changed fields only (never `done`); Cancel and Escape restore and refocus the row's Edit button; success reloads (re-sort) and refocuses that entry's Edit button.
- Skipped tasks (TIME-5): partial success shows a warning in `#message` listing title, minutes and reason; all task rows kept (A2). Nothing-fits 400 shows the list in `#gen-error`.
- Errors (TIME-12): forms use `novalidate`; one `role="alert"` region per form (add, generate, edit) and one for schedule actions; client constraint failures and server errors use the same `showError` path; first invalid field gets `aria-invalid="true"` and focus; field-less errors focus the region; editing a flagged field clears its invalid state.
- Visual (TIME-12): `:focus-visible` ring 3 px, AA category colours, done entries without opacity, `aria-label`s with the entry title for Edit and Delete.
- Loading (small addition, TIME-3/TIME-5): submit buttons are disabled and the form gets `aria-busy="true"` while a request is in flight (prevents double generate and double save).

## 6. Decision Q4: extract placement into `scheduler.js`

Recommendation (for human confirmation): **extract** `planTasks` and `freeGaps` into `timetable-app/scheduler.js`, imported by `server.js`, with unit tests in `test/scheduler.test.js`.

Justification:

1. R2 is the highest technical risk (exact-fit, spanning entries, skipped tasks, break rules, 24:00). A pure function can be tested table-driven in milliseconds with exact inputs, without spawning the server or creating entries over HTTP for each case.
2. `server.js` is spawned as a process by the tests and calls `server.listen` at import time, so a function inside it cannot be imported by a unit test without restructuring the bootstrap. A separate module avoids touching the bootstrap.
3. Keeps `generateTimetable` focused on I/O (validation, DB, transaction, wording), and `planTasks` free of wording and DB, so reason texts (A1) can change without touching the algorithm.
4. Cost: one new file (about 50 lines) and one test file; no dependency; ES module like `server.js`; `npm test` already runs every file in `test/`.

Deviation note: this is the only new source file. Alternative if not approved: keep `planTasks` as a non-exported function in `server.js` and cover it only through API tests (WI-07 list); the algorithm in the LLD is identical either way.

## 7. Assumptions A1-A7 - recommendations for confirmation

| ID | Plan assumption | Recommendation |
|---|---|---|
| A1 | Reason wording | Recommendation: accept as written (section 2.2), plus the two nothing-fits messages proposed there. |
| A2 | Keep all task rows after generate | Recommendation: accept. The warning message names skipped tasks so the user can find their rows. Re-generate duplication (R11) goes to the manual checklist. |
| A3 | Optional `field` in error JSON | Recommendation: accept, with the field vocabulary in section 4 (`tasks[i].x`, 0-based). Client message-prefix mapping is not used. |
| A4 | 24:00 end in the edit form | Recommendation: text input only for the end field and only when the stored end is `24:00`; `pattern="([01]\d|2[0-3]):[0-5]\d|24:00"`, `inputmode="numeric"`, hint text. Changing a normal end to 24:00 from the UI remains impossible (native time input); noted as a limitation, not in any AC. |
| A5 | Fix = accept 24:00 as end on create/update/generate | Recommendation: confirmed by code reading (section 3). |
| A6 | Omitted `replace` = false; non-booleans 400 | Recommendation: accept. The bundled UI always sends a boolean. |
| A7 | README/API table by the documenter | Recommendation: accept (CLAUDE.md lets only the developer edit app source; README is documentation). The HLD endpoint table is the source for WI-13. |

## 8. Traceability

| Design element | Story | Work item |
|---|---|---|
| Real dates, 24:00 end-only | TIME-14 | WI-01 |
| 415, strict booleans, task object check, safe decode | TIME-14 | WI-02 |
| `HttpError.extra`, `{entries, unscheduled}`, nothing-fits 400 | TIME-5 | WI-04 |
| Skipped-tasks warning UI | TIME-5 | WI-05 |
| `scheduler.js` / `planTasks` gap placement | TIME-4 | WI-06, WI-07 |
| Edit button, edit form, one-at-a-time | TIME-3 | WI-08 |
| Save/Cancel/Escape, focus return | TIME-3 | WI-09 |
| `field` hint, error regions, aria-invalid, focus | TIME-12 | WI-10 |
| Focus ring, contrast, aria-labels | TIME-12 | WI-11 |
| `HOST` bind (Recommendation Q1) | TIME-14 | WI-14 (optional) |
