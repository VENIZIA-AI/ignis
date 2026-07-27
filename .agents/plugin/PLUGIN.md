---
name: ignis-skills
description: >
  IGNIS project skills for Claude Code and compatible agents. Thin wrappers over the
  canonical knowledge in .agents/knowledge - skills point at concepts, they do not
  duplicate them.
author: Venizia
---

# IGNIS project skills

Project-specific skills for working on the IGNIS monorepo.

## Layout

Shared skills live in `.agents/plugin/skills/<name>/SKILL.md` and are **tracked**. They are
symlinked into each developer's agent skills directory by the setup tool:

```
bun .agents/plugin/setup.ts
```

They are deliberately not committed under `.claude/`, which is gitignored - anything living only
there is invisible to the rest of the team.

## What's included

| Skill | Purpose |
|---|---|
| `knowledge-sync` | Re-verify the `.agents/knowledge` bundle against the source code, periodically |
| `update-wiki` | Update the human-facing VitePress wiki from recent code changes |

## Adding a skill

1. Create `.agents/plugin/skills/<name>/SKILL.md` with `name` and `description` frontmatter.
2. Do not restate knowledge that already has a home: for facts about the project, point at the
   concept in `.agents/knowledge/`. A skill that describes a *procedure* (like `knowledge-sync`)
   is itself the canonical home for that procedure - write it out there.
3. Re-run `bun .agents/plugin/setup.ts` to link it in.

## Related

- Project knowledge: `.agents/knowledge/` - see [index](/index.md)
- Agent entry point: `AGENTS.md` at the repo root
