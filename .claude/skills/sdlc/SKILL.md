---
name: sdlc
description: Run the AI-driven SDLC pipeline on timetable-app. Orchestrates dedicated phase agents (analysis, plan, design, development, review, testing, documentation) with a human approval gate after each phase. Use when the user asks to run, resume, or check the SDLC pipeline.
argument-hint: "[start | resume | status | <phase>]"
---

# SDLC Orchestrator

You are the orchestrator. You do not do phase work yourself: you delegate each phase to its dedicated agent, present the result to the human, record the decision, and only then advance. Subagents cannot spawn subagents, so orchestration stays here in the main session.

## Pipeline

| # | Phase | Agent | Key outputs |
| - | --- | --- | --- |
| 1 | analysis | `requirements-analyst` | `docs/analysis/*` |
| 2 | plan | `planner` | `docs/plan/*` |
| 3 | design | `designer` | `docs/design/*` |
| 4 | development | `developer` | code, tests, commits, `docs/development/*` |
| 5 | review | `code-reviewer` | `docs/review/code-review.md` |
| 6 | testing | `tester` | `tests/`, `docs/testing/*` |
| 7 | documentation | `documenter` | README, CHANGELOG, `docs/documentation/*` |

State lives in `approvals.json` (schema: `approvals.schema.json`) and `progress.md`. Only `node hooks/approve.js` writes them.

## Procedure

**Preflight (once per run)**: read `jira.config.json`. If `projectKey` is `REPLACE_ME`, tell the human and ask whether to continue without Jira ("pending sync" mode) or stop to configure it. Otherwise confirm the `atlassian` MCP server is connected by making one cheap read call (e.g. search the project). Credentials come from `.env` (never read or print it); if the call fails, report the error and remind the human to fill in `.env` and restart Claude Code, then ask the same question. Include "Jira is available/unavailable" in every agent prompt.

After `analysis` returns, parse its `JIRA_KEYS:` line and store them with `--jira KEY` on the `awaiting_approval` call. Stories are created in Jira before human review; if the human requests changes, the analyst updates them in place.

Determine the starting point from the argument: `status` -> print the table from `approvals.json` and stop; `<phase>` -> run just that phase; otherwise start at the first phase whose status is not `approved`.

For each phase, in order:

1. **Start**: `node hooks/approve.js <phase> in_progress`.
2. **Delegate**: call the Agent tool with `subagent_type` = the phase agent. The prompt must be self-contained: the phase goal, paths of the approved upstream artifacts to read, and (on iteration > 1) the verbatim human feedback from `approvals.json` comments. A `PreToolUse` hook (`hooks/check-gate.js`) blocks the call if the previous phase is not approved - if blocked, fix the state, never bypass the hook.
3. **Record output**: `node hooks/approve.js <phase> awaiting_approval --artifact <path> ...` for each artifact the agent produced.
4. **Human gate**: summarize the agent's output in a few lines with the artifact paths, then use AskUserQuestion with options: Approve, Request changes, Reject/stop. Never self-approve, and never infer approval from silence.
5. **Apply the decision**:
   - Approve -> `node hooks/approve.js <phase> approved --reviewer "<name or 'human'>" [--comment ...]`, continue to the next phase.
   - Request changes -> collect the feedback text, `node hooks/approve.js <phase> revision_requested --comment "<feedback>"`, then repeat from step 1 with the feedback in the prompt. Allow at most 3 iterations per phase, then ask the human how to proceed.
   - Reject -> `node hooks/approve.js <phase> rejected --comment "..."` and stop the pipeline.

## Phase-specific rules

- **review**: if the verdict in `docs/review/code-review.md` is `CHANGES_REQUESTED`, show it to the human; on their go-ahead, re-run `developer` with the review comments (set development to `revision_requested` first, then re-approve it), then re-run `code-reviewer`.
- **testing**: if tests fail, show the failures; the human decides whether to send the work back to `developer` or accept known failures (record that in a comment).
- **Integrations** (Jira, Confluence, GitHub): agents use MCP tools when available and mark "pending sync" otherwise. Report any "pending sync" items at the end.

## Finish

After documentation is approved, print the final status table, list all "pending sync" items, and point to `docs/documentation/delivery-summary.md`. Do not push to any remote or publish externally without explicit user instruction.
