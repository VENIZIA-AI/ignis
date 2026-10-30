---
title: Atlas Gains version and changes Tools and a Generated Release Table
description: Atlas can now list what shipped between two versions of a package and tell you whether an installed tree is behind.
packages: ['@venizia/ignis-atlas']
---

# Changelog - 2026-09-07

## Atlas tells you what changed between versions

<Badge type="tip" text="New Feature" />

**In one line.** Two new Atlas tools answer "what am I getting if I upgrade?" without reading more than a hundred changelog files by date.

## What changed

- **`changes`.** Give it a package plus two versions and it lists the changelog entries between them, newest first, each with an id that `get` reads in full. It says `truncated` when it trimmed the list.
- **`changes` without a package.** Leave `package` out and the window spans every package. Then `from` and `to` are dates, not versions.
- **`version`.** It reads one directory's `package.json`, resolves the `@venizia/*` versions really installed there, and compares them against the newest this build knows. An unresolved version reads `null` and never counts as behind.
- **No registry call.** `version` reports the versions this build knows about, not what npm currently publishes.

```json
{ "package": "kernel", "from": "0.2.0-13", "to": "0.2.0-16" }
```

```json
{ "cwd": "/path/to/your/app" }
```

A `behind` row names the package the way `changes` takes it, so the follow-up call is one step.

## Who is affected

- **Anyone running `@venizia/ignis-atlas`.** `tools/list` now returns five tools. The npm snapshot ships the release table, so both tools work from an install.
- **Everyone else.** No action needed.

## Details

- A changelog file that names no package carries an empty `packages`, so a package filter never returns it (9 files at the time).
- Extension page: [Atlas](/extensions/atlas/).
