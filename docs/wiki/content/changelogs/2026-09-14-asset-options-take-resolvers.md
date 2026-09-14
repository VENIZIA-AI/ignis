---
title: Asset Options Take A Resolver Anywhere They Took A Value
description: "controller.bucket, metaLink.model and metaLink.repository accept a value or a function returning one; TResolveObjectName is renamed TObjectNameResolver, following the verb-last naming the repository already uses."
---

# Changelog - 2026-09-14

## Asset options take a resolver anywhere they took a value

<Badge type="danger" text="Breaking" />

**In one line.** One type is renamed, and three options widen to `TValueOrAsyncResolver`.

| Before | After |
|---|---|
| `TResolveObjectName` | `TObjectNameResolver` |
| `controller.bucket?: string \| (() => string)` | `controller.bucket?: TValueOrAsyncResolver<string>` |
| `metaLink.model: typeof BaseRelationalEntity<Schema>` | `metaLink.model: TValueOrAsyncResolver<...>` |
| `metaLink.repository: DefaultCRUDRepository<Schema>` | `metaLink.repository: TValueOrAsyncResolver<...>` |

The rename is the breaking half. `TResolveObjectName` read verb-first, which named an action; every
other type in the repository names a thing. The shape is untouched, so the fix is the new name.

The route table also gained a name of its own, `TStaticAssetRoutes`, lifted out of the inline
`controller.routes` shape. Nothing about it changed.

The other breaking change landing today touches the same component: the download route drops its
plural, `/downloads/{objectName}` becomes
[`/download/{objectName}`](./2026-09-14-download-route-singular).

## Why a resolver, and what it buys

A resolver is read when the value is used, not when the options object is built. That is what lets a
repository be named before the container has bound it, and what lets a bucket come from an
environment variable read per request rather than at boot:

```ts
controller: { name: 'AssetController', basePath: '/assets', bucket: () => process.env.APP_ENV_BUCKET },
metaLink: {
  model: MetaLinkModel,
  repository: () => application.get<MetaLinkRepository>({ key: 'repositories.MetaLinkRepository' }),
},
```

A plain value still works everywhere. A class is treated as a value, never as a factory, so
`model: MetaLinkModel` is never called.

## Who is affected

**You name `TResolveObjectName`.** Rename it. The compiler finds every site.

**You pass a plain bucket, model or repository.** Nothing. A value is still a value.

**You wrote `bucket: () => env`.** Nothing. That form already worked and is now the documented shape.

**Files:**

- [`packages/core-server/src/components/static-asset/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/common/types.ts) - `TObjectNameResolver`, `TStaticAssetRoutes`, `TMetaLinkConfig`
- [`packages/core-server/src/components/static-asset/controller/factory.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/controller/factory.ts) - `resolveBucket`
