---
title: ModuleUtility.load resolves the ES module copy, and preload registers it
description: "ModuleUtility.load imports a peer from the project root as the copy your own import gets, ModuleUtility.preload registers that copy for constructors that cannot await, and the gRPC adapter loads its peers with load."
packages: ['@venizia/ignis-helpers', '@venizia/ignis']
---

# Changelog - 2026-10-28

## ModuleUtility.load resolves the ES module copy, and preload registers it

<Badge type="warning" text="Behavior Change" />

**In one line.** A peer that ships an ES module build and a CommonJS build (`bullmq`, `socket.io-client`, the `@connectrpc` peers) is no longer loaded as a second copy next to the one your own `import` holds. Ships in 0.4.5.

## What changed

- **`ModuleUtility.load` resolves from the project root** with the `import` condition of the peer's `exports` map: the instance your own `import` of the peer gets. A module the project root cannot resolve is imported by name, as before; a registered module still wins.
- **`ModuleUtility.preload({ modules })`** is new: it loads each module with `load` and registers it, so the synchronous `loadSync` (the only path a constructor has) returns the ES module copy afterwards. One line at the entrypoint: `await ModuleUtility.preload({ modules: ['bullmq', 'socket.io-client'] })`.
- **The gRPC adapter loads its peers with `load`.** A registered `@connectrpc` peer now satisfies it, as a compiled binary needs.
- **`loadSync` is unchanged**: it resolves with `require`, so without `preload` (or the helper's `module` option) `BullMQHelper` and `SocketIOClientHelper` still hold the CommonJS copy.

## Who is affected

- **Code that called `ModuleUtility.load`** for a peer that ships both builds now gets the ES module copy. A CommonJS-only peer still arrives as `{ default: <exports> }`, as before.
- **Applications that import `bullmq` or `socket.io-client` themselves and compare classes with `instanceof`** should call `preload` once at the entrypoint, or pass `module` to the helper. Nothing else is needed.
- This resolves the "Known dual-copy hazards" paragraph of the 0.4.4 notes.
