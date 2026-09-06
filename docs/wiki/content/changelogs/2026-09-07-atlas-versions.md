---
title: Atlas Gains version and changes Tools and a Generated Release Table
description: A new generated table records every release commit and every dated changelog entry with the packages it names. The Atlas changes tool lists what shipped between two versions, and version compares an installed tree against what the build knows.
---

# Changelog - 2026-09-07

## changes lists what shipped between two versions

<Badge type="tip" text="New Feature" />

**In one line.** `changes` names the changelog entries between two versions of a package, each with the id `get` reads it in full by.

Ask for a window:

```json
{ "package": "kernel", "from": "0.2.0-13", "to": "0.2.0-16" }
```

```json
{
  "package": "kernel",
  "from": "0.2.0-13",
  "to": "0.2.0-16",
  "entries": [
    {
      "id": "changelog:2026-09-05-boot-checks",
      "date": "2026-09-05",
      "title": "Boot Checks - Every Binding Resolves",
      "kind": "New Feature",
      "packages": ["kernel"]
    }
  ]
}
```

Pass an `id` to `get` to read that entry in full.

Leave `package` out and the window spans every package. Then `from` and `to` are dates, not versions.

## version says whether an install is behind

<Badge type="tip" text="New Feature" />

`version` reads one directory's `package.json`, resolves the `@venizia/*` versions really installed there, and compares them against the newest this build knows:

```json
{ "cwd": "/path/to/your/app" }
```

```json
{
  "installed": { "@venizia/ignis-kernel": "0.2.0-11" },
  "snapshot": { "helpers": "0.2.0-15", "kernel": "0.2.0-21" },
  "behind": [{ "package": "kernel", "installed": "0.2.0-11", "newest": "0.2.0-21" }]
}
```

A `behind` row names the package the way `changes` takes it, so the follow-up call is one step.

## The problem it solves

You upgrade a package and want to know what you are getting. The changelogs hold the answer, spread across more than a hundred files. Reading them by date means knowing which dates your two versions bracket, and no page carries that mapping.

The release commits already did. Nothing read them.

## What changed

- **A generated release table.** `make releases-gen` writes `.agents/knowledge/reference/releases.json` from every `chore(<package>): release v<version>` commit and every dated changelog file.
- **A `changes` tool.** Give it a package plus two versions, or no package plus two dates. It answers newest first, inside the same 2,000-character budget `search` uses, and says `truncated` when it trimmed.
- **A `version` tool.** It resolves the real installed version from `node_modules`, not the declared range. An unresolved version reads `null` and never counts as behind.
- **No registry call.** `version` reports the versions this build knows about, not what npm currently publishes.
- **`make releases-check` is a build gate.** It runs inside `make build-all`, next to `symbols-check`, and fails when the table drifts.

## Who is affected

- **Anyone running `@venizia/ignis-atlas`.** `tools/list` now returns five tools. The npm snapshot ships the table, so both work from an install.
- **Maintainers of this repository.** Run `make releases-gen` after a release commit or a new changelog page. A stale table fails `make build-all`.
- **Everyone else.** No action needed.

## Details

| Symbol | Change | Package |
|---|---|---|
| `version` (MCP tool) | New | `@venizia/ignis-atlas` |
| `changes` (MCP tool) | New | `@venizia/ignis-atlas` |
| `releases.json` (generated) | New | `.agents/knowledge/reference` |
| `make releases-gen`, `make releases-check` | New | Makefile |

Two limits are worth knowing. A window is dates, not commits: two releases on one day leave an empty window. A changelog file that names no package carries an empty `packages`, so a package filter never returns it - 27 files today.

- Extension page: [Atlas](/extensions/atlas/).
