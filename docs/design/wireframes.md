# Wireframes: Day planner iteration 1 (Epic TIME-2)

Phase: 3 (design). Status: draft for human approval.
Confluence: pending sync.
ASCII wireframes; layout keeps today's two-column grid (schedule left, add/generate right; one column below 800 px). Changed elements are marked `*`. `[ ]` = button, `[_____]` = input, `[v]` = select, `[x]` = checkbox, `!` = error region (`role="alert"`), `i` = status message (`role="status"`).

## W1. Day view with Edit buttons (TIME-3, TIME-12)

```
+--------------------------------------------------------------------------------------------+
| My Day Timetable                                  [<-] [ 2030-01-15 ] [->] [Today]          |
+--------------------------------------------------------------------------------------------+
| +-- Schedule ---------------------------- 1/3 done -- [Clear day] -+  +-- Add entry -------+ |
| | * (schedule error region, empty, no height)                      |  | * (add-error empty)| |
| |   (#message hidden)                                              |  | Title [__________] | |
| | |09:00 - 10:00  Gym                 [x] *[Edit] [Delete]         |  | Start [__:__]      | |
| | |               health                                           |  | End   [__:__]      | |
| | |10:00 - 10:10  Break               [ ] *[Edit] [Delete]         |  | Category [v]       | |
| | |               break                                            |  | [Add]              | |
| | |10:10 - 11:40  Report (done, line-through)  [x] *[Edit] [Delete]|  +--------------------+ |
| | |               work                                             |  +-- Generate -------+ | 
| | |23:00 - 24:00  Reading             [ ] *[Edit] [Delete]         |  |  (see W4)          | |
| | |               study                                            |  +--------------------+ |
| +------------------------------------------------------------------+                        |
+--------------------------------------------------------------------------------------------+
```

- `|` at the row start is the category colour bar (AA colours, LLD 7.1); the category name is always shown as text (colour is not the only cue).
- Accessible names: checkbox `Mark "Gym" done`, `Edit "Gym"`, `Delete "Gym"` (WI-11).
- Done row: no opacity change; line-through title in muted colour; checkbox checked.

States:

```
Loading (first load)                 Empty day                               Load / action error
+-- Schedule -------------------+    +-- Schedule -------------------+       +-- Schedule ---------------------------+
| Loading...  (optional, #empty |    | Nothing planned yet. Add an   |       | ! Could not reach the server. Check   |
|  text until first render)     |    | entry or generate a timetable.|       |   that it is running.  (focused)      |
+-------------------------------+    +-------------------------------+       | (previous list stays as rendered)     |
                                                                             +---------------------------------------+
```

The loading text is an optional low-cost addition (Recommendation); today the empty text shows until the first load returns.

## W2. Entry in edit mode (TIME-3)

```
+-- Schedule ------------------------------------------------------------+
| |09:00 - 10:00  Gym                   [x] [Edit] [Delete]              |
| +--------------------------------------------------------------------+ |
| | * Edit "Standup"                       (row in edit mode)          | |
| | * (edit-error-12 region, empty)                                    | |
| | Title     [Standup___________________]   <- focus on open          | |
| | Start [10:00]          End [10:15]                                 | |
| | Category  [work      v]                                            | |
| | [Save] [Cancel]                                                    | |
| +--------------------------------------------------------------------+ |
| |11:00 - 12:00  Lunch                 [ ] [Edit] [Delete]              |
+------------------------------------------------------------------------+
```

- Only one row is in edit mode. Pressing Edit on "Lunch" closes this form without saving and opens Lunch.
- Escape anywhere in the form = Cancel. Cancel/Escape: row returns to normal view, focus goes to `Edit "Standup"`.
- Save with no changes = Cancel (no request). Save success: list reloads and re-sorts; focus goes to the Edit button of the saved entry at its new position.
- While saving: `[Saving...]` disabled, form `aria-busy="true"`.

24:00 end variant (A4):

```
| | Start [23:00]          End [24:00____]  (text input, HH:MM)         | |
| |                        HH:MM, 24:00 = midnight   (hint)             | |
```

## W3. Edit mode with an inline error (TIME-3, TIME-12)

Server overlap (409, no field):

```
| +--------------------------------------------------------------------+ |
| | ! Overlaps with "Gym" (09:00-10:00)           <- focused (tabindex -1), announced |
| | Title     [Standup___________________]                             | |
| | Start [09:30]          End [10:15]                                 | |
| | Category  [work      v]                                            | |
| | [Save] [Cancel]                                                    | |
| +--------------------------------------------------------------------+ |
```

Field error (400 with `field:"end"`, or client check):

```
| +--------------------------------------------------------------------+ |
| | ! End time must be after start time                                | |
| | Title     [Standup___________________]                             | |
| | Start [10:00]          End [#09:45#]  <- red 2 px border, aria-invalid, focused   |
| | Category  [work      v]                                            | |
| | [Save] [Cancel]                                                    | |
| +--------------------------------------------------------------------+ |
```

