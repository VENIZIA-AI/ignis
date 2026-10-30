---
title: Dependency floors raised across the chain, audit down to six accepted advisories
description: Every @venizia/* package now declares its newest compatible dependency versions, and the audit drops from 126 advisories to six that are named with the reason each stays.
packages: ['@venizia/ignis-boot', '@venizia/ignis-connectors', '@venizia/ignis', '@venizia/ignis-helpers']
---

# Changelog - 2026-09-04

## Dependency floors raised across the chain

<Badge type="tip" text="Enhancement" /> <Badge type="danger" text="Security" /> <Badge type="warning" text="Breaking Change" />

**In one line.** Every `@venizia/*` package now declares its newest compatible dependency versions, so an app that pins older exact versions must raise its pins when it upgrades.

## What changed

- **Newer floors.** Notably `hono` ^4.13.7, `zod` ^4.5.4, `@hono/zod-openapi` ^1.6.3, `pg` ^8.23.0, `typesense` ^3.0.6, `bullmq` ^5.81.4, `@scalar/hono-api-reference` ^0.11.16, `tsc-alias` ^1.9.4, `@types/bun` ^1.4.1, `eslint` ^10.10.0, `prettier` ^3.9.6.
- **Peer ranges are unchanged**, except two. An app that pins `hono` 4.12.30, `pg` 8.21.0 or `bullmq` 5.80.8 still satisfies every `@venizia/*` peer range.
- **`meilisearch` 0.60 is accepted.** The peer range of `@venizia/ignis-connectors` and `@venizia/ignis` is `^0.59.0 || ^0.60.0`.
- **`@venizia/ignis-boot` peer `typescript` is `^5.0.0 || ^6.0.0`**, no longer `>=5.0.0`. The artifact scanner needs the TypeScript JS API, which TypeScript 7.0 does not export, so a 7.x install would have crashed `ignis-artifacts` at run time.
- **Bun mirror signatures narrowed.** `IWebSocket.send` and `IBunServer.publish` (`@venizia/ignis-helpers/websocket`) accept `string | ArrayBuffer | SharedArrayBuffer | Uint8Array | DataView`.
- **Audit: 126 advisories down to 6.** The remaining six are transitive and stay on purpose (see Details). Re-run `bun audit`; the count must not grow past six.
- **zod 4.5 gotcha.** `z.object({ ...schema }).shape.optional()` loaded on 4.3.x by accident and throws at module load on 4.5.x while `tsc` stays green. Derive from the schema itself: `Schema.omit({ ... }).partial().optional()`. See the [migration guide](/guides/migrations/boot-api-removal-migration).

## Who is affected

- **Apps that pin exact versions through `overrides`.** Raise the pins to at least the floors above in the same change as the `@venizia/*` bump, or `bun install` forces the older library onto the framework. The [migration guide](/guides/migrations/boot-api-removal-migration) lists the table.
- **Code that calls `socket.send` or `server.publish` with a `Buffer`, `Uint8Array` or string.** No action needed.
- **Code that passed a structural `ArrayBufferView` there.** Pass a typed array or a `DataView` instead.

## Breaking changes

> [!WARNING]
> Only the narrowed mirror signature can stop a build, and only for callers that passed a value typed as the structural `ArrayBufferView`.

**Before:**

```typescript
const view: ArrayBufferView = new Uint8Array(payload);
socket.send(view);
```

**After:**

```typescript
socket.send(new Uint8Array(payload));
```

## Details

- **Not bumped, on purpose.** `bullmq` stays on 5.x (6.0 replaces the `connection` option and removes `Queue#client`); `ioredis` stays on 5.x (6.0 switches to RESP3); `typescript` stays on 6.0.3 (7.0 removes the JS API); `@scalar/hono-api-reference` stays on 0.11.x; `@libsql/client` stays on 0.17.x.
- **The six remaining advisories:** `decode-uri-component` and `stream-json` (both via `minio`, whose patched releases are ESM-only and would break object storage at runtime); `esbuild` <= 0.24.2 and `vite` 5.4.x (three advisories), reached only through the docs dev server and `drizzle-kit` dev tooling.
