# Phase 4: Development

Agent: developer. Status: awaiting human approval (iteration 1).
Branch: `feature/TIME-2-planner-hardening-and-edit` (from `main`, baseline `2af418a`).
Details: `docs/development/dev-notes.md` (not committed yet).

## Commits (oldest first)

| SHA | Jira | Change |
|---|---|---|
| f74daec | TIME-15 | Real calendar dates; 24:00 accepted as end only |
| 6937340 | TIME-16 | Malformed input returns 400/415 instead of 500 |
| c12edf2 | TIME-17 | API tests for validation, 24:00 boundary, PATCH/DELETE |
| 33070df | TIME-14 | Bind to 127.0.0.1 by default, `HOST` override (WI-14) |
| edce5bc | TIME-20 | Skip unfit tasks; return `{entries, unscheduled}` |
| a57acac | TIME-21 | UI shows skipped tasks; partial-fit test |
| 7e6f155 | TIME-22 | Free-gap placement when replace is off (`scheduler.js`) |
| 4d34653 | TIME-23 | API tests for fit-around generation |
| 3e0ab5c | TIME-18 | Edit button and inline edit form |
| 74ad2dc | TIME-19 | Save, Cancel, Escape in the edit form |
| 1c41fd4 | TIME-24 | Inline `role="alert"` errors, `aria-invalid`, focus |
| f4358a8 | TIME-25 | Focus styles; category and danger colours to WCAG AA |

## Verification (orchestrator, this session)

- `git log main..HEAD` shows the 12 commits above.
- `npm test` in `timetable-app/`: 41 tests, 41 pass, 0 fail (25 API, 16 scheduler unit).
- Working tree: `approvals.json` and `progress.md` are modified by the hook CLI and are intentionally not committed; `docs/development/` is untracked.

## Deviations and gaps

- The UI was not run in a browser, so only syntax checks and API/unit tests cover it. WI-12 (manual UI verification) is the tester's job and must confirm the edit flow, focus return, skipped-task message and contrast.
- WI-06 also rewrote the clash half of the old generate test (409 became placement at 10:00) so that commit stayed green.
- The Edit and Delete `aria-label`s went in with WI-08, so WI-11 only changed CSS.
- No schema change, so there is no DB script.
- Documentation (WI-13: README, CHANGELOG) is not done and belongs to the documenter.

## Jira

Stories TIME-14, TIME-5, TIME-4, TIME-3, TIME-12 and sub-tasks TIME-15..TIME-25 moved to In Progress. No comments added.
