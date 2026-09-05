---
title: Dependency floors raised across the chain, audit down to six accepted advisories
description: Every catalog range moved to its latest compatible version, two Bun WebSocket mirror signatures narrowed for bun-types 1.4, and the six advisories that remain are named with the reason each one stays.
---

# Changelog - 2026-09-04

## Dependency floors raised across the chain

<Badge type="tip" text="Enhancement" /> <Badge type="danger" text="Security" /> <Badge type="warning" text="Breaking Change" />

**In one line.** Every `@venizia/*` package now declares its newest compatible dependency versions, so an app that pins older exact versions must raise its pins when it upgrades.

## What changed

- **Catalog ranges moved to the latest compatible releases.** Notably `hono` ^4.13.7, `zod` ^4.5.4, `@hono/zod-openapi` ^1.6.3, `pg` ^8.23.0, `typesense` ^3.0.6, `bullmq` ^5.81.4, `@scalar/hono-api-reference` ^0.11.16, `tsc-alias` ^1.9.4, `@types/bun` ^1.4.1, `eslint` ^10.10.0, `prettier` ^3.9.6.
- **Peer ranges are unchanged.** Only catalog and devDependency floors moved; an app that pins `hono` 4.12.30, `pg` 8.21.0 or `bullmq` 5.80.8 still satisfies every `@venizia/*` peer range. The two exceptions are deliberate and listed here: `meilisearch` widened, `@venizia/ignis-boot`'s `typescript` narrowed.
- **`meilisearch` 0.60 accepted.** The peer range of `@venizia/ignis-connectors` and `@venizia/ignis` is `^0.59.0 || ^0.60.0` (0.60.0 adds the Meilisearch 1.50 search rules and changes no method the connector calls); the framework builds and tests against 0.60.0.
- **The repository-wide `@electric-sql/pglite` override is 0.5.8.** It stays an exact version for the reason it always had (one Drizzle store entry across the workspace); only the number moved.
- **`@venizia/ignis-boot` peer `typescript` is `^5.0.0 || ^6.0.0`, no longer `>=5.0.0`.** The artifact scanner calls the TypeScript JS API (`createSourceFile`, `forEachChild`, `SyntaxKind`), which TypeScript 7.0 does not export, so a 7.x install would have satisfied the old range and crashed `ignis-artifacts` at run time.
- **Two Bun mirror signatures narrowed.** `IWebSocket.send` and `IBunServer.publish` (`@venizia/ignis-helpers/websocket`) accept `string | ArrayBuffer | SharedArrayBuffer | Uint8Array | DataView`. A bare structural `ArrayBufferView` no longer type-checks there, because bun-types 1.4 defines `BufferSource` as typed arrays and `DataView` only.
- **Audit went from 126 advisories to 6.** The in-range update resolved 120. The remaining six are transitive and stay on purpose - see below.
- **Not bumped, on purpose.** `bullmq` stays on 5.x: 6.0 (2026-07-30) replaces the `connection` option with a backend factory, drops legacy repeatable jobs, removes `Queue#client`, and makes `ioredis` an optional peer - a breaking change for every app that pins 5.x. `ioredis` stays on 5.x: 6.0 switches the wire protocol to RESP3 by default, which changes reply shapes, and BullMQ 5 still installs its own ioredis 5. `typescript` stays on 6.0.3: 7.0 removes the JS API that `typescript-eslint` (peer `<6.1.0`) and the boot scanner call. `@scalar/hono-api-reference` stays on 0.11.x (0.12 is a breaking 0.x step and apps pin 0.11.11); `@libsql/client` stays on 0.17.x (0.18 breaks the SQLite example's Drizzle table types).

## Who is affected

- **Apps that pin exact versions through `overrides` (nx-seller).** Raise the pins to at least the floors above in the same change as the `@venizia/*` bump, or `bun install` forces the older library onto the framework. The [migration guide](/guides/migrations/boot-api-removal-migration) lists the table.
- **Code that calls `socket.send` or `server.publish` on the Bun mirror types with a `Buffer`, `Uint8Array` or string.** No action needed.
- **Code that passed a structural `ArrayBufferView` there.** Pass a typed array or a `DataView` instead.

## Breaking changes

> [!WARNING]
> Only the mirror signature narrowing can stop a build, and only for callers that passed a value typed as the structural `ArrayBufferView`.

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

The six advisories that remain, and why each one stays:

| Advisory | Where | Why it stays |
|---|---|---|
| `decode-uri-component` <= 0.4.2 (DoS on malformed percent-encoding) | `minio` -> `query-string` 7 | every patched release is ESM-only and `minio` `require()`s it from CommonJS; an override breaks object storage at runtime. Exposure: `minio` builds these query strings itself. |
| `stream-json` <= 3.4.0 (quadratic filters) | `minio` | patched releases are ESM-only and drop the `jsonl/Parser.js` path `minio` imports; `minio` never uses the affected `pick`/`ignore`/`filter`/`replace` filters. |
| `esbuild` <= 0.24.2 (dev server CORS) | `vitepress` -> `vite` 5, `drizzle-kit` | dev-server only; a workspace-wide override would force `vite` 5 onto an `esbuild` it does not support. |
| `vite` 5.4.x (three dev-server advisories) | `vitepress` 1.6.4 (latest) | the docs dev server only; `vitepress` has no release on `vite` 6 or later. |

Re-run the audit with `bun audit`; the count must not grow past these six.
