---
title: After 0.4.4 - What Changed and How to Upgrade
description: "Every user-facing change since 0.4.4 in one table, with an ordered upgrade checklist. IGNIS 0.4.5 loads a peer that ships two builds as the ES module copy your own import holds."
packages:
  [
    '@venizia/dev-configs',
    '@venizia/ignis-inversion',
    '@venizia/ignis-filter',
    '@venizia/ignis-helpers',
    '@venizia/ignis-boot',
    '@venizia/ignis-kernel',
    '@venizia/ignis-connectors',
    '@venizia/ignis-worker',
    '@venizia/ignis',
  ]
---

# Changelog - 2026-10-28

## After 0.4.4: what changed and how to upgrade

<Badge type="warning" text="Behavior Change" /> <Badge type="tip" text="New Feature" /> <Badge type="info" text="Bug Fix" /> <Badge type="tip" text="Enhancement" />

**In one line.** 0.4.5 fixes the two-copies problem of peers that ship an ES module and a CommonJS build, fixes a false positive in the boot test helper, and adds the test-trimming tools of `devz check`. No security fix and no breaking change. Update the packages together; the rest needs action only if you import `bullmq` or `socket.io-client` yourself.

## What changed

Each row links the entry with the details.

| Group | Change | Entry |
|---|---|---|
| Behavior change | `ModuleUtility.load` resolves a peer from the project root with the `import` condition, so a peer that ships both builds (`bullmq`, `socket.io-client`, the `@connectrpc` peers) comes back as the copy your own `import` gets. `ModuleUtility.preload({ modules })` registers that copy for the constructors that cannot await. The gRPC adapter loads its peers with `load`; a registered `@connectrpc` peer now satisfies it | [ModuleUtility.load resolves the ES module copy](/changelogs/2026-10-28-module-load-es-copy-and-preload) |
| Fix | `assertApplicationBoots` reported "mounted more than once" for every route with a validator, authenticate or authorize chain. It counts a controller once per method and path now; a real duplicate is still reported | [assertApplicationBoots](/changelogs/2026-10-28-assert-application-boots) |
| Feature | When a boot fails inside a component, `assertApplicationBoots` logs one warning that names it and `skipComponents`. The rejection is still the original error | [assertApplicationBoots](/changelogs/2026-10-28-assert-application-boots) |
| Feature | `devz check test-weight`, `test-dead-code`, `test-mutate` and `test-controls`: measure a suite, list unreferenced support files, replay a mutation ledger that proves a deleted test is covered, and keep a registry of positive controls | [devz check test-weight and friends](/changelogs/2026-10-28-dev-configs-test-trim-tools) |
| Fix | The tmpdir preload is passed as `--preload @venizia/dev-configs/testing/tmpdir-preload` in a package's `test` script: bun reads only the `bunfig.toml` of the folder it runs in, so a root file covers a run from the root only. The `ignis` app and lib presets now pass it. The 0.4.4 entry said "a `bunfig.toml`" | [dev-configs testing export](/changelogs/2026-10-27-dev-configs-testing-spawn-tmpdir) |

## Upgrade checklist

Do these in order.

1. **Update every `@venizia/*` package together** to 0.4.5. IGNIS packages pin each other exactly, so a partial update leaves two copies of a package.
2. **Import `bullmq` or `socket.io-client` yourself and compare classes with `instanceof`, or pass their instances between your code and the helpers?** Load the ES module copy once, at the entrypoint, before the helpers are built:

```typescript
import { ModuleUtility } from '@venizia/ignis-helpers';

await ModuleUtility.preload({ modules: ['bullmq', 'socket.io-client'] });
```

   Or hand the module to the one helper (`new BullMQHelper({ ..., module: await import('bullmq') })`). Without either, `BullMQHelper` and `SocketIOClientHelper` still read the CommonJS copy in their constructors, as in 0.4.4.
3. **Call `ModuleUtility.load` for a peer yourself?** A peer that ships both builds now comes back as its ES module copy (named exports on the namespace). A CommonJS-only peer arrives as before, `{ default: <exports> }`. Nothing else changes.
4. **Compile a gRPC application with `bun build --compile`?** Nothing to do. You can also register both entry points instead of passing `module`: `ModuleUtility.register({ modules: { '@connectrpc/connect': connect, '@connectrpc/connect/protocol': protocol } })`.
5. **Pass `routes: false` to `assertApplicationBoots` only to get past "mounted more than once"?** Remove it. If a component that needs infrastructure fails the boot, the log now says which one and names `skipComponents`.
6. **Used the tmpdir preload from the 0.4.4 notes?** A `[test] preload` in the root `bunfig.toml` does not apply to `bun test` run inside a package. Pass it in the package's `test` script instead (no new file): `bun test --preload @venizia/dev-configs/testing/tmpdir-preload`. Apps created from the `ignis` presets get this from 0.4.5; an existing app edits its `test` script.
7. **Optional: use the trim tools** when you want to remove tests with proof. They are dry runs and reports; nothing runs unless you call it:

```bash
NODE_ENV=test bun test ./src --parallel --reporter=junit --reporter-outfile=report.xml
bunx devz check test-weight report.xml   # time, cases, duplicates, files without assertions
```

## Who is affected

- **Apps that import `bullmq` or `socket.io-client` and use `instanceof` or share instances with the helpers.** Step 2.
- **Code that calls `ModuleUtility.load` on a dual-build peer.** Step 3.
- **Apps with a boot test that sets `routes: false`.** Step 5.
- **Repositories that put the tmpdir preload only in the root `bunfig.toml`, and apps that want it in their test script.** Step 6.
- **Repositories that want to trim their tests.** Step 7.
- **Everyone else.** Update the packages together; no other change is needed.
