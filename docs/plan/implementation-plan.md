# Implementation plan: Day planner iteration 1 (Epic TIME-2)

Phase: 2 (plan). Status: draft for human approval.
Inputs: `docs/requirements.md`, Jira epic TIME-2 with children TIME-3..TIME-25 (refined acceptance criteria read from Jira), source in `timetable-app/` (server.js 257 lines, public/app.js, index.html, style.css, test/api.test.js, README.md), human decisions D1-D8.
Note: there is no `docs/analysis/analysis-report.md` on disk (the analyst could not write it). The Jira descriptions are the source of truth for acceptance criteria.

## 1. Scope

In scope, in this order (5 stories, 11 Jira sub-tasks):

| Order | Story | Title | Jira size | Planned effort |
|---|---|---|---|---|
| 1 | TIME-14 | Harden input validation and the end-of-day boundary | S | 6.0 h (recommend re-size to M) |
| 2 | TIME-5 | Report tasks that do not fit (defines /api/generate contract) | S | 5.5 h |
| 3 | TIME-4 | Generate around existing entries | M | 7.5 h |
| 4 | TIME-3 | Edit an existing entry (UI) | S | 6.0 h (recommend re-size to M) |
| 5 | TIME-12 | Accessible inline error feedback | S | 6.5 h (recommend re-size to M) |

Out of scope, stay in backlog (not planned in detail): TIME-6, TIME-7, TIME-8, TIME-9, TIME-10, TIME-11, TIME-13. Playwright is not used (D8), so UI behaviour is verified manually this run (section 6).

Effort is in ideal engineering hours for the developer agent, excluding review/test/doc phase wait time. Total about 31 h development (WI-01..WI-11) + 2 h manual UI verification + 1.5 h documentation = about 34.5 h.

## 2. Decisions applied (from analysis, human approved)

- D1: `POST /api/generate` returns `201 {entries, unscheduled:[{title, minutes, reason}]}`. Breaking change; UI and tests change in the same commit.
- D2: if no task fits, return `400` carrying the task list; save and delete nothing, even with replace on.
- D3: placement. Tasks in priority order (ties by entry order); a forward-only cursor starting at the chosen start; each task takes the first free gap at or after the cursor that fits; a task that fits nowhere is skipped and later (smaller) tasks are still tried.
- D4: in gap mode a break is inserted only between two consecutive generated tasks that are adjacent in time, and only if break plus next task both fit; never next to an existing entry; never after a skipped task or at the end.
- D5: `24:00` is accepted as an END time only (create, update, generate output). Never as a start, never as the generator day start.
- D8: no Playwright.

Planning assumptions I made (flag if you disagree; none contradict D1-D8):

- A1. `unscheduled[].reason` strings: replace on = `does not fit before midnight`; replace off = `no free gap long enough at or after HH:MM` (HH:MM is the chosen start). The wording is not fixed by D1; the Jira AC only fixes the midnight wording.
- A2. After a generate with skipped tasks, the UI keeps ALL task rows as today (nothing is cleared) and lists the skipped tasks by title in the message area. This satisfies "keeps those rows" without adding an `index` field to the contract. Whether scheduled rows should be cleared is deferred to TIME-6 (as the Jira text says). Side effect: pressing Generate again with replace off would schedule the same tasks twice; documented in the manual checklist.
- A3. TIME-12 needs to know which field an error belongs to. Server messages carry no field today. Plan: add an optional `field` property to error JSON (`{error, field}`, additive, existing clients unaffected) set where HttpError is thrown for date/title/start/end/category/minutes/priority. Fallback if you prefer no API change: map by message prefix in the client (more brittle).
- A4. For a 24:00 end in the edit form, the end input cannot be a native `<input type="time">` (it cannot hold 24:00). Plan: for that one case render the end field as a text input with `pattern` and `inputmode`; Save sends only changed fields, so an untouched 24:00 end is never re-sent. Final choice belongs to the design phase.
- A5. Nuance on TIME-14 AC 2: server-side PATCH of only title/category/done on a 24:00 entry already works today because the stored end is not re-parsed. The failure happens when a client re-sends `end:"24:00"` (as an edit form would). So the fix is: accept `24:00` as end in parseTime-for-end on create, update and generate.
- A6. Omitted `replace` in `/api/generate` stays equivalent to false (fit-around mode), same as today's falsy behaviour. Non-boolean values (`"false"`, `1`, `null`) return 400. Same for `done` on PATCH.
- A7. README and API-table edits (in TIME-23) are done in the documentation phase by the documenter, because CLAUDE.md allows only the developer to edit app source and README is documentation. Confirm if the developer should do it instead.

