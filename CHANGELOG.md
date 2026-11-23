# Changelog

All notable changes delivered through the SDLC pipeline are recorded here by the `documenter` agent.

## [Unreleased]

### Added
- Edit an existing entry (title, times, category) from the day view (TIME-3)
- Generate now fits tasks around existing entries; `replace: true` clears the day first (TIME-4)
- Tasks that do not fit are reported in `unscheduled` with a reason (TIME-5)
- Stricter input validation with `field` in error bodies; `24:00` accepted as end time only (TIME-12)
- `415` for non-JSON `POST`/`PATCH` bodies; `done` and `replace` must be booleans (TIME-14)
- `HOST` environment variable for the bind address
- Save and reuse task lists as named templates: `GET/POST /api/templates`, `DELETE /api/templates/:id` (TIME-6)
- Copy a day's entries to another date: `POST /api/copy` (TIME-7)
- Week overview and per-day/per-category summary endpoint: `GET /api/summary?from=&to=` (TIME-8, TIME-9)
- Export a day as CSV and a print stylesheet: `GET /api/export?date=` (TIME-10)
- Full frontend rewrite: React 18 + Tailwind CSS (built with Vite into `public/`), replacing the vanilla
  HTML/CSS/JS UI. Same API, new look: glassmorphism cards, hover/scale micro-interactions, lucide icons,
  category colour chips with text/icon identity, and a confirm-dialog component replacing `window.confirm`
  (direct request, outside the SDLC pipeline)

### Changed
- BREAKING: `POST /api/generate` now returns `201 {entries, unscheduled:[{title, minutes, reason}]}` instead of a bare entries array
- BREAKING: server binds to `127.0.0.1` by default (was all interfaces); set `HOST=0.0.0.0` to expose it
- The app is no longer dependency-free end-to-end: `frontend/` has its own `npm install`/`npm run build`
  step (React, Tailwind, Vite). `server.js` itself still has zero runtime dependencies, and `npm start`/
  `npm test` at the project root still need no install.

### Removed
- The vanilla JS/HTML/CSS frontend (`public/index.html`, `public/app.js`, `public/style.css`), replaced
  by the Vite build output

### Known issues
- UI not browser-verified (docs/testing.md); boolean `priority` still accepted on generate; array-body error message is misleading
- Sub-tasks TIME-15..TIME-25 cover the implementation, tests and docs of TIME-3/4/5/12/14 (Story TIME-2)
