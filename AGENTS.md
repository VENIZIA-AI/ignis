# AGENTS.md

How to work in the IGNIS repository. **This file is routing only** - it holds no rules and no
facts, it points to where both live.

This is the **only tracked instruction file**. Tool-specific files (`CLAUDE.md`, `GEMINI.md`, ...)
are gitignored symlinks to this one, created per developer by:

```bash
make agent-setup      # or: bun .agents/plugin/setup.ts
```

## Must read first

| Read before you touch anything | What lives there |
|---|---|
| **[`.agents/rules.md`](.agents/rules.md)** | **THE rules** - write boundaries (W), security (S), process (P), build (B), code and writing (C). Numbered, cited by ID. |
| **[`.agents/knowledge/index.md`](.agents/knowledge/index.md)** | **THE facts** - what IGNIS is and why, the monorepo layout, design decisions, the gotchas, per-package concepts, conventions, playbooks. |

Both are mandatory, for every agent, on every task. The two rules that cost the most when skipped:
**P-09** every status message opens with the minimap, and **B-05** a downstream test suite runs
`dist`, not `src`.

## Two homes for everything

Nothing lives in two places. Every piece of project information has exactly one home:

- **`.agents/`** - what agents read: the rules, the knowledge bundle, the project skills, the setup.
- **`docs/wiki/`** - the human-facing VitePress site: guides, references, changelogs.

Source code is the ground truth for both. When prose and code disagree, the code wins and the prose
is a bug (P-03). The wiki and the bundle are separate audiences; never conflate them (C-13).

There are **no per-package agent files** - a package carries no local `CLAUDE.md`. Read its concept
in the knowledge bundle instead.

## The knowledge bundle (`.agents/knowledge/`)

Canonical, tool-neutral facts for IGNIS, in Open Knowledge Format (markdown + YAML frontmatter, one
concept per file, links are the graph edges). Start at `.agents/knowledge/index.md`.

It is also served over MCP as **`ignis-knowledge`** (registered in `.mcp.json`):

| Tool | Use it for |
|---|---|
| `okf_search` | Find concepts by keyword - start here |
| `okf_list_concepts` | Browse by type (Package, Architecture, Convention, Playbook) |
| `okf_get_concept` | Read one concept in full |

Maintaining it is rule P-03: change a fact in the code, update the concept and `log.md` in the same
change. Generated content comes from `make okf-gen`; `make okf-check` validates and is not a commit
gate. The `knowledge-sync` skill re-verifies the bundle against the code periodically.

## Shared agent assets (`.agents/`)

```
.agents/
├── rules.md          # THE rules - W · S · P · B · C, cited by ID
├── knowledge/        # THE knowledge bundle; knowledge-tools/ holds gen · check · coverage · mcp
├── plugin/           # setup.ts, the project skills, the shared Claude settings and session hook
│   ├── skills/       # knowledge-sync · update-wiki - symlinked into your agent by setup
│   └── claude/       # settings.json + hooks/session-start.ts - merged into .claude/ by setup
└── plans/            # gitignored - saved specs and plans, local to each developer
```

A skill is a procedure you follow; a concept is material you consult. Neither is duplicated in the
other. Before adding a skill, check the task is not already covered by one here or by one Claude
Code ships.

## Per-tool files (CLAUDE.md, GEMINI.md, ...)

This `AGENTS.md` is the single source. Each tool that needs its own filename gets a **symlink** to
it, never a copy; `make agent-setup` creates it. `.claude/` is gitignored, so the parts everyone
must share are tracked under `.agents/plugin/claude/` and merged into your `.claude/settings.json`
by the same setup - today that is one hook, which prints the write boundaries and the minimap rule
into every session. Nothing in it blocks a command. Re-run `make agent-setup` after a pull that
touched `.agents/plugin/`.