## 3. Open questions (not decided, need a human answer)

- Q1. Bind the server to `127.0.0.1` by default (today `server.listen(PORT)` listens on all interfaces, so anyone on the LAN can read and change the data; there is no auth)? Not part of any story. Options: (a) add to TIME-14 as a small item (about 0.5 h, env `HOST` to override), (b) leave for a later story, (c) accept the risk, README note only. Recommendation: (a), it is small and reduces the exposure that TIME-14 AC 6 (415) only partly addresses. Not planned or estimated in the totals above until decided.
- Q2. Should the three S-sized stories (TIME-14, TIME-3, TIME-12) be re-sized to M in Jira? Planned effort is 6 h each, which is above a typical S.
- Q3. A1 and A2 wording (see section 2).
- Q4. Extract placement into a pure module `timetable-app/scheduler.js` (see TIME-22)? Recommended, but it is a design decision (adds a file; stays dependency-free). Default if no answer: designer decides in the design phase.

## 4. Work items

Owner agents: developer = code and tests in `timetable-app/`; tester = verification and test report; documenter = README/CHANGELOG. "Validates" = phase that proves it (review = code-reviewer for all items; listed phase is the main proof).

| ID | Story | Jira key | Description | Est. | Depends on | Owner | Validated by |
|---|---|---|---|---|---|---|---|
| WI-01 | TIME-14 | TIME-15 | `parseDate`: real calendar check (build the date with `Date.UTC`/`setUTCFullYear`, round-trip year/month/day; handle years 0000-0099). `parseTime` gets an `allowEnd24` option; use it for `end` in create, update and generate; keep rejecting `24:00` as start and as generator day start. Output `fmt(1440)` already prints `24:00`. | 1.5 h | none | developer | testing (API tests, WI-03) |
| WI-02 | TIME-14 | TIME-16 | Reject malformed input with 4xx not 500: each task must be a non-null object (message names the task number, e.g. `Task 2: must be an object`); `done` (PATCH) and `replace` (generate) must be booleans or absent; require `Content-Type: application/json` on POST and PATCH (else 415); wrap `decodeURIComponent` in the static path so a bad escape returns 400. Centralise a `requireBoolean` helper. | 2 h | none (do after WI-01 to keep the diff reviewable) | developer | testing (API tests) |
| WI-03 | TIME-14 | TIME-17 | Extend `test/api.test.js`: invalid dates (GET, POST, DELETE /api/day, generate), 24:00 accepted as end on POST/PATCH/generate and rejected as start, PATCH title on a 24:00 entry, `tasks:[null]`, `tasks:[5]`, `tasks:["x"]`, non-boolean `done`/`replace`, missing/`text/plain` Content-Type (415), bad URL escape (`/%E0%A4%A` returns 400/404), PATCH 404, PATCH overlap 409, DELETE /api/day. Add a raw-fetch helper that can omit/override headers. | 2.5 h | WI-01, WI-02 | developer | testing |
| WI-04 | TIME-5 | TIME-20 | `generateTimetable()` skip-and-continue: replace the `throw` at the overflow check; compute the break from the NEXT SCHEDULED task, not `tasks[i+1]`; return `201 {entries, unscheduled:[{title, minutes, reason}]}` (unscheduled in priority order); if nothing fits, throw 400 BEFORE `BEGIN` so nothing is deleted (HttpError must be able to carry an extra `unscheduled` payload in the body). In the SAME commit make the minimal consumers compile and pass: `app.js` uses `res.entries`; the generate-order test uses `res.data.entries`. A task ending exactly at 24:00 counts as fitting. | 3 h | WI-03 | developer | testing |
| WI-05 | TIME-5 | TIME-21 | UI: after generate, render `entries`; when `unscheduled` is non-empty, show a message listing skipped titles (and reason) in the existing message area, keep all task rows (A2); no warning when all fit. Add tests: partial fit (saved + listed), all fit (empty `unscheduled`), nothing fits (400, existing entries kept, replace on), skipped task creates no trailing break. Existing 22:00 + 180 min overflow test stays valid. | 2.5 h | WI-04 | developer | testing (API) + manual UI checklist |
| WI-06 | TIME-4 | TIME-22 | Gap placement when `replace` is off: load day entries as busy intervals (inside the transaction), forward-only cursor, first-fit gap per task (D3), break rule D4 (adjacent generated tasks only, break plus task must fit contiguously; if only the task fits, place it without a break). Replace on = busy list empty = old behaviour plus WI-04 reporting. Remove the 409 clash branch. Still one transaction; roll back on any error. Recommended: put the pure placement in a function `planTasks({tasks, busy, startMin, breakMin})` (optionally `scheduler.js`, Q4) so it can be unit-tested without spawning the server. | 4 h | WI-04 | developer | testing |
| WI-07 | TIME-4 | TIME-23 | Rewrite the 'generate refuses plans that overflow the day or clash without replace' test: keep the overflow half (400), replace the clash half (409) with "task placed at 10:00 after existing 09:00-10:00". Add: exact-fit gap, adjacent entry (end == start) does not conflict, entry before chosen start ignored, entry spanning the chosen start (08:00-10:00, start 09:00 gives placement at 10:00), task bigger than every gap skipped while a later smaller task is placed, fully booked day (400, nothing saved), replace on ignores existing entries, no break next to existing entries, break between two adjacent generated tasks. | 3 h | WI-06 | developer | testing |
| WI-08 | TIME-3 | TIME-18 | `render()`: add an Edit button per entry (accessible name includes the title) and an inline edit form (title, start, end, category) pre-filled from the entry; only one entry in edit mode at a time (opening another cancels the first without saving); 24:00 end handled per A4. Breaks are editable too. | 3 h | WI-03 (24:00 accepted) | developer | review + manual UI checklist |
| WI-09 | TIME-3 | TIME-19 | Wire Save, Cancel, Escape: Save sends PATCH with changed fields only (never `done`); server messages (400/409) shown inside the edit form and the entry stays unchanged; Cancel and Escape restore the row and return focus to that entry's Edit button; list re-sorts after save (`load()`); editing does not alter `done`. | 3 h | WI-08 | developer | manual UI checklist + testing (PATCH API tests from WI-03) |
| WI-10 | TIME-12 | TIME-24 | One error region per form (add, generate, edit) with `role="alert"`; set `aria-invalid="true"` on the offending field and focus the first invalid one; errors without a field (409 overlap) focus the message; clear invalid state on input; keep the global `#message` (role=status) for success notices only. Server change per A3: optional `field` in error JSON (about 0.5 h of the estimate). | 4 h | WI-09 (so the edit form gets the same pattern) | developer | review + manual UI checklist |
| WI-11 | TIME-12 | TIME-25 | `aria-label` for Edit and Delete with the entry title (checkbox already has one); `:focus-visible` outline (3:1 or better) on buttons, inputs, selects, checkboxes; fix category text contrast to WCAG AA 4.5:1 (several category colours on white are likely below it, verify) and replace done-entry `opacity:0.7` with colours that keep AA; document contrast check results (tool and ratios). | 2.5 h | WI-10 (same files) | developer | manual UI checklist + review |
| WI-12 | TIME-3, TIME-12, TIME-5 | (no Jira sub-task) | Manual UI verification script and run: edit flow, Escape/focus return, 24:00 entry edit, skipped-tasks message, replace-off generation, keyboard-only pass, screen-reader spot check of role=alert, contrast ratios. Store the result under `docs/testing/`. | 2 h | WI-05, WI-09, WI-11 | tester | testing |
| WI-13 | TIME-4, TIME-5, TIME-14 | (part of TIME-23) | README: feature list (edit, fit-around, skipped tasks), API table (`/api/generate` response shape, 415, 24:00 end-only), error `field` hint. CHANGELOG entry noting the breaking `/api/generate` response. | 1.5 h | WI-11 | documenter | documentation |

