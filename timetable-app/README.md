# Day Timetable Generator

A small app to plan your day. Add entries by hand, or list your tasks and let the app lay them out
into a timetable (highest priority first, with breaks in between).

## Requirements

- Node.js 22.5 or newer (uses the built-in `node:sqlite`; no `npm install` needed to run the server)
- The frontend is pre-built into `public/`; you only need Node+npm in `frontend/` if you're changing the UI

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

## Frontend development

The UI is a React + Tailwind app in `frontend/`, built with Vite into `public/` (which `server.js`
serves as static files; `server.js` itself is unaware of React/Vite). To change the UI:

```bash
cd frontend
npm install
npm run dev      # dev server on :5173, proxies /api to http://127.0.0.1:3000 (run `npm start` in another terminal)
npm run build    # rebuilds public/ for `npm start` to serve
```

Commit the rebuilt `public/` output together with your `frontend/src` changes so `npm start` keeps
working without an install.

## Features

- Day and week views; the week view shows per-day entry count, planned minutes and done count (breaks excluded)
- Add, edit, delete and tick off entries (categories: work, study, health, personal, break, general),
  each identifiable by text/icon as well as colour
- Overlapping entries are rejected
- Generate a timetable from tasks (duration, priority, category), a start time and break length.
  By default tasks are placed around the day's existing entries; with `replace` the day is cleared first
- Tasks that do not fit are skipped and reported (title, minutes, reason) instead of failing the request
- Save a task list as a named template and reload it later; copy a whole day to another date
- Time-by-category breakdown for the selected day (breaks included), with a share of the planned time
- Export the selected day as CSV, or print it (print styles hide the forms and controls)
- Input validation: real calendar dates, `HH:MM` times, titles 1-100 characters, task duration 5-480
  minutes, break 0-120 minutes, at most 50 tasks. `24:00` is accepted as an end time only
- Known limitations: the UI has not been verified in a real browser (no browser tooling was available
  while building it — see `docs/testing.md`); generate still accepts a boolean `priority` (coerced to a
  number); a JSON array body gets a misleading error message

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
scheduler.js  Pure task-placement logic used by /api/generate
summary.js    Pure week/category summary helpers
export.js     CSV builder for /api/export
frontend/     React + Tailwind UI source (Vite); builds into public/
public/       Built frontend (served as static files; generated, do not hand-edit)
test/         API and unit tests (node:test)
```
