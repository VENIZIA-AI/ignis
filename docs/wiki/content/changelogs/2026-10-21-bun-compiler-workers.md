---
title: BunCompiler Compiles Bun Workers Into the Binary
description: "BunCompiler.compile({ workers }) bundles the Bun Worker files an app starts into the same executable."
packages: ['@venizia/dev-configs']
---

# Changelog - 2026-10-21

## BunCompiler compiles Bun Workers into the binary

<Badge type="tip" text="Feature" />

**In one line.** List the Bun Worker files your app starts in `workers`, and `BunCompiler.compile` puts them in the same executable.

```typescript
// .configs/builders/compile.ts
await BunCompiler.compile({
  entrypoint: './src/index.ts',
  workers: ['./src/image-reader.worker.ts'],
  define: await BuildInfoStamp.define(),
});
```

## What changed

- **`workers?: string[]`.** Bun only embeds a worker file in a compiled executable when the file is an entrypoint of the build. `BunCompiler.compile` passes each worker after the main `entrypoint`, so `new Worker('./image-reader.worker.ts')` in the app finds it inside the binary.
- **`entrypoint` is unchanged.** A compile without workers needs no change.

## Who is affected

An app that starts a Bun Worker and called `Bun.build` itself to include it can move to `BunCompiler.compile({ workers })`.