Per-story totals: TIME-14 = WI-01..03 = 6.0 h; TIME-5 = WI-04..05 = 5.5 h; TIME-4 = WI-06..07 = 7.0 h (+0.5 h of WI-13) = 7.5 h; TIME-3 = WI-08..09 = 6.0 h; TIME-12 = WI-10..11 = 6.5 h. WI-12 and the rest of WI-13 are shared.

Optional (only if Q1 = yes): WI-14 TIME-14 `HOST` env, default `127.0.0.1`, README note, one test, 0.5 h, depends on WI-02.

### Dependency chain

```
WI-01 -> WI-02 -> WI-03 -> WI-04 -> WI-05 -> WI-06 -> WI-07 -> WI-08 -> WI-09 -> WI-10 -> WI-11 -> WI-12 -> WI-13
```

It is deliberately linear. Reasons: WI-04/WI-06 both rewrite `generateTimetable()`; WI-05, WI-08..11 all touch `public/app.js`, `index.html` or `style.css`; the edit story needs the 24:00 end from TIME-14; TIME-12 reuses the edit form from TIME-3. Only WI-01/WI-02 could be done in parallel, but they share `server.js` and the saving is small.

## 5. Risks and mitigations

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | D1 breaking change breaks the UI or tests mid-way | Red build between commits | WI-04 commit includes the minimal `app.js` and test adaptation; each commit must pass `npm test` |
| R2 | Placement edge cases (break rules, skipped tasks, exact fit, entry spanning start, 24:00 boundaries) | Wrong schedules, silent data errors | Pure `planTasks` function, table-driven tests listed in WI-07; replace-on path must reproduce the existing generate-order expectation exactly |
| R3 | Nothing-fits case deleting data when replace is on | Data loss | Decide before `BEGIN`; test: existing entries still present after a 400 with replace on |
| R4 | Same-file conflicts in `app.js`/`style.css` | Rework | Strictly sequential order, one developer |
| R5 | 24:00 cannot be shown in `<input type="time">` | Edit of a full-day entry fails or silently changes the end | A4 text-input fallback; Save sends changed fields only; manual check item |
| R6 | No automated UI tests this run (D8) | Regressions in edit/inline error code unnoticed | Manual checklist in WI-12; keep UI logic small and DOM-based; TIME-13 remains the follow-up |
| R7 | Stricter validation (415, boolean flags, real dates) breaks other clients | 4xx for callers that sent loose JSON | Only the bundled UI calls the API (it sends JSON and booleans); README documents; low risk |
| R8 | Contrast fixes change the visual design | UI feedback | Use darker shades of the same hues, keep the left colour bar; show before/after to the human in the review phase |
| R9 | Error `field` hint (A3) misattributes a field | Wrong focus target | Set `field` only at the throw site that knows it; unknown falls back to focusing the message |
| R10 | Server reachable from the network (Q1) | Data exposure on shared networks | Open question Q1; mitigation depends on the answer |
| R11 | Re-generating with replace off and kept rows duplicates tasks (A2) | User confusion | Documented in manual checklist; revisit with TIME-6 |
| R12 | `timetable-app/` is not under version control | No history, no safe rollback | See section 7 prerequisites |

