---
name: ignis-skills
description: >
  IGNIS project skills and shared agent settings for Claude Code and compatible agents. Skills are
  thin wrappers over the canonical knowledge in .agents/knowledge - they point at concepts, they do
  not duplicate them.
author: Venizia
---

# IGNIS project skills and shared agent settings

Project-specific assets for working on the IGNIS monorepo. The rules themselves live in
[`.agents/rules.md`](../rules.md); this folder holds what installs them into a developer's agent.

## Layout

```
.agents/plugin/
├── setup.ts                    # make agent-setup - links the tool file, the skills, merges settings
├── skills/<name>/SKILL.md      # tracked project skills, symlinked into the agent's skills dir
└── claude/
    ├── settings.json           # shared Claude settings - today one SessionStart hook
    └── hooks/session-start.ts  # prints the W rules, the often-dropped rules and the minimap shape
```

Everything here is **tracked**. `.claude/` is gitignored, so anything living only there is
invisible to the rest of the team; setup copies nothing, it links and merges.

```bash
make agent-setup                 # interactive - pick your agent
bun .agents/plugin/setup.ts claude   # non-interactive
```

## What's included

| Skill | Purpose |
|---|---|
| `knowledge-sync` | Re-verify the `.agents/knowledge` bundle against the source code, periodically |
| `update-wiki` | Update the human-facing VitePress wiki from recent code changes |

## Shared Claude settings and the session hook

Reading `.agents/rules.md` is honour-system: nothing forces a session to open it, and a session that
skips it invents its own boundaries. `hooks/session-start.ts` puts the part that costs the most when
missed in front of every session - the W write boundaries, the rules sessions drop most (P-09 the
minimap, P-10 reporting, B-03 verify, B-05 dist-not-src, P-05 BANA crosscheck, W-02 no checkout
over dirty files) and the minimap shape. Everything is extracted from `rules.md` at run time, never
copied, so the digest cannot drift from the file it quotes.

`settings.json` registers that hook and nothing else. It carries **no `permissions.deny`**: git is
allowed in this repo (rule W-01 says *when*, not *never*), so the hook reminds and never blocks.

Setup merges the tracked file into each person's `.claude/settings.json` **one level into**
`permissions`, `hooks`, `enabledPlugins` and `env`, because those are objects of independent
entries: shared wins entry by entry, everything it does not name survives. A settings file that is
not valid JSON is reported and left alone. Re-run `make agent-setup` after a pull that touched this
folder.

## Adding a skill

1. Create `.agents/plugin/skills/<name>/SKILL.md` with `name` and `description` frontmatter. The
   description states **when** to reach for it - that is the only thing the model reads when
   deciding.
2. Do not restate knowledge that already has a home: for facts about the project, point at the
   concept in `.agents/knowledge/`. A skill that describes a *procedure* (like `knowledge-sync`) is
   itself the canonical home for that procedure - write it out there.
3. Before adding one, check the task is not already covered by an existing skill or by one Claude
   Code ships.
4. Add it to **What's included** above, then re-run `make agent-setup` to link it in.

## Related

- The rules: [`.agents/rules.md`](../rules.md)
- Project knowledge: `.agents/knowledge/` - see [index](../knowledge/index.md)
- Agent entry point: `AGENTS.md` at the repo root
