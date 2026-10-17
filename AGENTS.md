# AGENTS.md

How to work in the IGNIS repository. **This file is routing only** - it holds no rules and no
facts, it points to where both live.

This is the **only tracked instruction file**. Tool-specific files (`CLAUDE.md`, `GEMINI.md`, ...)
are gitignored adapters that point at this one, written per developer by VULCAN:

```bash
make agent-setup      # = bun x --no-install vulcan sync
```

## Must read first

| Read before you touch anything | What lives there |
|---|---|
| **[`.agents/rules.md`](.agents/rules.md)** | **THE rules** - write boundaries (W), security (S), process (P), build (B), cited by ID. They extend the shared VULCAN base (`node_modules/@venizia/vulcan/base/rules.md`, IDs `V-*`), which also holds the code and writing rules `V-C-01` … `V-C-18`. |
| **[`.agents/knowledge/index.md`](.agents/knowledge/index.md)** | **THE facts** - what IGNIS is and why, the monorepo layout, design decisions, the gotchas, per-package concepts, conventions, playbooks. |

Both are mandatory, for every agent, on every task. The two rules that cost the most when skipped:
**P-09** every status message opens with the minimap, and **B-05** a downstream test suite runs
`dist`, not `src`.

## Two homes for everything

Nothing lives in two places. Every piece of project information has exactly one home:

- **`.agents/`** - what agents read: the rules, the knowledge bundle, the project skills and hooks.
- **`docs/wiki/`** - the human-facing VitePress site: guides, references, changelogs.

Source code is the ground truth for both. When prose and code disagree, the code wins and the prose
is a bug (P-03). The wiki and the bundle are separate audiences; never conflate them (V-C-13).

There are **no per-package agent files** - a package carries no local `CLAUDE.md`. Read its concept
in the knowledge bundle instead.

## The knowledge bundle (`.agents/knowledge/`)

Canonical, tool-neutral facts for IGNIS, in Open Knowledge Format (markdown + YAML frontmatter, one
concept per file, links are the graph edges). Start at `.agents/knowledge/index.md`.

It is also served over MCP by **`ignis-atlas`** (registered in `.mcp.json`; it runs VULCAN's atlas with
`bun x --no-install vulcan x atlas mcp`; consumers outside this repo use `@venizia/vulcan-atlas`), the same server that answers over the wiki and the changelogs:

| Tool | Use it for |
|---|---|
| `search` | Find a chunk by keyword - pass `corpus: "knowledge"` to search this bundle only |
| `get` | Read one chunk in full, by the id a search hit returned |
| `symbol` | Locate an exported symbol: its package, import specifier, kind, signature and source line |
| `version` | Compare the `@venizia/*` packages installed in a directory with the newest known versions |
| `changes` | List the changelog entries between two versions of a package, or between two dates |

Maintaining it is rule P-03: change a fact in the code, update the concept and `log.md` in the same
change. Generated reference files come from `make okf-gen` (and `surface-gen`, `symbols-gen`,
`releases-gen` for the public surface, symbol and release tables) - VULCAN targets, included from
`vulcan.mk`. `make okf-check-strict` validates (OKF v0.2 plus the house rules); it is a CI gate, not a
commit gate. The `knowledge-sync` skill re-verifies the bundle against the code periodically.

## Shared agent assets (`.agents/`)

```
.agents/
├── rules.md          # THE rules - W · S · P · B · C, cited by ID
├── knowledge/        # THE knowledge bundle
├── hooks/            # session-digest.ts - IGNIS's own SessionStart digest, registered in vulcan.config
├── skills/           # update-wiki - IGNIS-only; VULCAN ships knowledge-sync and docs-writing
└── plans/            # gitignored - saved specs and plans, local to each developer
```

A skill is a procedure you follow; a concept is material you consult. Neither is duplicated in the
other. Before adding a skill, check the task is not already covered by one here or by one Claude
Code ships.

## Per-tool files (CLAUDE.md, GEMINI.md, ...)

This `AGENTS.md` is the single source. `make agent-setup` (`vulcan sync`) writes each tool's file as a
pointer to it (`CLAUDE.md` holds `@AGENTS.md`), never a copy, and writes `.claude/`: VULCAN's settings
and hooks (its base digest and the `guard-writes` check), the shipped and project skills, and the
project hooks from `.configs/vulcan.config.ts` - here, `.agents/hooks/session-digest.ts`, which adds
the most-dropped rule IDs and the minimap shape to the base digest. Re-run `make agent-setup` after a pull that touched
`.configs/vulcan.config.ts`, `.agents/skills/` or the pinned VULCAN version; `make vulcan-doctor`
says when you need to.