### Rollback approach

- No database schema change in this run, so existing `data/timetable.db` files stay compatible in both directions. Back up the file (copy) before the first manual run.
- Code rollback is per commit (`git revert <sha>`), one commit per work item. WI-04 (response contract) and WI-05 (UI use of it) must be reverted together; WI-06/07 can be reverted independently of TIME-3 and TIME-12.
- The 24:00 entries saved by new code are valid for old code too (old code can read and display them, it just cannot re-send them).
- Feature-level fallback: if gap placement proves wrong late, revert only WI-06/07 and the product still has TIME-5 behaviour (replace off then yields 409 again, with WI-07 tests reverted).

## 6. Test strategy

Layers:

1. API tests (`node:test`, existing harness: spawned server on port 3999, `DB_FILE=:memory:`, runs with plain `npm test`, no install). New and changed tests are listed in WI-03, WI-05, WI-07. Test-first is encouraged; every commit must be green.
2. Optional unit tests for `planTasks` if it is extracted (WI-06), importing the pure function directly: faster and exact for gap cases.
3. Manual UI verification (WI-12), owned by the tester: scripted steps with expected results, run in a browser, screenshots or notes in `docs/testing/`. Covers what API tests cannot: Edit/Save/Cancel/Escape, focus return, one-edit-at-a-time, skipped-task message, inline errors with role=alert and aria-invalid, focus visibility, keyboard-only pass, contrast ratios (documented tool).
4. Static review (code-reviewer): checks no regressions in validation, transaction use, no XSS (UI must keep using `textContent`), no new dependencies.

