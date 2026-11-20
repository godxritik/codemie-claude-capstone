Verdict: APPROVED

# Code review: feature/TIME-2-planner-hardening-and-edit (12 commits vs main)

Scope: `git diff main...feature/TIME-2-planner-hardening-and-edit` (server.js, scheduler.js, public/app.js, index.html, style.css, tests). `npm test`: 41/41 pass. `node --check public/app.js`: OK.

## Summary by story
- TIME-14 (bind 127.0.0.1, HOST override): `server.js:12,315`; test at `api.test.js:290`. OK.
- TIME-3 / TIME-15..17 (validation): real calendar dates via `setUTCFullYear` (`server.js:54-63`), 24:00 end-only (`server.js:42-51`), boolean `done`/`replace` (`server.js:91-95`), 415 on non-JSON (`server.js:98-101,213`), non-object tasks 400, malformed URI escape 400 instead of 500 (`server.js:301-306`). Error `field` hints present. Tests at `api.test.js:189-290,368`. OK.
- TIME-5 / TIME-20..23 (generation): `scheduler.js` is pure (no I/O, does not mutate inputs; tested). Placement matches D3/D4 and worked examples E0-E12 (each has a scheduler test). Response shape `{entries, unscheduled}` matches D1/LLD. Nothing-fits is decided before DELETE inside the transaction, so replace-on never deletes data (`server.js:195-203`; test `api.test.js:155`). ROLLBACK on any error. OK.
- TIME-4 / TIME-12 / TIME-18,19,24,25 (edit form, a11y): changed fields only, Escape/Cancel, role=alert errors with aria-invalid and focus. No `innerHTML`/`insertAdjacentHTML` with user data; text is set via textContent. OK.

Security: the static handler resolves inside PUBLIC_DIR with `startsWith(PUBLIC_DIR + sep)`. Bodies are capped at 1 MB. 500s do not leak internals. No blockers.

## Findings

| ID | File:line | Severity | Issue | Suggested fix |
|----|-----------|----------|-------|---------------|
| R1 | timetable-app/server.js:170,174 | minor | `Number()` coercion accepts `"30"` for minutes and `true` for priority (Number(true)=1). That is inconsistent with the strict boolean checks. | Require `typeof === 'number'` (or document that coercion is intended). |
| R2 | timetable-app/test/api.test.js | minor | There is no regression test for path traversal (`/..%2f..%2fserver.js`, `/%2e%2e/`) in the static handler. | Add a test that asserts 404 for encoded traversal. |
| R3 | timetable-app/public/app.js | minor | The edit form, Escape/Cancel, and aria-invalid/focus behaviour (TIME-18/19/24) have no automated tests. They are verified only by manual testing. | Record the manual test steps in the test plan (Phase 6), or extract the pure helpers (resolveField) and unit-test them. |
| R4 | timetable-app/server.js:218-239 | minor | After a 413, `readBody` keeps appending chunks until destroy takes effect, and a JSON array body (`[]`) is accepted as an object. | Return early after reject, and reject `Array.isArray(parsed)`. |
| R5 | timetable-app/server.js:129 | nit | PATCH `parseTitle`/`parseCategory` use the default field names. Correct, but implicit. | None needed. |
| R6 | timetable-app/server.js:184 | nit | `reason` is the same for every skipped task. That matches the LLD but gives less detail. | Optional: give a reason per task. |

No blocker or major findings.

PR comments: pending sync (no PR or remote used).
