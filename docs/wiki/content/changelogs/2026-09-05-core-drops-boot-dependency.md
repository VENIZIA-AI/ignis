---
title: "@venizia/ignis No Longer Depends on @venizia/ignis-boot"
description: The core package dropped its unused dependency on the boot package. An application that runs the ignis-artifacts generator declares @venizia/ignis-boot as its own devDependency.
---

# Changelog - 2026-09-05

## `@venizia/ignis` drops `@venizia/ignis-boot`

<Badge type="warning" text="Behavior Change" />

**In one line.** Installing `@venizia/ignis` no longer installs `@venizia/ignis-boot`; declare it yourself if you use `ignis-artifacts`.

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

## The problem it solves

The runtime boot API (`Bootstrapper`, the booters, `boot()`) was removed on 2026-09-03, and with it the last import of `@venizia/ignis-boot` inside `@venizia/ignis`. The `dependencies` entry stayed behind, so every application installed a package the framework never loaded, and an application could run the generator without declaring the package that ships it.

## What changed

- **`@venizia/ignis` `dependencies`** no longer lists `@venizia/ignis-boot`. The published package loads nothing from it.
- **The build graph** in the repository reads `dev-configs -> inversion -> {filter, helpers} -> kernel -> connectors -> core`, with `boot` a leaf off `helpers` that only applications consume.

## Who is affected

- **Applications that run `ignis-artifacts` without declaring `@venizia/ignis-boot`.** The binary disappears from `node_modules` at the next install. Add the devDependency shown above; the [registering artifacts guide](/guides/core-concepts/application/bootstrapping) has always listed it as one.
- **Everyone else.** No action needed. No runtime code path changed.

## Details

| Symbol | Change | Package |
|---|---|---|
| `package.json` `dependencies["@venizia/ignis-boot"]` | Removed | core-server |