Test impact on existing tests:

| Existing test | After | Reason |
|---|---|---|
| 'generates a timetable ordered by priority with breaks' | Edit: use `res.data.entries` | D1 |
| 'generate refuses plans that overflow the day or clash without replace' | Overflow half unchanged (400); clash half rewritten to expect placement at 10:00 | TIME-4 |
| Others | Unchanged | New Content-Type check satisfied by the existing helper |

Acceptance-criterion coverage check (each Jira AC maps to at least one test or checklist step): TIME-14 AC1-7 -> WI-03; TIME-5 AC and added ACs -> WI-05 (API) and WI-12 (UI message); TIME-4 ACs and testable ACs -> WI-07; TIME-3 ACs -> WI-12 plus PATCH API tests; TIME-12 ACs -> WI-12 (alert role, focus, contrast), automated version deferred to TIME-13.

Quality gates per commit: `npm test` green; no console errors on page load; no new files outside the plan.

## 7. Git and branch strategy

Current state: `git status` reports "not a git repository" at the project root. `timetable-app/` has no `.git` either (it lives inside the project root, which also holds `docs/`, `hooks/`, `.claude/`). I did not run `git init`.

Needed before the developer phase (human action):

1. `git init` at the PROJECT ROOT (not inside `timetable-app/`), so docs, hooks and the app share one history and the PR can reference all of them.
2. Add `.gitignore` with at least: `.env`, `node_modules/`, `timetable-app/data/*.db`, `timetable-app/data/*.db-*` (the current `timetable-app/data/timetable.db` must not be committed; it holds personal data).
3. Make an initial commit of the baseline on `main` (this is the rollback point and the diff base for the PR).
4. Add a remote only if you want a hosted PR; nothing is pushed by the pipeline unless you ask.

Branching:

- One feature branch for this run: `feature/TIME-2-planner-hardening-and-edit` created from `main`. Reason: the five stories are strictly sequential and share files, and the review phase works on one diff.
- Alternative if you prefer smaller PRs: five stacked branches `feature/TIME-14-input-hardening`, `feature/TIME-5-report-unscheduled`, `feature/TIME-4-fit-around-existing`, `feature/TIME-3-edit-entry`, `feature/TIME-12-accessible-errors`, each merged in order. More overhead for no real benefit with one developer; not recommended.
- One PR, titled with the epic key, listing all stories (draft in `docs/plan/pull-request-draft.md`). Merge with a merge commit or rebase (not squash) to keep one commit per work item.

