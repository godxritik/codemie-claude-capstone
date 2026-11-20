# Requirements: Day Timetable Generator

Status: Draft, awaiting human review
Source: analysis of `timetable-app/` (server.js, public/, README.md, test/)

## 1. Product description

Day Timetable Generator is a small single-user web app for planning one day at a time. A user can:

- add timetable entries by hand (title, start, end, category), or
- list tasks (title, duration, priority, category) and let the app lay them out back to back from a chosen start time, highest priority first, with a configurable break between tasks.

The app is a Node.js (>= 22.5) HTTP server with no npm dependencies. It serves a vanilla HTML/CSS/JS frontend and a JSON REST API, and stores data in SQLite (`node:sqlite`, default file `timetable-app/data/timetable.db`).

## 2. Current functionality

### 2.1 Day view
- View the schedule for a selected date, ordered by start time.
- Navigate with previous day, next day, today, or a date picker.
- Progress indicator ("done/total") that counts non-break entries.
- Empty-state message when nothing is planned.

### 2.2 Manual entries
- Add an entry: title (required, max 100 chars), start and end (HH:MM, end after start), category.
- Categories: work, study, health, personal, break, general. Each has its own colour class.
- Overlapping entries on the same day are rejected with 409 and a message naming the clashing entry.
- Mark an entry done or not done (checkbox).
- Delete a single entry, or clear the whole day (both with confirmation for clear).

### 2.3 Timetable generation
- Inputs: date, day start (default 09:00), break length (0-120 min, default 10), up to 50 tasks, and a "replace existing entries" option (default on).
- Task rules: duration 5-480 min (whole minutes), priority 1 (high) to 3 (low), same title/category rules as manual entries.
- Tasks are sorted by priority, then by the order entered. Breaks are inserted between tasks only when the next task still fits before midnight.
- The request fails with 400 if a task does not fit before midnight, and with 409 if it overlaps existing entries and replace is off. Saving is transactional.

### 2.4 API
`GET /api/entries?date=`, `POST /api/entries`, `PATCH /api/entries/:id`, `DELETE /api/entries/:id`, `DELETE /api/day?date=`, `POST /api/generate`, `GET /api/categories`. The PATCH endpoint accepts title, start, end, category and done.

### 2.5 Quality attributes today
- Server-side validation of all inputs; request body capped at 1 MB; static file serving is guarded against path traversal.
- API tests exist (`test/api.test.js`); there are no frontend or end-to-end tests.
- No authentication; one shared database for everyone who can reach the server.

## 3. Gaps and enhancement opportunities

| # | Gap | Evidence |
|---|-----|----------|
| G1 | Entries cannot be edited from the UI. The API supports PATCH of title, times and category, but the UI only toggles done and deletes. A typo means delete and re-add. | `public/app.js` render(): only checkbox and Delete |
| G2 | Generation ignores existing entries. With "replace" off it fails on any overlap instead of scheduling around what is already planned. | `generateTimetable()` overlap check |
| G3 | Generated tasks are lost after generating, and the task list resets on reload. Users re-type recurring routines every day. | `addTaskRow()` starts with one empty row; no persistence |
| G4 | No way to reuse a day: no copy, templates or recurrence. | no such API |
| G5 | Only a single-day view. No week overview and no summary of time per category. | `GET /api/entries` takes one date |
| G6 | Data cannot be exported or printed. | no export endpoint or print styles |
| G7 | Daily planning limits: nothing can span midnight, and an unfittable task aborts the whole generation instead of reporting which tasks were left out. | `generateTimetable()` throws on first overflow |
| G8 | No visual cue for the current time or for overdue unfinished entries on today's view. | `render()` |
| G9 | Accessibility and usability: errors shown in a single status line, no keyboard shortcuts, colour is the main category cue. | `index.html`, `style.css` |
| G10 | No frontend or end-to-end automated tests; no build or deploy script; no user accounts. | `test/` contains API tests only |

## 4. Proposed epic

**EPIC: Make the day planner editable, reusable and easier to review.** Close the highest-value gaps (G1-G8) while keeping the app dependency-free.

## 5. User stories

Priority: P1 = must, P2 = should, P3 = could. Estimates are relative (S/M/L).

### US-01 Edit an existing entry (G1) - P1, S
As a user, I want to edit the title, times and category of an entry, so that I can fix mistakes without deleting and re-adding it.

Acceptance criteria
- Given an entry in the day view, when I choose Edit, then its fields become editable with the current values filled in.
- Given I save valid changes, then the entry updates in place and the list re-sorts by start time.
- Given my changes overlap another entry, then I see the existing "Overlaps with ..." message and nothing is saved.
- Given I cancel, then the entry is unchanged.

### US-02 Generate around existing entries (G2) - P1, M
As a user, I want generation to fit new tasks into the free gaps of my day, so that I can add tasks without wiping the day or hitting an overlap error.

Acceptance criteria
- Given "replace" is off and the day has entries, when I generate, then new tasks are placed only in free time at or after the chosen start.
- Given a task is longer than every remaining gap, then it is reported as unscheduled and the others are still saved.
- Given "replace" is on, then behaviour is unchanged.

