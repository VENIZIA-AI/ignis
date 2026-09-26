---
type: Playbook
title: "Framework work: the six roles"
description: How framework work on IGNIS splits into six roles, the flow an issue moves through, and where the artifacts live.
resource: .agents/plugin/claude/agents
tags: [process, roles, review, security]
---

Framework work never runs through one agent that both writes a change and approves it. Six roles
split the work; each owns a stage and hands off, never grading its own stage.

## The six roles

| Role | Owns | Never | Receives | Returns |
|---|---|---|---|---|
| Planner / Observer | The issue and the IGNIS project board, the brief per issue, task split and dispatch, the rulings log, consumer liaison, the pull request body, and the git writes of the flow: `[#N]` commits, the push to the feature branch, opening the pull request (rule W-01) | Writing production code; approving a public API change or a new dependency for the owner; pushing to `develop` or `main`; merging or releasing without the owner's word | An issue number | A pushed feature branch, a pull request with `Closes #N`, and the merge once the owner says "merge" |
| Dev | Code inside the brief's file scope, until the Test role's red tests pass | Git writes; editing tests to make them pass; a public API change or a new dependency without the owner's yes | An issue number, a brief path, a file scope | A diff plus a short status |
| Test | Tests written from the issue BEFORE Dev starts, red on the current tree; after Dev and Docs, every gate (build, lint, full suite, examples) and flake checks; the final gates after the fix loop | Editing production code | The brief, then the Dev and Docs diff | Red tests first, then a gate report |
| Reviewer | Read-only review of the code and docs diff against the issue and the brief: correctness, house rules, public surface, breaking changes, a BANA read-only crosscheck (rule W-06) | Editing any file | The diff, the issue, the brief | Findings as Critical, Important or Minor, each with `file:line` |
| Security | Read-only review of the issue text and the drafted pull request text for public-repo hygiene, on every issue; a review of the diff with bypass probes, mandatory for the triggers below | Editing any file | The diff, the issue, the brief, the drafted pull request body | Findings the same shape as the Reviewer's; can block a merge |
| Docs and knowledge | The changelog, the wiki, the knowledge bundle and its log, the surface and OKF gates | Editing production code | Dev's diff, before review and before the pull request opens | Updated docs, a gate report |

## Flow per issue

1. An issue sits in **Todo** on the IGNIS project board. An issue the Planner files is checked by
   Security for public-repo hygiene before it is filed (rule S-06).
2. The Planner writes the brief. A public API change or a new dependency needs the owner's approval
   on the brief before anything else starts (rules P-02, S-05).
3. The issue moves to **In progress**.
4. Test writes the tests first, from the issue and the brief, and shows them red on the current tree,
   before Dev opens a single production file.
5. Dev implements inside the brief's file scope until Test's tests pass.
6. Docs and knowledge updates the wiki, the knowledge bundle and the changelog from Dev's diff. Docs
   runs before review, so the docs land in the same move as the code (rule P-14).
7. Test runs every gate: full build, lint, the whole suite, examples, flake and mutation checks.
8. The Planner drafts the pull request body: `Closes #N`, and what each role verified, by role name,
   never an agent or model name (W-00).
9. Reviewer and Security review in parallel. The Reviewer reads the code and docs diff. Security
   checks the issue text and the drafted pull request body for public-repo hygiene, and reviews the
   diff in depth when a trigger below applies.
10. A fix loop follows their findings, capped at three rounds. Each fix goes to the role that owns
    the file. A round that still finds Critical issues after round three stops and goes back to the
    Planner and the owner, not a fourth round.
11. Test runs the final gates.
12. The Planner commits with `[#N] type(scope): subject`, pushes the feature branch and opens a pull
    request whose body says `Closes #N`. These are routine steps of the flow (rule W-01); nothing
    is pushed straight to `develop` or `main`.
13. The pull request merges into `develop` only when the owner says the word "merge" - never inferred
    from a green gate or from silence (rule P-08).
14. The issue moves to **Done**.

## When Security is mandatory

Security runs on every issue for the hygiene check. A change touching any of these also always gets
the full diff review, not only when something looks risky:

- input parsing (a new decoder, a new schema, anything that reads bytes from outside the process:
  request bodies, query strings, headers, filters)
- files (reads, writes, uploads, archives, paths built from user input)
- auth (authentication, authorization, tokens, sessions, ownership checks)
- error output (what a thrown error, a response or a log surfaces to a caller)
- secrets (credentials, keys, connection strings, anything rule S-01 covers)
- dependencies (a new package, a version bump, an optional peer, rule S-05)

This list is the canonical one; the Security definition names the six and cites it.

## Two rules the flow depends on

- **Test writes before Dev, and separately from Dev.** The tests that define "done" exist before the
  code that must satisfy them, and the same role never edits both a test and the code it grades.
- **The owner approves, never an agent.** A public API change, a new dependency, a merge and a
  release each need the owner's explicit yes. The Planner relays it; it never gives it (rule P-08).
  A green gate, a passed review or a merged pull request is not itself authorization to publish a
  package - that is a separate, explicit yes.

## Messages and reports

Rules P-09 (the minimap), the chat language of P-10 and P-11 govern the Planner's messages to the
owner. A role returns only the short English status its definition names, and writes its full
report to a file.

## Where the artifacts live

Briefs and role reports are scratch, not history. They live under `~/.cache/ignis-issues/`, outside
the repository:

| Artifact | Path |
|---|---|
| Brief | `~/.cache/ignis-issues/issue-<N>-brief.md` |
| Role report | `~/.cache/ignis-issues/issue-<N>-<role>-report.md` (Reviewer's is `review`, not `reviewer`: `issue-<N>-review-report.md`) |

The brief or the dispatch may name another path. The durable record of a change is the pull request
body, which carries what each role verified, by role name, never an agent or model name (W-00) - not
a link to a file nobody outside the session can open.

Every build a role runs takes the shared build lock - see [build system](/process/build-system.md).

## The Claude subagent files

Five of the six roles have a Claude Code subagent definition. The Planner is the main session,
never a subagent file.

| Role | File |
|---|---|
| Dev | `.agents/plugin/claude/agents/ignis-dev.md` |
| Test | `.agents/plugin/claude/agents/ignis-test.md` |
| Reviewer | `.agents/plugin/claude/agents/ignis-reviewer.md` |
| Security | `.agents/plugin/claude/agents/ignis-security.md` |
| Docs and knowledge | `.agents/plugin/claude/agents/ignis-docs.md` |

`make agent-setup` symlinks each into a developer's `.claude/agents/`, the same way it links project
skills - see `.agents/plugin/PLUGIN.md`.

## Related

- [Git workflow](/process/git-workflow.md)
- [Testing](/process/testing.md)
- [Build system](/process/build-system.md)
