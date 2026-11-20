# Day Timetable Generator

A small app to plan your day. Add entries by hand, or list your tasks and let the app lay them out
into a timetable (highest priority first, with breaks in between).

## Requirements

- Node.js 22.5 or newer (uses the built-in `node:sqlite`; no `npm install` needed)

## Run

```bash
npm start
```

Open http://127.0.0.1:3000. Set `PORT`, `HOST` or `DB_FILE` to change the port, bind address or
database location (default `data/timetable.db`, created on first run). `HOST` defaults to `127.0.0.1`
(loopback only; the app has no authentication). Use `HOST=0.0.0.0` to expose it on the network.

## Test

```bash
npm test
```

## Features

- Day view with previous/next/today navigation
- Add, edit, delete and tick off entries (categories: work, study, health, personal, break, general)
- Overlapping entries are rejected
- Generate a timetable from tasks (duration, priority, category), a start time and break length.
  By default tasks are placed around the day's existing entries; with `replace` the day is cleared first
- Tasks that do not fit are skipped and reported (title, minutes, reason) instead of failing the request
- Input validation: real calendar dates, `HH:MM` times, titles 1-100 characters, task duration 5-480
  minutes, break 0-120 minutes, at most 50 tasks. `24:00` is accepted as an end time only
- Known limitations: the UI has not been verified in a browser (see `docs/testing.md`); generate still
  accepts a boolean `priority` (coerced to a number); a JSON array body gets a misleading error message

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/entries?date=YYYY-MM-DD` | List a day's entries |
| POST | `/api/entries` | Create `{date, title, start, end, category}`; `201` with the entry |
| PATCH | `/api/entries/:id` | Update title, times, category or `done` (`done` must be a boolean) |
| DELETE | `/api/entries/:id` | Delete an entry |
| DELETE | `/api/day?date=YYYY-MM-DD` | Clear a day |
| POST | `/api/generate` | `{date, start, breakMinutes, replace, tasks:[{title, minutes, priority 1-3, category}]}`; `replace` must be a boolean. Returns `201 {entries, unscheduled:[{title, minutes, reason}]}` |
| GET | `/api/categories` | List categories |
| GET/POST | `/api/templates` | List / save task templates `{name (1-50), tasks, replace?}`; duplicate name (case-insensitive) is `409` |
| DELETE | `/api/templates/:id` | Delete a template |
| POST | `/api/copy` | `{from, to, replace}`; `409 {existing}` when the target has entries and `replace` is false |
| GET | `/api/summary?from=&to=` | Per-day count, minutes, done (breaks excluded) plus per-category minutes and share (breaks included); max 31 days |
| GET | `/api/export?date=` | CSV download (`timetable-YYYY-MM-DD.csv`) |

Notes:

- `POST` and `PATCH` requests must send `Content-Type: application/json`, otherwise `415`.
- Errors are `{error}`; validation errors (`400`) may also include `field` (e.g. `end`, `tasks[0].minutes`).
  `409` means an overlap. If no task fits, generate returns `400` with `{error, unscheduled}` and the day is unchanged.
- Breaking change: `/api/generate` used to return the entries array; it now returns `{entries, unscheduled}`.

## Structure

```
server.js     HTTP server, REST API, SQLite storage
public/       Frontend (HTML, CSS, vanilla JS)
test/         API tests (node:test)
```
