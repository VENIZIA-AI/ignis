---
name: knowledge-sync
description: Re-sync the .agents/knowledge OKF bundle against the source code. Use when the user asks to sync knowledge, refresh the knowledge bundle, audit concepts against code, or run a periodic/monthly knowledge audit.
user-invocable: true
allowed-tools: Read, Write, Edit, Grep, Glob, Bash, Agent, Workflow
---

# Knowledge Sync - re-sync `.agents/knowledge` against source code

Keep the OKF knowledge bundle true to the code. The generated reference layer self-heals via
`make okf-gen`; this skill covers the **curated** concepts, which only stay honest when someone
re-reads the source.

This is deliberately **not** a commit gate. A per-commit check cannot tell whether prose is still
true - only re-reading the code can. So the bundle is verified periodically, here.

## Core principles

1. **Code is ground truth.** Never fix a concept from `docs/wiki`, `AGENTS.md`, a `CLAUDE.md`, or
   memory - those drift too. This bundle exists because they did. Every finding needs a `file:line`
   witness; every fix is applied faithfully to that witness.
2. **Curate, do not dump.** Concepts stay tight: fix wrong/stale, fold in only durable high-value
   missing facts, skip volatile detail (dependency lists, config keys, version numbers).
3. **Cheap by default.** Delta mode only verifies concepts whose code areas changed since the last
   sync. Full mode (everything + critics) is for monthly/quarterly.
4. **Nothing is committed.** The agent edits the bundle + `log.md`; the user reviews and commits.
5. **Subagents never run state-changing git commands.** Read-only `git log`/`diff`/`show` only.

## Mode selection

| What the user asked for | Mode |
|---|---|
| daily / weekly / bi-weekly / "sync knowledge" (no qualifier) | `delta` |
| monthly / quarterly / "full" / "toàn bộ" / last **full** sync > 30 days ago (check `log.md`) | `full` |

`full` = delta verifiers **plus** 6 directory spot-auditors over every other concept **plus**
completeness + usability critics.

## Step 0 - Baseline

1. `make okf-gen` then `make okf-check` - refresh the generated layer first so verifiers never chase
   facts `gen` already fixes. `check` must be clean before proceeding.
2. **Anchor the last sync by COMMIT, not by date:**
   ```bash
   LAST_SYNC=$(git log -1 --format=%H -- .agents/knowledge/log.md)
   ```
   The scan range is `$LAST_SYNC..HEAD`. The log entry's date heading is only a display label.

   **If `LAST_SYNC` is empty** the bundle has never been committed (or `log.md` was renamed). Do not
   build a `..HEAD` range from it - that silently means "everything". Either anchor on the commit
   that introduced the bundle (`git log --diff-filter=A --format=%H -- .agents/knowledge/index.md`)
   or run `full` mode, which does not depend on the range for its spot-auditors.
   Never use a bare `--since=YYYY-MM-DD`: git's approxidate reads a date equal to *today* as "since
   the current wall-clock time" and silently returns empty, and same-day commits made before the
   last sync get double-counted. A hash range has neither problem.
3. Changed-area scan:
   ```bash
   git log $LAST_SYNC..HEAD --no-merges --name-only --format= -- packages/ examples/ Makefile .github/ .githooks/ scripts/ \
     | sort -u | awk -F/ '{print $1"/"$2}' | sort | uniq -c | sort -rn
   git log $LAST_SYNC..HEAD --no-merges --oneline
   ```
   Commit subjects become verifier hints. Ignore commits touching only `.agents/knowledge/` or
   `docs/` - that is knowledge maintenance, not code drift.
4. **Early exit (delta mode):** if no code areas changed, report "bundle already in sync", run the
   gates (Step 3), stop. No workflow, no log entry - unless `gen` changed generated files, then a
   one-line entry.

## Step 1 - Build delta targets

One target per changed area, from this map. Extend it when a new area appears, and keep it in sync
as concepts are added.

