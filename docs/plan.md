# Phase 2: Plan

Agent: planner. Status: approved by Ritik Gaur (iteration 1).
Full detail: `docs/plan/implementation-plan.md`; PR draft: `docs/plan/pull-request-draft.md`.

## Scope and order

Five stories, strictly sequential because they share `server.js`, `public/app.js`, `index.html` and `style.css`:

| Order | Story | Title | Planned effort |
|---|---|---|---|
| 1 | TIME-14 | Harden input validation and the end-of-day boundary | 6.0 h |
| 2 | TIME-5 | Report tasks that do not fit (defines the `/api/generate` contract) | 5.5 h |
| 3 | TIME-4 | Generate around existing entries | 7.5 h |
| 4 | TIME-3 | Edit an existing entry (UI) | 6.0 h |
| 5 | TIME-12 | Accessible inline error feedback | 6.5 h |

Total about 34.5 h across 13 work items (WI-01..WI-13). Backlog (not planned): TIME-6, 7, 8, 9, 10, 11, 13.

## Work items

| ID | Jira | Summary | Owner |
|---|---|---|---|
| WI-01 | TIME-15 | Real calendar dates; accept `24:00` as end only | developer |
| WI-02 | TIME-16 | 4xx not 500 for bad input; boolean flags; 415 for wrong Content-Type; safe URL decoding | developer |
| WI-03 | TIME-17 | API tests for the above | developer |
| WI-04 | TIME-20 | Generate skip-and-continue; response `{entries, unscheduled}`; 400 before `BEGIN` if nothing fits | developer |
| WI-05 | TIME-21 | UI shows skipped tasks; tests for partial/all/none fit | developer |
| WI-06 | TIME-22 | Free-gap placement when replace is off (`planTasks`) | developer |
| WI-07 | TIME-23 | Placement tests; rewrite the clash test | developer |
| WI-08 | TIME-18 | Edit button and inline edit form | developer |
| WI-09 | TIME-19 | Save, Cancel, Escape, inline server errors | developer |
| WI-10 | TIME-24 | `role="alert"` error regions, `aria-invalid`, focus the first invalid field; optional `field` in error JSON | developer |
| WI-11 | TIME-25 | Accessible names, `:focus-visible`, AA contrast | developer |
| WI-12 | TIME-3, 5, 12 | Manual UI verification (no Playwright this run), report in `docs/testing/` | tester |
| WI-13 | TIME-4, 5, 14 | README, API table, CHANGELOG (breaking `/api/generate` response) | documenter |

## Key risks

- Contract change to `/api/generate` (D1) can leave a red build; the WI-04 commit includes the minimal UI and test adaptation.
- Placement edge cases; mitigated by a pure `planTasks` function and table-driven tests.
- A nothing-fits request must not delete data when replace is on (decide before `BEGIN`).
- `24:00` cannot be shown in `<input type="time">`; use a text-input fallback and send only changed fields.
- No automated UI tests this run; a manual checklist covers them and TIME-13 stays as follow-up.
- The project is not under version control (see below).

## Git and branch strategy

- Project root is not a git repository. Before development: `git init` at the project root, add `.gitignore` (`.env`, `node_modules/`, `timetable-app/data/*.db`, `timetable-app/data/*.db-*`), and make a baseline commit on `main`.
- One branch `feature/TIME-2-planner-hardening-and-edit`, one PR, one commit per work item named `TIME-<sub-task>: <summary>`, each commit passing `npm test`. Nothing is pushed unless the user asks.

## Open items left to later phases

- Bind the server to `127.0.0.1` by default (optional WI-14, 0.5 h).
- Resize TIME-14, TIME-3 and TIME-12 from S to M in Jira.
- Extract the placement logic into `scheduler.js` (designer to decide).
- Assumptions A1-A7 (reason wording for skipped tasks, keep all task rows after generate, additive `field` in error JSON, text input for a `24:00` end, README edited by the documenter, omitted `replace` means false).

## Jira activity

The planner posted summary comments on TIME-2, TIME-3, TIME-4 and TIME-12. Only the TIME-2 comment was requested; comments on TIME-5 and TIME-14 were blocked and not retried.
