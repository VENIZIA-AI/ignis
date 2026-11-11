---
title: Static-asset routes take one auth setting, and the bucket-management routes are off by default
description: "An entry's auth applies to every built-in route, publicRead leaves reading one object open, and the four routes that list, read, create and delete buckets must now be turned on."
packages: ['@venizia/ignis-kernel', '@venizia/ignis']
---

# Changelog - 2026-11-11

## Static-asset routes take one auth setting, and the bucket-management routes are off by default

<Badge type="danger" text="Security" /> <Badge type="tip" text="New Feature" /> <Badge type="warning" text="Breaking" />

**In one line.** Until now every static-asset route was open unless you set `authenticate` and `authorize` on each of twelve routes by hand. One `auth` on the entry now covers them all, and the four bucket-management routes no longer exist unless you ask for them.

## What changed

- **`auth` on an entry.** `{ authenticate?, authorize?, publicRead? }` sits beside `controller` and applies to every built-in route, the direct-upload routes included.
- **A route can differ.** `routes.<key>.authenticate` or `.authorize` replaces the entry's for that route, field by field, and `{ skip: true }` opens it.
- **`publicRead`.** Leaves reading one object (`getObjectByName`, `downloadObjectByName`) unauthenticated so a browser can show an image without a token. Listing a bucket's objects is not public.
- **The bucket-management routes are off by default.** `getBuckets`, `getBucketByName`, `createBucket` and `deleteBucket` are registered only with `enabled: true`, with or without a `controller.bucket`.
- **One resolver.** The kernel's `RouteConfigResolver` now has `resolveAuthenticate` and `resolveAuthorize`; the CRUD controller factory and the static-asset controller both use them, with the same priority.

## Who is affected

- **Apps that use the four bucket routes.** They disappear until you turn each one on. This is the only breaking change.
- **Apps that left static-asset routes open.** Nothing changes until you set `auth`, but you should: set it on the entry.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> The four bucket-management routes are no longer registered unless enabled.

**Before:**

```typescript
assets: {
  controller: { name: 'AssetController', basePath: '/assets' },
  // ...
},
```

**After:**

```typescript
assets: {
  auth: { authenticate: { strategies: ['jwt'] } },
  controller: {
    name: 'AssetController',
    basePath: '/assets',
    routes: {
      getBuckets: { enabled: true },
      getBucketByName: { enabled: true },
      createBucket: { enabled: true },
      deleteBucket: { enabled: true },
    },
  },
  // ...
},
```

## Details

```typescript
auth: { authenticate: { strategies: ['jwt'] }, publicRead: true },
// every route needs a JWT, except reading one object
```

See [Static Asset API](/extensions/components/static-asset/api#authentication-auth-and-per-route-overrides).
