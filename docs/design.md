# Phase 3: Design

Agent: designer. Status: awaiting human approval (iteration 1).
Full documents: `docs/design/architecture.md`, `docs/design/high-level-design.md`, `docs/design/low-level-design.md`, `docs/design/wireframes.md`.
Note: the designer's documents were written to disk and verified (line counts only; the content was summarised from the agent's report, not re-read in full).

## Summary

- **Database:** no schema change and no migration. `end_min = 1440` is already stored and shown as 24:00.
- **API changes:** `/api/generate` response becomes `201 {entries, unscheduled}` (breaking, D1). Error bodies gain optional `field` and `unscheduled` properties.
- **Server (`server.js`):**
  - `HttpError` takes a third `extra` argument.
  - `parseDate` checks real calendar dates.
  - `parseTime(s, {allowEnd24, field})` accepts 24:00 as an end only.
  - New helpers: `requireBoolean`, `requireJson` (415), `readJsonBody`.
  - Task errors carry `field: "tasks[i].x"` (0-based).
  - The nothing-fits check runs before the DELETE, so replace-on deletes nothing when nothing fits.
- **Placement:** `planTasks` is specified in pseudocode with 13 worked examples (E0-E12). The existing replace-on test is reproduced exactly.
- **Frontend:** state is `currentEntries` and `editingId`. Each form has an always-present `role="alert"` region, and forms use `novalidate`. Save, Cancel, Escape and focus-return rules are specified.
- **Contrast:** hand-calculated ratios show health (3.16:1), personal (2.68:1), break (2.86:1) and danger (4.38:1) fail WCAG AA, so darker replacements are proposed. The tester must re-check with a tool.

## Recommendations awaiting your decision

1. **Q1, bind to 127.0.0.1:** add as WI-14 with a `HOST` override. The test base URL must change to `127.0.0.1`.
2. **Q2, resize:** re-size TIME-14, TIME-3 and TIME-12 from S to M in Jira.
3. **Q4, extract `scheduler.js`:** this lets `planTasks` be unit-tested directly, which `server.js` does not allow because it starts listening on import.
4. **A1-A7:** accept the assumptions as written in HLD section 7.
5. **Forward-only cursor (D3, example E5):** a short low-priority task is never placed back into an earlier gap the cursor has already passed. Needs your confirmation.
6. **Two additions:** input borders darkened to `#7b8794` (current border is 1.29:1), and submit buttons disabled while a request is running.
