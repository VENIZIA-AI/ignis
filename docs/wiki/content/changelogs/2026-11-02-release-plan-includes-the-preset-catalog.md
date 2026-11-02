---
title: The release plan re-releases @venizia/ignis when a tool of its preset changes
description: "@venizia/ignis is now released whenever a tool its presets name (@venizia/ignis-boot, @venizia/dev-configs) is, so a project made from the IGNIS preset gets the fixed tool."
packages: ['@venizia/ignis']
---

# Changelog - 2026-11-02

## The release plan re-releases @venizia/ignis when a tool of its preset changes

<Badge type="info" text="Bug Fix" />

**In one line.** A project made from the IGNIS preset got the old `@venizia/ignis-boot` or `@venizia/dev-configs` whenever only a tool was released, because `@venizia/ignis` was left out of the release; it is now released with them.

## What changed

- **The preset carries the tool versions it was built with.** A new project reads the presets inside `@venizia/ignis`, and each preset names its tools (`@venizia/ignis-boot`, `@venizia/dev-configs`, ...) at the workspace version of the build that made it.
- **0.4.7-3 showed the gap.** `@venizia/ignis` 0.4.7-3 carried a `@venizia/ignis-boot` that threw `Bun is not defined` under Node. The next release plan counted only `dependencies`, so it released boot and dev-configs and left `@venizia/ignis` behind: a new project still got the broken boot.
- **The plan now follows the preset templates.** A package that ships presets is released after every workspace package its preset templates name. No other package changes.

## Who is affected

- **Projects created with `vulcan init --preset ignis` or `vulcan add --preset ignis`.** After the next release of `@venizia/ignis` they get the current tool versions. For a project made before, bump `@venizia/ignis-boot` and `@venizia/dev-configs` to the latest.
- **Everyone else.** No action needed.
