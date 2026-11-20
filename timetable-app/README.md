# Day Timetable Generator

A small app to plan your day. Add entries by hand, or list your tasks and let the app lay them out
into a timetable (highest priority first, with breaks in between).

## Requirements

- Node.js 22.5 or newer (uses the built-in `node:sqlite`; no `npm install` needed)

## Run

```bash
npm start
```

Open http://localhost:3000. Set `PORT` or `DB_FILE` to change the port or database location
(default `data/timetable.db`, created on first run).

## Test

```bash
npm test
```

## Features

- Day view with previous/next/today navigation
- Add, delete and tick off entries (categories: work, study, health, personal, break, general)
- Overlapping entries are rejected
- Generate a timetable from tasks (duration, priority, category), a start time and break length;
  optionally replaces the day's existing entries

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/entries?date=YYYY-MM-DD` | List a day's entries |
| POST | `/api/entries` | Create `{date, title, start, end, category}` |
| PATCH | `/api/entries/:id` | Update title, times, category or `done` |
| DELETE | `/api/entries/:id` | Delete an entry |
| DELETE | `/api/day?date=YYYY-MM-DD` | Clear a day |
| POST | `/api/generate` | `{date, start, breakMinutes, replace, tasks:[{title, minutes, priority 1-3, category}]}` |
| GET | `/api/categories` | List categories |

## Structure

```
server.js     HTTP server, REST API, SQLite storage
public/       Frontend (HTML, CSS, vanilla JS)
test/         API tests (node:test)
```
