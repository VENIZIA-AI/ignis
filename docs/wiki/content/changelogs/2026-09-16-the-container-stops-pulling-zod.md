---
title: The Container Stops Pulling zod
description: "Importing Container alone drops from 437 KB to 64 KB in a browser bundle, and a new @venizia/ignis-kernel/metadata sub-path serves consumers that never serve HTTP."
packages: ['@venizia/ignis-kernel']
---

# Changelog - 2026-09-16

## `Container` no longer drags zod into a bundle

<Badge type="tip" text="Fix" />

**In one line.** Importing `Container` used to cost 437 KB minified (107 KB gzip), almost all of it zod. It is now 64 KB (21 KB gzip). The public surface is identical.

## What changed

- **Smaller `Container` import.** The request-header zod schemas moved to a separate file. Both files are re-exported from the same barrel, so no import path changes.
- **New sub-path `@venizia/ignis-kernel/metadata`.** For consumers that never serve HTTP: 69 KB minified, 23 KB gzip, against 619 KB and 161 KB for the root barrel.
- **What it carries.** The stereotypes (`service`, `component`, `configuration`, `injectable`, `provide`, `model`, `datasource`, `repository`, `inject`), the namespaces (`BindingNamespaces`, `ArtifactNamespaces`), `ArtifactTypes`, `BindingKeys` and `MetadataRegistry`.
- **`CoreBindings` is deliberately not on it.** It is one application's dictionary of server keys. It stays on the root barrel, so a consumer with its own `CoreBindings` never has two same-named classes one import apart.

```ts
import { service, BindingNamespaces, ArtifactTypes } from "@venizia/ignis-kernel/metadata";
```

## Who is affected

- **You bundle IGNIS for a browser.** Import from `@venizia/ignis-kernel/metadata` for 23 KB gzipped instead of 161 KB. A deep import of `Container` alone also got 6.7x smaller.
- **Everyone else.** Nothing - same exports, same behaviour.
