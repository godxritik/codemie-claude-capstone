# Test report - Phase 6 (branch feature/TIME-2-planner-hardening-and-edit)

## Automated suite
`npm test` in timetable-app: tests 41, pass 41, fail 0.

## Manual UI verification (WI-12)
No browser tooling was available (no Playwright install or browser MCP). Every UI step is NOT RUN. UI success is not claimed.

| Step | Status |
|---|---|
| Edit -> change fields -> Save -> list re-sorts | NOT RUN |
| Escape restores row and focus | NOT RUN |
| Cancel restores row and focus | NOT RUN |
| One edit at a time | NOT RUN |
| Edit a 24:00 entry | NOT RUN |
| Server 400/409 shown in edit form, entry unchanged | NOT RUN |
| Generate with replace off places tasks around existing entries | NOT RUN (scheduler logic covered by unit tests E1-E12) |
| Skipped-tasks message | NOT RUN |
| Nothing-fits 400 leaves existing entries | NOT RUN in UI |
| Keyboard-only pass | NOT RUN |
| focus-visible on controls | NOT RUN |
| Category contrast | NOT RUN |
| Console errors on page load | NOT RUN |

## Review-item probes (live server, port 3100, temp DB, since removed)
- R1: POST /api/generate with task `priority:true` -> 201, accepted (placed, not rejected). Task `minutes:"30"` with `priority:"high"` -> 400 on tasks[0].priority, so the string priority is rejected. Entry POST with extra `minutes:"30"` field -> 201, extra field ignored. I did not isolate `minutes:"30"` alone in generate. Inconsistency: boolean `true` is accepted as a priority while the string "high" is rejected. Minor, not fixed.
- R2: GET /%2e%2e/server.js -> 404. PASS.
- R4: JSON array body to POST /api/entries -> 400. PASS. The message is misleading ("Invalid date "undefined""), minor.
- Entry POST with category "Work" (capitalised) -> 400, as expected.

## Defects
None blocking. Minor: boolean `priority:true` accepted (R1); array-body error message is not specific (R4).

## Verdict
PARTIAL: automated 41/41 pass, API probes behave as expected, UI checklist wholly NOT RUN (13 steps).
Jira sync: pending sync (not performed by this run).
