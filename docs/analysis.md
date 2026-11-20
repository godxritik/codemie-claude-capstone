# Phase 1: Analysis

Agent: requirements-analyst. Status: approved by Ritik Gaur (iteration 1).
Inputs: `docs/requirements.md`, Jira epic TIME-2 and stories TIME-3..TIME-13, source in `timetable-app/`.
Note: the analyst could not write its own report file (subagent Write was refused). This page is the orchestrator's record of its returned report.

## Gap validation (against the code)

| Gap | Verdict | Evidence or correction |
|---|---|---|
| G1 no edit UI | Confirmed | `render()` in `public/app.js` has only a checkbox and Delete; PATCH exists on the server |
| G2 generate ignores existing entries | Confirmed | `generateTimetable()` returns 409 on the first overlap |
| G3 tasks not persisted | Confirmed | `addTaskRow()` starts with one empty row |
| G4 no copy or templates | Confirmed | no endpoint |
| G5 single-day view only | Confirmed | `GET /api/entries` takes one date |
| G6 no export or print | Confirmed | no export route, no `@media print` |
| G7 one unfittable task aborts everything | Confirmed | `throw` in `generateTimetable()` |
| G8 no current/overdue cue | Confirmed | no time logic in `render()` |
| G9 accessibility | Partly overstated | `role="status"` and text category labels already exist; real defects are errors using status not alert, message far from forms, unverified contrast, identical Delete button names, no `:focus-visible` |
| G10 no UI tests | Confirmed | only `test/api.test.js` |
| G11 input hardening and 24:00 boundary | New | see below; story TIME-14 |

## Additional findings

1. `parseDate` uses `Date.parse`, so impossible dates such as `2030-02-31` are accepted.
2. Generation can store an entry ending at `24:00`, but `parseTime` rejects `24:00`; a client that re-sends it gets 400. This blocks the edit story (TIME-3).
3. `tasks:[null]` and a malformed URL escape return 500 instead of 4xx.
4. `done:"false"` and `replace:"false"` are treated as true.
5. No Content-Type check on POST/PATCH (low-severity CSRF).
6. The server listens on all interfaces with no authentication (raised as a question only).
7. Breaks have a done checkbox but are excluded from progress; overdue logic must exclude them.
8. Test gaps: PATCH validation, 404, `DELETE /api/day`, boundary times, invalid dates.
9. No XSS risk: the frontend uses `textContent`.

## Existing tests affected

- 'generate refuses ... clash without replace' (expects 409) must be rewritten after TIME-4.
- The generate-order test must read `res.data.entries` after TIME-5.
- The 22:00 + 180 min overflow test (400) stays valid.

## Design decisions proposed and accepted

| # | Decision |
|---|---|
| D1 | `POST /api/generate` returns `201 {entries, unscheduled:[{title, minutes, reason}]}` |
| D2 | If no task fits: 400 with the task list, nothing saved or deleted even with replace on |
| D3 | Tasks placed in priority order; forward-only cursor; first free gap that fits; unfit tasks skipped, later smaller ones still tried |
| D4 | In gap mode, breaks only between two consecutive generated tasks adjacent in time, and only if break and next task fit |
| D5 | `24:00` accepted as an end time only |
| D6 | Week view excludes breaks; category summary includes break; week starts Monday; shared `GET /api/summary?from&to` |
| D7 | No overdue marker on any date other than today |
| D8 | Playwright as dev-only dependency with separate `test:e2e` script (not used in this run) |

## Dependency order

```
TIME-14 -> TIME-3 -> TIME-12 -> TIME-13
TIME-5 -> TIME-4 -> TIME-13
TIME-8 -> TIME-9
```

TIME-4 and TIME-5 both rewrite `generateTimetable()`; TIME-3, TIME-12, TIME-11, TIME-8, TIME-7 touch the same UI files, so they run sequentially.

## Scope approved for this run

Must: TIME-14, TIME-3, TIME-5, TIME-4. Should: TIME-12. Next run: TIME-13, TIME-7, TIME-10, TIME-6, TIME-8. Deferred: TIME-9, TIME-11.

## Jira changes made by the analyst

- TIME-2 and TIME-3..TIME-13 updated in place (refined acceptance criteria appended).
- New story TIME-14 (US-12, harden input validation and end-of-day boundary).
- New sub-tasks TIME-15..TIME-17 (under TIME-14), TIME-18..TIME-19 (TIME-3), TIME-20..TIME-21 (TIME-5), TIME-22..TIME-23 (TIME-4), TIME-24..TIME-25 (TIME-12).

## Open questions at approval time

Playwright approval and report location (not needed this run), template scope and duplicate names (TIME-6, deferred), bind to `127.0.0.1` (carried to the plan).
