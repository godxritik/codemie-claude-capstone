# Capstone: AI-driven SDLC with Human-in-the-Loop

Goal (see `project-objective.md`): run an agentic SDLC pipeline over `timetable-app/`. The value is the orchestration, not feature complexity.

## Layout

- `.claude/agents/` - one dedicated agent per SDLC phase (requirements-analyst, planner, designer, developer, code-reviewer, tester, documenter)
- `.claude/skills/sdlc/` - the orchestrator; run it with `/sdlc`
- `.claude/settings.json` - registers the hooks
- `hooks/` - `check-gate.js` (blocks a phase until the previous one is human-approved), `approve.js` (records state), `log-subagent.js` (activity log)
- `approvals.json` / `approvals.schema.json` - per-phase HITL state; `progress.md` - live status; `CHANGELOG.md`
- `docs/<phase>/` - artifacts produced by each phase
- `timetable-app/` - the application under improvement

## Jira integration

- `.mcp.json` runs the `mcp-atlassian` MCP server (`atlassian`) via `uvx`, reading credentials from `.env` (`JIRA_URL`, `JIRA_USERNAME`, `JIRA_API_TOKEN`). `.env` is git-ignored and denied to Claude's file tools; `.env.example` shows the format. Restart Claude Code after editing `.env`.
- `jira.config.json` holds the project key, issue types, labels and status names. Replace `REPLACE_ME` before running; until then (or if `.env` is incomplete) agents fall back to "pending sync".
- Jira keys per phase are stored in `approvals.json` (`jira` field).

## Rules

- Never edit `approvals.json` or `progress.md` by hand or from phase agents; use `node hooks/approve.js`.
- Never mark a phase approved without an explicit human decision.
- Never push to a remote or publish externally unless the user asks.
- Phase agents write only to their own output paths; the developer is the only agent that edits `timetable-app/` source.
