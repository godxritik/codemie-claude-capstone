# Pull request draft

Branch: `feature/TIME-2-planner-hardening-and-edit` -> `main`
(Draft only. No repository exists yet; nothing has been pushed.)

## Title

TIME-2: harden API input, report unscheduled tasks, fit around existing entries, edit entries, accessible errors

## Description

### Summary

- TIME-14: reject bad input with 4xx instead of 500 (real calendar dates, null or non-object tasks, non-boolean `done`/`replace`, bad URL escape, missing JSON Content-Type returns 415); accept `24:00` as an end time only so full-day entries can be edited.
- TIME-5: `POST /api/generate` now skips tasks that do not fit and reports them instead of failing the whole request. If nothing fits, it returns 400 and changes nothing.
- TIME-4: with "Replace existing entries" off, tasks are placed in the free gaps of the day (priority order, forward-only cursor, first gap that fits). Breaks only between adjacent generated tasks.
- TIME-3: Edit button and inline edit form (title, start, end, category) with Save, Cancel and Escape.
- TIME-12: inline `role="alert"` errors next to each form with `aria-invalid` and focus management, entry-specific button names, visible focus styles, AA-contrast category text.

### Breaking change

`POST /api/generate` previously returned a bare array of entries. It now returns:

```json
201 { "entries": [ ... ], "unscheduled": [ { "title": "...", "minutes": 60, "reason": "..." } ] }
```

The bundled UI and tests are updated in the same change. Any external caller must use `response.entries`. Omitted or false `replace` no longer returns 409 on overlap; it fits tasks around existing entries. Non-boolean `done`/`replace` and non-JSON POST/PATCH are now rejected (400/415).

### Changes by work item (one commit each)

| Commit | Jira | Change |
|---|---|---|
| WI-01 | TIME-15 | Real calendar date check; `24:00` allowed as end only |
| WI-02 | TIME-16 | 400/415 for malformed input, no more 500s |
| WI-03 | TIME-17 | API tests for validation, boundaries, PATCH 404/409, DELETE /api/day |
| WI-04 | TIME-20 | `/api/generate` returns `{entries, unscheduled}`; skip-and-continue; 400 when nothing fits |
| WI-05 | TIME-21 | UI lists skipped tasks; tests for partial, full, none fit |
| WI-06 | TIME-22 | Free-gap placement when replace is off |
| WI-07 | TIME-23 | Rewritten clash test and gap-fitting tests |
| WI-08 | TIME-18 | Edit button and inline edit form |
| WI-09 | TIME-19 | Save/Cancel/Escape wired to PATCH with inline errors |
| WI-10 | TIME-24 | Per-form error regions, aria-invalid, focus |
| WI-11 | TIME-25 | Accessible names, focus-visible, contrast |
| WI-13 | TIME-23 | README, API table, CHANGELOG |

### Test plan

- [ ] `npm test` passes on every commit (no install needed)
- [ ] New API tests cover every acceptance criterion of TIME-14, TIME-5, TIME-4
- [ ] Existing generate-order test uses `res.data.entries`; clash test rewritten to expect placement at 10:00
- [ ] Manual UI checklist (`docs/testing/`): edit, cancel, Escape and focus return, edit of a 24:00 entry, one edit at a time, overlap message in the edit form
- [ ] Manual: generate with some tasks too long (skipped list shown, rows kept) and with nothing fitting (400 message, day unchanged)
- [ ] Manual: replace off around existing entries, breaks only between adjacent generated tasks
- [ ] Manual: keyboard-only pass, screen reader announces errors, focus outline visible, category text contrast 4.5:1 or better (tool and ratios documented)
- [ ] Back up `timetable-app/data/timetable.db` before trying; no schema change in this PR

### Rollback

No schema change. Revert commits individually; revert WI-04 and WI-05 together (contract and consumer).

### Out of scope

TIME-6 to TIME-11 and TIME-13 stay in the backlog. No Playwright tests in this PR.

### Open items for reviewers

- Server still listens on all interfaces (decision Q1 pending).
- Breaks show a done checkbox but are excluded from progress (pre-existing, not changed here).

Jira: TIME-2 (epic); stories TIME-14, TIME-5, TIME-4, TIME-3, TIME-12; sub-tasks TIME-15 to TIME-25.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