- The entry stays unchanged on the server; the form stays open with the user's values.
- Typing in the flagged field removes the red border/aria-invalid and clears the message.
- 404 (entry removed meanwhile): form closes, list reloads, schedule error region shows `Entry not found`.

## W4. Generate form (TIME-5, TIME-4, TIME-12)

Normal:

```
+-- Generate timetable ------------------------------+
| List your tasks; they are scheduled ...            |
| * (gen-error region, empty)                        |
| Day starts [09:00]     Break (min) [10]            |
| [Deep work______________________]          [x]     |
| [240] [High   v]                                   |
| [general               v]                          |
| - - - - - - - - - - - - - - - - - - - - - - - - -  |
| [Email__________________________]          [x]     |
| [30 ] [Low    v]                                   |
| [work                  v]                          |
| [+ Add task]                                       |
| [ ] Replace existing entries for this day          |
| [Generate]            (while running: [Generating...] disabled) |
+----------------------------------------------------+
```

Partial fit, skipped tasks reported (201 with `unscheduled`), shown in the schedule panel status area; all task rows stay (A2):

```
+-- Schedule ---------------------------------------------------------------+
| i Timetable generated. 1 task(s) not scheduled: "Deep work" (240 min,     |
|   no free gap long enough at or after 09:00)          (warning colours)   |
| |09:00 - 09:30  Email                 [ ] [Edit] [Delete]                  |
| |10:00 - 12:00  Meeting (existing)    [ ] [Edit] [Delete]                  |
+---------------------------------------------------------------------------+
```

All fit: `i Timetable generated.` (success colours). No warning.

Nothing fits (400 with `unscheduled`), nothing saved or deleted:

```
+-- Generate timetable ------------------------------+
| ! No task fits in the free time at or after 09:00  |  <- focused, announced
|   - "Deep work" (240 min): no free gap long enough |
|     at or after 09:00                              |
|   - "Email" (30 min): no free gap long enough at   |
|     or after 09:00                                 |
| Day starts [09:00]     Break (min) [10]            |
| ...                                                |
+----------------------------------------------------+
```

Field error in a task row (400 `field:"tasks[1].minutes"`, or client check on min/max):

```
| ! Task 2: duration must be 5-480 minutes           |
| ...                                                |
| [Email__________________________]          [x]     |
| [#3#] [Low    v]     <- red border, aria-invalid, focused |
```

## W5. Add form error and focus states (TIME-12)

```
+-- Add entry -------------------------+      +-- Add entry -------------------------+
| ! Please fill out this field.        |      | ! Overlaps with "Gym" (09:00-10:00)  |  <- focused region
| Title [#__________#]  <- focused,    |      | Title [Yoga______________]           |
|        aria-invalid, red border      |      | Start [09:30]   End [10:30]          |
| Start [__:__]   End [__:__]          |      | Category [health v]                  |
| Category [general v]                 |      | [Add]                                |
| [Add]                                |      +--------------------------------------+
+--------------------------------------+
  client constraint (novalidate +              server 409, no field
  validationMessage, browser wording)
```

Focus-visible state (keyboard only, not on mouse click):

```
  +=========+       3 px ring in --focus (#2f6fed), 2 px offset,
  || [Add] ||       4.55:1 on white, 4.20:1 on page background
  +=========+
```

## W6. Keyboard order

Tab order follows DOM order; no positive `tabindex` anywhere. Error regions have `tabindex="-1"` (focusable by script, not in the Tab sequence).

1. Header: Previous day -> Date -> Next day -> Today
2. Schedule: Clear day -> for each entry in time order: done checkbox -> Edit -> Delete
3. Entry in edit mode (replaces that row's controls): Title -> Start -> End -> Category -> Save -> Cancel; Escape cancels; Enter in a text field submits (Save)
4. Add entry: Title -> Start -> End -> Category -> Add
5. Generate: Day starts -> Break -> per task row: Title -> Minutes -> Priority -> Category -> Remove -> + Add task -> Replace checkbox -> Generate

Focus moves programmatically only in these cases: opening Edit (to Title), Cancel/Escape/Save success (to the row's Edit button), error (to the first invalid field, else the error region).

## Traceability

| Wireframe | Story | Work items |
|---|---|---|
| W1 | TIME-3, TIME-12 | WI-08, WI-11 |
| W2 | TIME-3 | WI-08, WI-09 |
| W3 | TIME-3, TIME-12 | WI-09, WI-10 |
| W4 | TIME-5, TIME-4, TIME-12 | WI-05, WI-06, WI-10 |
| W5 | TIME-12 | WI-10, WI-11 |
| W6 | TIME-12 | WI-10, WI-11 |
