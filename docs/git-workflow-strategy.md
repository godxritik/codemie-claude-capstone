# Git Workflow Strategy

This document defines how work moves from a feature branch to the production branch. It applies to every agent and every human contributor, and `pr-agent` follows it when it manages git.

## Branches

| Branch | Purpose | Rules |
| --- | --- | --- |
| `main` (or `master`) | Production-ready code | Receives changes only through a pull request from `develop`, and only when the user explicitly asks for it. Never committed to directly. |
| `develop` | Integration branch | Receives all completed work. Every feature commit lands here first. |
| `feature/<JIRA-KEY>-<kebab-summary>` | One unit of work | Branched from an up-to-date `develop`. Merged back into `develop`, not into `main`. |

## Required flow

1. **Start**: create the feature branch from `develop`, after `git fetch` and fast-forwarding `develop`.
2. **Commit to develop first**: the feature branch is merged into `develop` (or `develop` is updated from it) before any pull request is opened. Commits made while working on the feature are one per logical unit and reference the Jira key (e.g. `TIME-9: add time-by-category summary`).
3. **Pull request to main only on request**: a PR from `develop` to `main` is opened only when the user explicitly asks for it in that request (e.g. "open a PR to main"). Agents never open one on their own, and never as a side effect of a commit or push.
4. **Merge**: merges into `main` happen only when the user explicitly asks. Agents do not merge PRs.

## Rules for agents

- Commit to `develop` first; do not commit to `main`.
- Push to a remote only when the user explicitly asks.
- Open or update a PR only when the user explicitly asks; the base branch is `main` and the head is `develop` (or the feature branch merged into `develop`) as the user specifies.
- Never force-push, rewrite published history, amend published commits, or delete branches unless the user requests that exact action.
- Stage files by name; never stage `.env`, credentials, keys or `node_modules`.
- Sync with `develop` by merging, not rebasing, unless the user asks otherwise.

## Jira

- Story transitions follow `jira.config.json`. Commits and PRs carry the Jira key.
- After a push or PR, a comment with the branch, commit hashes and PR URL is added to each related Story.

## Summary of the sequence

```
feature/TIME-n-...  --commit-->  develop  --(user asks)-->  PR develop -> main  --(user asks)-->  merge
```