Commit convention:

- One commit per work item (WI-01..WI-11), message `TIME-<sub-task key>: <imperative summary>`, for example `TIME-15: validate real calendar dates and accept 24:00 as end time`; body references the parent story (`Story: TIME-14`). End with the attribution line required by the project (`Co-Authored-By: Claude Code <noreply@anthropic.com>`).
- Every commit builds and passes `npm test`. WI-04 intentionally includes the small `app.js` and test adaptation (R1).
- Documentation commit(s) for WI-13: `TIME-23: document ...` / `TIME-2: changelog`.
- Do not commit `approvals.json` or `progress.md` changes from agents; those go through `node hooks/approve.js`.

Jira workflow (per `jira.config.json` transitions): story and sub-tasks go In Progress at the start of development, In Review at the review phase, In Testing at the testing phase, Done after documentation.

## 8. Jira traceability

| Requirement (docs/requirements.md) | Story key | Sub-task key | Work item | Test coverage | Validating phase |
|---|---|---|---|---|---|
| G11 (new): validation and 24:00 boundary | TIME-14 | TIME-15 | WI-01 | WI-03 | testing |
| G11 | TIME-14 | TIME-16 | WI-02 | WI-03 | testing |
| G11 | TIME-14 | TIME-17 | WI-03 | itself | testing |
| US-03 / G7 | TIME-5 | TIME-20 | WI-04 | WI-05 | testing |
| US-03 / G7 | TIME-5 | TIME-21 | WI-05 | WI-05, WI-12 | testing |
| US-02 / G2 | TIME-4 | TIME-22 | WI-06 | WI-07 | testing |
| US-02 / G2 | TIME-4 | TIME-23 | WI-07, WI-13 (README) | itself | testing, documentation |
| US-01 / G1 | TIME-3 | TIME-18 | WI-08 | WI-12 | review, testing |
| US-01 / G1 | TIME-3 | TIME-19 | WI-09 | WI-03 (PATCH), WI-12 | review, testing |
| US-10 / G9 | TIME-12 | TIME-24 | WI-10 | WI-12 | review, testing |
| US-10 / G9 | TIME-12 | TIME-25 | WI-11 | WI-12 | review, testing |
| Epic | TIME-2 | n/a | all | n/a | documentation closes the epic |

Backlog (not planned): TIME-6 (US-04), TIME-7 (US-05), TIME-8 (US-06), TIME-9 (US-07), TIME-10 (US-08), TIME-11 (US-09), TIME-13 (US-11).

## 9. Other findings covered

| Finding | Work item |
|---|---|
| `Date.parse('2030-02-31')` accepted | WI-01 |
| `tasks:[null]` returns 500 | WI-02 |
| Malformed URL escape returns 500 | WI-02 |
| `done:"false"` treated as true (and `replace`) | WI-02 |
| No Content-Type check on POST/PATCH | WI-02 |
| Breaks have a done checkbox but are excluded from progress | Not fixed in scope. Edit form allows editing breaks (WI-08). Needs a human decision (hide the checkbox for breaks, or count breaks) and belongs to TIME-11/TIME-12 follow-up. Listed here so it is not lost. |
| 24:00 end cannot be edited from the UI | WI-01 + WI-08 (A4/A5) |
| Test gaps: PATCH validation/404/409, DELETE /api/day, boundary times | WI-03 |

## 10. Decisions needed from the human

1. Approve this plan and the linear order.
2. Q1: bind to 127.0.0.1 by default (add WI-14) or not.
3. Create the git repository and `.gitignore` described in section 7 before the developer phase (or tell the pipeline to proceed without version control, with higher risk R12).
4. A1/A2/A3/A7 confirmations (reason wording, keep all rows, `field` hint in errors, who edits README).
5. Q2: re-size TIME-14, TIME-3, TIME-12 from S to M in Jira.
6. Q4: extract `scheduler.js` or keep everything in `server.js`.
