# Development notes: Day planner iteration 1 (Epic TIME-2)

Branch `feature/TIME-2-planner-hardening-and-edit`, base `2af418a`. One commit per work item. `npm test` after every commit: green. Final: 41 tests, 41 pass, 0 fail (`test/api.test.js` 25, `test/scheduler.test.js` 16).

| WI | Story / sub-task | Commit | Change |
|---|---|---|---|
| WI-01 | TIME-14 / TIME-15 | f74daec | `parseDate` real calendar check; `parseTime` option `allowEnd24` for end on create/update |
| WI-02 | TIME-14 / TIME-16 | 6937340 | `requireBoolean`, `requireJson` (415), `readJsonBody`, task object check with `Task N:` prefix, safe `decodeURIComponent` |
| WI-03 | TIME-14 / TIME-17 | c12edf2 | API tests: dates, 24:00, tasks, booleans, 415, bad escape, PATCH 404/409, DELETE /api/day; `raw` helper |
| WI-14 | TIME-14 | 33070df | `HOST` env, default 127.0.0.1; test BASE 127.0.0.1 (done after WI-03) |
| WI-04 | TIME-5 / TIME-20 | edce5bc | skip-and-continue, `201 {entries, unscheduled}`, nothing-fits 400 before any delete, `HttpError.extra` |
| WI-05 | TIME-5 / TIME-21 | a57acac | UI warning listing skipped tasks, rows kept; tests |
| WI-06 | TIME-4 / TIME-22 | 7e6f155 | `scheduler.js` (`freeGaps`, `planTasks`), busy intervals in the transaction, 409 branch removed, unit tests E0-E12 |
| WI-07 | TIME-4 / TIME-23 | 4d34653 | API tests for fit-around (README part is WI-13, documenter) |
| WI-08 | TIME-3 / TIME-18 | 3e0ab5c | Edit button, inline edit form, 24:00 text input |
| WI-09 | TIME-3 / TIME-19 | 74ad2dc | Save (changed fields only), Cancel, Escape, focus return, 404 handling |
| WI-10 | TIME-12 / TIME-24 | 1c41fd4 | error regions role=alert, aria-invalid, focus, `field` in error JSON, `validateForm`, `setBusy` |
| WI-11 | TIME-12 / TIME-25 | f4358a8 | focus-visible, contrast tokens, field border, done opacity removed |

## Deviations and notes

- WI-06 commit also changes the clash half of the old generate test (409 -> placement at 10:00) so the commit stays green; WI-07 adds the rest. The test title was renamed in WI-07.
- The Edit and Delete `aria-label`s (WI-11 item) were added with the Edit button in WI-08; WI-11 only did CSS.
- WI-04 uses a simple cursor loop; WI-06 replaces it with `planTasks` (same behaviour when there are no existing entries).
- No schema change, so no `db/` script.
- The UI was not exercised in a browser in this phase (no browser tooling); only `node --check` and the API/unit tests. Manual verification is WI-12.
- Contrast ratios recomputed with the WCAG formula (script): health 5.34, personal 4.96, break 5.44, danger 5.47 (4.79 on #fdecec), field border 3.66, warn 7.33, focus ring 4.55 (4.20 on page bg). All match the LLD.

## Not done (out of scope for this phase)

WI-12 (manual UI verification), WI-13 (README/CHANGELOG).
