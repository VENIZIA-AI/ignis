---
title: The Browser Path Loses lodash, and utilities Loses zod
description: "A browser bundle of @venizia/ignis-kernel/metadata drops from 20 KB to 13.9 KB gzipped, and every kernel peer dependency is now optional."
packages: ['@venizia/ignis', '@venizia/ignis-kernel']
---

# Changelog - 2026-09-16

## `@venizia/ignis-kernel/metadata`: 20 KB to 13.9 KB gzipped

<Badge type="tip" text="Fix" />

**In one line.** A browser-side consumer of IGNIS pays for less: no lodash, no zod on the utilities path, and no forced server peers.

## What changed

- **`inversion` no longer depends on lodash.** It used two functions (`omit`, `isEmpty`), now written by hand, and `lodash` is out of the package manifest.
- **`utilities/` no longer carries zod.** The OpenAPI schema builders moved next to the REST surface they belong to. Both are re-exported from the same barrels, so no import path changes.
- **Every kernel peer is optional.** `hono` and `@hono/zod-openapi` join `casbin`, `drizzle-orm` and `jose` as optional peers, so importing only `./metadata` no longer asks you to install a server HTTP framework. `@venizia/ignis` still declares both as required, so a REST application that forgets one is still warned.

## Who is affected

- **You bundle IGNIS for a browser.** Smaller, with no change to what you import.
- **Everyone else.** Nothing - same exports, same behaviour.
