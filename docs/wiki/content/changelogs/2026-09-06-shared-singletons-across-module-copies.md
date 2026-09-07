---
title: applicationEnvironment and the Module Registry Are Shared Across Module Copies; configs.path.base Is Checked at Construction
description: A process that holds both the ESM and the CommonJS build of @venizia/ignis-helpers now sees one applicationEnvironment and one ModuleUtility registry. A RestApplication whose configs.path.base is not a string fails at construction with the key named.
---

# Changelog - 2026-09-06

## Shared singletons across module copies

<Badge type="warning" text="Bug Fix" />

**In one line.** `AppEnvs.set()` in one copy of helpers is now read by the other copy, and a peer handed to `ModuleUtility.register()` is found by every copy.

```typescript
// a test written in TypeScript resolves helpers through `import` (dist/esm) ...
AppEnvs.set('APP_ENV_INVOICE_CLAIM_BASE_URL', 'https://probe.example');
// ... while a compiled library in the same process resolves it through `require` (dist/cjs).
buildClaimUrl(); // before: read an empty value from a second instance; now: reads the value above
```

## The problem it solves

`@venizia/ignis-helpers` publishes a CommonJS and an ESM build. A process that loads both - a TypeScript test beside a compiled house library, or two copies inside one bundle - held two `applicationEnvironment` instances and two `ModuleUtility` registries. A value set through one was invisible to the other. The logger provider already survived this through a `globalThis` slot; these two did not. One consumer had seven test cases failing on every run for this reason, on every version since 0.2.0-8.

## What changed

- **`applicationEnvironment`** (`AppEnvs`, `Envs`) is resolved from `globalThis[Symbol.for('ignis:application-environment')]`; the first copy to load creates it, every later copy reuses it. No API change.
- **`ModuleUtility.register()`** stores into `globalThis[Symbol.for('ignis:module-registry')]`, so `load()` in any copy finds a registered peer. In a `bun build --compile` binary this is the difference between booting and failing to resolve the peer.
- **`RestApplication` checks `configs.path.base` at construction.** A config assembled from the environment can lose it at run time while its type says `string`; the router then failed later, inside `route()`, with `undefined is not an object (evaluating 'path.replaceAll')`. It now throws `[<scope>] configs.path.base must be a string | value: undefined | an empty string mounts the application at the root` before the boot sequence starts.

## Who is affected

- **Tests that mix `import` and `require` of helpers.** Values set through `AppEnvs` are now visible everywhere; a test that relied on the two instances being separate (unlikely) would notice.
- **Compiled binaries registering peers.** `ModuleUtility.register()` from the entrypoint now reaches the framework's own copy.
- **Applications whose base path comes from an unset environment variable.** They fail at construction with the key named instead of at `start()`; set the variable (an empty string mounts at the root).

## Details

| Symbol | Change | Package |
|---|---|---|
| `applicationEnvironment`, `AppEnvs`, `Envs` | One instance per process through a `Symbol.for` slot | helpers |
| `ModuleUtility.register` / `load` / `loadSync` | Registry shared across module copies | helpers |
| `RestApplication` constructor | Throws when `configs.path.base` is not a string | kernel |
