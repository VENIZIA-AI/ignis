---
title: The Last Breaking Round Before 0.2.0
description: "Four breaking changes, batched before 0.2.0 stable: ioredis becomes an optional peer, ErrorSchema leaves helpers, resolvers take an options object, and upload labels in the query are refused."
packages: ['@venizia/ignis', '@venizia/ignis-helpers', '@venizia/ignis-kernel']
---

# Changelog - 2026-09-18

## The last breaking round before 0.2.0

<Badge type="danger" text="Breaking" />

**In one line.** The last breaking changes before `0.2.0` stable, in one batch so an application migrates once.

## What changed

- **`ioredis` is an optional peer.** `@venizia/ignis-helpers` no longer pulls a Redis client into every install. It is loaded when a Redis helper is constructed. Without it the constructor throws `[ModuleUtility.loadSync] ioredis is required. Please install 'ioredis'`, a runtime failure rather than a compile error, so add the dependency before deploying. `@hono/zod-openapi` is no longer a peer of helpers at all.
- **`ErrorSchema` lives in the kernel only.** `ErrorSchema` and `TErrorResponse` come from `@venizia/ignis` or `@venizia/ignis-kernel`, same fields.
- **Resolvers take an options object.** `resolveValue`, `resolveValueAsync`, `resolveClass` and `resolveInjectTarget` follow the `methodName(opts)` convention. Type guards (`isClass`, `isApplicationError`, `X.isValid`) stay positional.
- **Upload labels in the query are refused.** The query was a deprecated fallback. It now answers `400 core.static_asset.labels_in_query`, checked before the body is read.

## Who is affected

- **Anyone reaching Redis at runtime.** Includes `createRedisHelper`, a Redis helper, `BullMQHelper` and the socket-io and websocket components.
- **Anyone importing `ErrorSchema` or `TErrorResponse` from helpers.**
- **Anyone calling the resolver functions or sending upload labels in the query.**

## Breaking changes

> [!WARNING]
> Four independent changes. Check each row against your code.

| If your code... | Do this |
|---|---|
| reaches Redis at runtime (`createRedisHelper`, a Redis helper, `BullMQHelper`, the socket-io/websocket components) | `bun add ioredis` in the package the service STARTS from - peers resolve from the project root, which is that package under an isolated install |
| imports `ErrorSchema` or `TErrorResponse` from `@venizia/ignis-helpers` | import them from `@venizia/ignis` (or `@venizia/ignis-kernel`) |
| calls `resolveValue(x)`, `resolveValueAsync(x)` | `resolveValue({ value: x })`, `resolveValueAsync({ value: x })` |
| calls `resolveClass(ref)`, `resolveInjectTarget(target)` | `resolveClass({ ref })`, `resolveInjectTarget({ target })` |
| sends upload labels (`principalType`, `principalId`, `variant`, `sequence`, `folderPath`) in the query | send them in the form body (or the `upload-commit` JSON body) |
