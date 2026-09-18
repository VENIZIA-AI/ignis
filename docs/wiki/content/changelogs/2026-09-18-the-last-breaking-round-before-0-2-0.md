---
title: The Last Breaking Round Before 0.2.0
description: "Four breaking changes, batched before 0.2.0 stable: ioredis becomes an optional peer, ErrorSchema leaves helpers, resolvers take an options object, and upload labels in the query are refused."
---

# Changelog - 2026-09-18

The last breaking changes before `0.2.0` stable, in one batch so an application migrates once.

## Migration checklist

| If your code... | Do this |
|---|---|
| reaches Redis at runtime (`createRedisHelper`, a Redis helper, `BullMQHelper`, the socket-io/websocket components) | `bun add ioredis` in the package the service STARTS from - peers resolve from the project root, which is that package under an isolated install |
| imports `ErrorSchema` or `TErrorResponse` from `@venizia/ignis-helpers` | import them from `@venizia/ignis` (or `@venizia/ignis-kernel`) |
| calls `resolveValue(x)`, `resolveValueAsync(x)` | `resolveValue({ value: x })`, `resolveValueAsync({ value: x })` |
| calls `resolveClass(ref)`, `resolveInjectTarget(target)` | `resolveClass({ ref })`, `resolveInjectTarget({ target })` |
| sends upload labels (`principalType`, `principalId`, `variant`, `sequence`, `folderPath`) in the query | send them in the form body (or the `upload-commit` JSON body) |

## `ioredis` is an optional peer

<Badge type="danger" text="Breaking" />

`@venizia/ignis-helpers` listed `ioredis` as a dependency, so every install pulled a Redis client - a
frontend on `@venizia/ignis-kernel` included. It is now an optional peer, loaded when a Redis helper
is constructed. Without it the constructor throws:

```text
[ModuleUtility.loadSync] ioredis is required. Please install 'ioredis'
```

This is a RUNTIME failure at the first client construction, not a compile error - add the dependency
before deploying. Measured on one consumer monorepo (isolated install, services started with `bun .`
from their own package): 16 of 17 service packages needed the line.

`@hono/zod-openapi` is no longer a peer of helpers at all: its only use was a duplicate `ErrorSchema`.

## `ErrorSchema` lives in the kernel only

<Badge type="danger" text="Breaking" />

Helpers and the kernel each defined the same OpenAPI error schema. The helpers copy - the reason its
root barrel imported `@hono/zod-openapi` - is gone. `ErrorSchema` and `TErrorResponse` come from
`@venizia/ignis` / `@venizia/ignis-kernel`, same fields.

## Resolvers take an options object

<Badge type="danger" text="Breaking" />

`resolveValue`, `resolveValueAsync`, `resolveClass` and `resolveInjectTarget` follow the
`methodName(opts)` convention. Type guards (`isClass`, `isApplicationError`, `X.isValid`) stay
positional: a TypeScript predicate can only narrow a parameter, not a property of `opts`.

## Upload labels in the query are refused

<Badge type="danger" text="Breaking" />

The query was a deprecated fallback for labels. It now answers
`400 core.static_asset.labels_in_query`, checked before the body is read. Ignoring the query instead
would store the object with no principal and no error.

## Also in this round

- No `for` loop head holds an expression any more (200 sites): the iterable is a named `const` first.
