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

### Changed
- BREAKING: `POST /api/generate` now returns `201 {entries, unscheduled:[{title, minutes, reason}]}` instead of a bare entries array
- BREAKING: server binds to `127.0.0.1` by default (was all interfaces); set `HOST=0.0.0.0` to expose it

### Known issues
- UI not browser-verified (docs/testing.md); boolean `priority` still accepted on generate; array-body error message is misleading
- Sub-tasks TIME-15..TIME-25 cover the implementation, tests and docs of the above (Story TIME-2)
