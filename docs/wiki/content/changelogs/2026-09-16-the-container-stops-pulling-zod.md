---
title: The Container Stops Pulling zod
description: "Importing Container alone cost 437 KB in a browser bundle, 423 KB of it zod, for a four-line const class. Splitting one file takes it to 64 KB."
---

# Changelog - 2026-09-16

## `Container` no longer drags zod into a bundle

<Badge type="tip" text="Fix" />

| | minified | gzip |
|---|---|---|
| Before | 437 KB | 107 KB |
| After | **64 KB** | **21 KB** |

Nothing about the API changed. `@venizia/ignis-kernel`'s public surface is identical.

## What was happening

```
Container
  -> helpers/inversion/registry
  -> helpers/inversion/mixins            (barrel)
  -> mixins/controllers/controller
  -> base/controllers/common/constants   <- import { z } from '@hono/zod-openapi'
  -> zod                                 (423 KB)
```

The controller mixin wanted one thing from that file: `ControllerTransports`, a four-line const
class. But the same file called `z.object()` at module load for two request-header schemas, and an
ESM module runs whole. Every consumer of `Container` paid for zod.

The schemas moved to `base/controllers/common/schemas.ts`. Both files are re-exported from the same
barrel, so no import path changes.

## It is guarded now

zod is browser-**pure**, so `make purity-kernel` had nothing to say - the problem was weight, not
platform. A test bundles the container entry and fails over 120 KB, naming the file to check:

```
Container bundles to 437 KB. Something on its import path now pulls a heavy dependency -
check for a new import in base/controllers/common/constants.ts or in the mixins barrel.
```

Nothing in a type system stops someone re-adding that import, so the measurement is the guard.

## And a sub-path for consumers that never serve HTTP

```ts
import { service, BindingNamespaces, ArtifactTypes } from "@venizia/ignis-kernel/metadata";
```

| Entry | minified | gzip |
|---|---|---|
| `@venizia/ignis-kernel` | 619 KB | 161 KB |
| `@venizia/ignis-kernel/metadata` | **69 KB** | **23 KB** |

The root barrel is heavy **correctly** - it carries the REST surface. Splitting `constants.ts` did
not change it and was never going to: `base/controllers` needs zod, legitimately. What a
browser-side consumer needed was a boundary, not another file move.

`./metadata` carries the stereotypes (`service`, `component`, `configuration`, `injectable`,
`provide`, `model`, `datasource`, `repository`, `inject`), the namespaces
(`BindingNamespaces`, `ArtifactNamespaces`, `CoreBindings`) and `ArtifactTypes`, `BindingKeys`,
`MetadataRegistry`. It is listed export by export rather than re-exporting `base/metadata` - that
directory is clean today but promises nothing, and the point of a sub-path is a surface someone
decided on.

Its weight is a contract, checked by the same test.

## Who is affected

**You bundle IGNIS for a browser.** Import from `@venizia/ignis-kernel/metadata` - 23 KB gzipped instead of 161 KB. A deep import of `Container` alone also got 6.7x smaller.

**Everyone else.** Nothing - same exports, same behaviour.

**Files:**

- [`packages/kernel/src/base/controllers/common/schemas.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/base/controllers/common/schemas.ts) - the zod schemas, kept apart
- [`packages/kernel/src/base/controllers/common/constants.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/base/controllers/common/constants.ts) - zod-free by design
