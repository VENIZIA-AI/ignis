---
title: The Wiki Is Updated With VULCAN's docs-update Skill
description: "IGNIS pins VULCAN 0.2.0-2 and drops its own update-wiki skill for VULCAN's shipped docs-update; the IGNIS-specific wiki rules move into .agents/rules.md as the D group."
packages: []
---

# Changelog - 2026-10-17

## The wiki is updated with VULCAN's docs-update skill

<Badge type="tip" text="Enhancement" />

**In one line.** Contributors and agents update the wiki with VULCAN's shipped `docs-update` skill, which follows the IGNIS docs rules in `.agents/rules.md`.

## What changed

- **`@venizia/vulcan` 0.2.0-2.** The repository tooling moves from 0.2.0-1 to 0.2.0-2.
- **One docs skill.** The project skill `update-wiki` is gone. `make agent-setup` links VULCAN's `docs-update`, which reads the wiki and changelog paths from `.agents/vulcan.manifest.json`.
- **The D rules.** Where pages go (D-01), the style checks (D-02), how a new page is wired in (D-03) and the four docs gates (D-04) now live in `.agents/rules.md`.

## Who is affected

- **Contributors.** Run `make agent-setup` after pulling. Nothing else changes: the pages, the gates and the commands are the same.
- **Applications using IGNIS.** No action needed. No package changed.