### US-03 Report tasks that do not fit (G7) - P1, S
As a user, I want to be told which tasks could not be scheduled instead of the whole generation failing, so that I can adjust only those tasks.

Acceptance criteria
- Given some tasks do not fit before midnight, when I generate, then the fitting tasks are saved and the response lists the skipped tasks.
- Given every task fits, then no warning is shown.
- Given no task fits at all, then nothing is saved and the user sees a clear message.

### US-04 Save and reuse task lists (G3, G4) - P2, M
As a user, I want to save my task list as a named template and load it on another day, so that I do not re-type my routine every day.

Acceptance criteria
- Given a task list in the generator, when I save it with a name, then it appears in a template list.
- Given a saved template, when I load it, then the task rows are filled from it and I can still change them before generating.
- Given I delete a template, then it no longer appears.
- Template names are unique and 1-50 characters.

### US-05 Copy a day to another date (G4) - P2, S
As a user, I want to copy one day's entries to another date, so that repeated days take one click.

Acceptance criteria
- Given a day with entries, when I copy it to a target date, then all entries are created on that date with done reset to false.
- Given the target date already has overlapping entries, then I can choose to replace or cancel; nothing is partially copied.

### US-06 Week overview (G5) - P2, M
As a user, I want a week view with planned hours per day, so that I can see how busy the week is and jump to a day.

Acceptance criteria
- Given I open the week view, then I see seven days with entry count, planned minutes and done count per day.
- Given I select a day, then the day view opens for that date.
- Given I move to the previous or next week, then the view updates.

### US-07 Time-by-category summary (G5) - P3, S
As a user, I want a summary of minutes per category for the selected day, so that I can balance work, study, health and breaks.

Acceptance criteria
- Given a day with entries, then the summary lists each used category with total minutes and share of the planned time.
- Given an empty day, then the summary is hidden.

### US-08 Export and print a day (G6) - P2, S
As a user, I want to print my timetable or download it as a file, so that I can share it or keep it offline.

Acceptance criteria
- Given a day view, when I choose Print, then the printed page shows the schedule without forms and buttons.
- Given I choose Export, then I get a CSV (date, title, start, end, category, done) for the selected day.
- Given an empty day, then Export is disabled.

### US-09 Highlight the current and overdue entries (G8) - P3, S
As a user, I want today's current entry highlighted and unfinished past entries marked, so that I can see where I am in the plan.

Acceptance criteria
- Given I am viewing today, then the entry containing the current time is highlighted.
- Given an entry ended and is not done, then it shows an "overdue" marker.
- Given I view any other date, then no highlight or overdue marker is shown.

### US-10 Accessible, inline error feedback (G9) - P2, S
As a user relying on a keyboard or screen reader, I want errors and status messages announced and shown next to the relevant form, and categories shown with text or icon as well as colour, so that I can use the app without relying on colour or the mouse.

Acceptance criteria
- Given a validation error, then the message is announced via an ARIA live region and focus moves to the first invalid field.
- Given any entry, then its category is identifiable without colour.
- Given the page is used with only a keyboard, then every action (add, edit, delete, generate, navigate days) is reachable and has a visible focus state.

### US-11 Automated end-to-end coverage (G10) - P2, M
As a maintainer, I want end-to-end tests for the main flows, so that UI changes do not break them unnoticed.

Acceptance criteria
- Playwright tests cover: add entry, overlap rejection, edit entry, mark done, generate timetable, clear day.
- Tests run against a temporary database (`DB_FILE=:memory:` or a temp file) and do not touch `data/timetable.db`.
- Results are stored as a report in the repository.

## 6. Out of scope for this iteration

- User accounts, authentication and multi-user data separation.
- Recurring events and calendar sync (Google/Outlook).
- Mobile app or offline-first behaviour.
- Entries spanning midnight.

## 7. Assumptions and open questions

- Single-user, local deployment remains the target; no authentication is added.
- The stack stays dependency-free (Node built-ins and vanilla JS); Playwright is a dev-only tool.
- Open: should the generator keep its current rule of sorting by priority only, or also support a "fixed time" task? (Not in this scope.)
- Open: for US-04, are templates global or tied to a future user concept? Assumed global.

## 8. Traceability

| Story | Gap | Priority | Size |
|-------|-----|----------|------|
| US-01 | G1 | P1 | S |
| US-02 | G2 | P1 | M |
| US-03 | G7 | P1 | S |
| US-04 | G3, G4 | P2 | M |
| US-05 | G4 | P2 | S |
| US-06 | G5 | P2 | M |
| US-07 | G5 | P3 | S |
| US-08 | G6 | P2 | S |
| US-09 | G8 | P3 | S |
| US-10 | G9 | P2 | S |
| US-11 | G10 | P2 | M |

Jira (project TIME): epic TIME-2; US-01 to US-11 are TIME-3 to TIME-13 in order (US-01 = TIME-3, US-11 = TIME-13). All stories are children of TIME-2 with labels `sdlc-pipeline` and `timetable-app`.