| Changed area | Concepts to verify (under `.agents/knowledge/`) |
|---|---|
| `packages/core/src/base/applications` | architecture/application-lifecycle, packages/core |
| `packages/core/src/base/repositories`, `src/connectors` | architecture/repository-hierarchy, architecture/datasource-hierarchy, architecture/filter-system, architecture/transactions, architecture/search-typesense, packages/core |
| `packages/core/src/components` | architecture/component-model, architecture/controller-system, architecture/authentication, architecture/authorization-casbin, process/adding-a-component |
| `packages/core/src/common/bindings.ts` | conventions/binding-key-namespaces |
| `packages/core` (broad/other) | packages/core, architecture/error-handling-flow, conventions/gotchas |
| `packages/boot` | packages/boot, architecture/boot-lifecycle |
| `packages/inversion` | packages/inversion, architecture/di-container, conventions/gotchas |
| `packages/helpers` | packages/helpers, conventions/error-handling, process/adding-a-helper |
| `packages/dev-configs` | packages/dev-configs, conventions/coding-style, conventions/testing-conventions |
| `examples/<x>` | examples/&lt;x&gt; |
| `Makefile`, `scripts/`, `.githooks/`, root `package.json` | process/build-system, process/testing, process/git-workflow, overview/build-run-test, conventions/gotchas |
| `.github/workflows/` | process/release-publish, process/updating-the-wiki |
| `docs/wiki` | process/updating-the-wiki |

Per-target fields: `key`, `area` (git pathspec), `concepts`, `hint` (summarize the commit subjects -
the verifier is told to verify, not trust), `model` - `opus` for heavy or architecture-critical areas
(core, inversion, big diffs), `sonnet` for small ones. Ignore noise-only areas (formatting,
lockfiles, generated files). Merge tiny areas (<=3 files each) into one combined target.

## Step 2 - Run the workflow

Invoke the Workflow tool with the saved script. Do not rewrite the orchestration inline:

```
Workflow({
  scriptPath: '.agents/knowledge-tools/knowledge-sync.workflow.js',
  args: {
    repo: '<git rev-parse --show-toplevel>',
    mode: '<delta|full>',
    since: '<YYYY-MM-DD>',              // display label for prompts/log
    gitRange: '<LAST_SYNC hash>..HEAD', // what verifiers actually diff
    deltaTargets: [...],
  },
})
```

It fans out verifiers (+ spot-auditors and critics in full mode), groups findings per concept file,
and runs one Opus applier per file under strict curation rules. Returns
`{ stats, findingsByFile, applySummaries, gaps, notes }`.

## Step 3 - Post-workflow

1. **Gaps** (usually full mode): for each, decide like a curator - durable, load-bearing, no existing
   home? If yes, spawn one Opus agent per gap to create the concept: copy frontmatter/voice/length
   from 2-3 sibling concepts, verify every claim against source, cross-link, add a line to `index.md`
   in the right section. If a gap is really consolidation (same fact in N files), make ONE file the
   canonical home and reduce the others to pointers - never lose unique facts.
2. **Gates:** `make okf-gen`, then `make okf-check` (must be OK), then
   `bun .agents/knowledge-tools/okf.ts coverage --min 100` (structural must stay 100% - every
   `packages/*` and `examples/*` needs a concept; the number grows as the repo does).
3. **Log:** prepend an entry to `.agents/knowledge/log.md` in the existing style: date + mode, a
   method one-liner (N verifiers / findings / confirmed / files touched), bullets for the notable
   corrections (the ones that change how someone works), creations, dedups, gate status. **This entry
   is the anchor the next sync reads** - its commit is what `LAST_SYNC` resolves to.
4. **Do not commit.** Leave the diff for the user.

## Report (to the user, Vietnamese)

Lead with the outcome: gate status + scale (`X findings áp vào Y files, Z claims xác nhận đúng`).
Then the notable corrections as short bullets (what was wrong -> what is true now, with the source
witness), new/merged concepts, and anything an applier skipped, with the reason. If delta mode
early-exited: one line - nothing changed since `<since>`, gates green.
