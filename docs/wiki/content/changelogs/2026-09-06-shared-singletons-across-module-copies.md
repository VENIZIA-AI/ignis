---
title: applicationEnvironment and the Module Registry Are Shared Across Module Copies; configs.path.base Is Checked at Construction
description: A process that holds both the ESM and CommonJS build of @venizia/ignis-helpers now sees one applicationEnvironment and one ModuleUtility registry, and a non-string configs.path.base fails at construction.
packages: ['@venizia/ignis-helpers', '@venizia/ignis-kernel']
---

# Changelog - 2026-09-06

## Shared singletons across module copies

<Badge type="warning" text="Bug Fix" />

**In one line.** `AppEnvs.set()` in one copy of helpers is now read by the other copy, and a peer handed to `ModuleUtility.register()` is found by every copy.

## What changed

- **`applicationEnvironment`** (`AppEnvs`, `Envs`) is one instance per process. A process that loads both the ESM and CommonJS build of `@venizia/ignis-helpers` (for example a TypeScript test beside a compiled library, or two copies in one bundle) used to hold two instances, so a value set through one was invisible to the other. No API change.
- **`ModuleUtility.register()`** is shared across copies, so `load()` in any copy finds a registered peer. In a `bun build --compile` binary this is the difference between booting and failing to resolve the peer.
- **`RestApplication` checks `configs.path.base` at construction.** A config assembled from the environment can lose it at run time. The router used to fail later inside `route()` with `undefined is not an object (evaluating 'path.replaceAll')`. It now throws `[<scope>] configs.path.base must be a string | value: undefined | an empty string mounts the application at the root` before the boot sequence starts.

```typescript
AppEnvs.set('APP_ENV_INVOICE_CLAIM_BASE_URL', 'https://probe.example');
buildClaimUrl(); // before: read an empty value from a second instance; now: reads the value above
```

## Who is affected

- **Tests that mix `import` and `require` of helpers.** Values set through `AppEnvs` are now visible everywhere. A test that relied on the two instances being separate (unlikely) would notice.
- **Compiled binaries registering peers.** `ModuleUtility.register()` from the entrypoint now reaches the framework's own copy.
- **Applications whose base path comes from an unset environment variable.** They fail at construction with the key named instead of at `start()`. Set the variable (an empty string mounts at the root).
