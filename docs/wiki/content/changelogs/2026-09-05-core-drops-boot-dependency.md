---
title: "@venizia/ignis No Longer Depends on @venizia/ignis-boot"
description: Installing @venizia/ignis no longer installs @venizia/ignis-boot, so an application that runs the ignis-artifacts generator declares it as its own devDependency.
packages: ['@venizia/ignis']
---

# Changelog - 2026-09-05

## `@venizia/ignis` drops `@venizia/ignis-boot`

<Badge type="warning" text="Behavior Change" />

**In one line.** Installing `@venizia/ignis` no longer installs `@venizia/ignis-boot`; declare it yourself if you use `ignis-artifacts`.

## What changed

- **`@venizia/ignis` `dependencies`** no longer lists `@venizia/ignis-boot`. The published package loads nothing from it.

```json
{
  "devDependencies": {
    "@venizia/ignis-boot": "0.2.0-9"
  },
  "scripts": {
    "generate:artifacts": "ignis-artifacts generate --root src --out src/generated/artifacts.ts",
    "check:artifacts": "ignis-artifacts check --root src --out src/generated/artifacts.ts"
  }
}
```

## Who is affected

- **Applications that run `ignis-artifacts` without declaring `@venizia/ignis-boot`.** The binary disappears from `node_modules` at the next install. Add the devDependency shown above; the [registering artifacts guide](/guides/core-concepts/application/bootstrapping) already lists it.
- **Everyone else.** No action needed. No runtime code path changed.
