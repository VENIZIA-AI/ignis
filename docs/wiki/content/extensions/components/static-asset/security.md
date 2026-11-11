---
title: Static Asset Component - Security
description: What the component leaves open by default and how to close it - entry auth, publicRead, the one-key policy, the commit token and its owner, the pending prefix and its lifecycle rule, served content and rate limiting.
---

# Security

A file route that anyone can call is a public file server. This page lists what is open when you declare nothing, then each control that closes it.

## What is open by default

| Surface | Default | Close it with |
|---|---|---|
| Every built-in route | **open** to anyone | [`auth`](#authentication-and-authorization) on the entry |
| `listObjects` under `publicRead` | **private** | nothing to do |
| A commit token | commits for **whoever holds it** | [`resolveOwner`](#the-owner-in-the-token) |
| Objects an upload leaves under the pending prefix | stay until you remove them | a [lifecycle rule](#clean-up-the-pending-prefix) |

The entry serves one bucket and no route lists, creates or deletes buckets, so nothing about bucket management is exposed.

## Authentication and authorization

Put `auth` on the entry and it applies to **every** built-in route, direct upload and validate included.

```ts
import { Authentication } from '@venizia/ignis';
import { DiskHelper } from '@venizia/ignis-helpers';
import type { TStaticAssetComponentOptions } from '@venizia/ignis/static-asset';

export const options: TStaticAssetComponentOptions = {
  documents: {
    basePath: '/documents',
    bucket: 'documents',
    helper: new DiskHelper({ basePath: './app_data' }),
    auth: {
      authenticate: { strategies: [Authentication.STRATEGY_JWT] },
      authorize: { action: 'read', resource: 'document' },
    },
    serverUpload: { use: true },
    directUpload: { use: false },
    metaLink: { use: false },
    routes: {
      deleteObject: { use: true, authorize: { action: 'delete', resource: 'document' } },
      downloadObjectByName: { use: true, authenticate: { skip: true } },
    },
  },
};
```

- `auth.authenticate` is `{ strategies, mode }`; `auth.authorize` is one authorization spec or a list.
- A route's own `authenticate` or `authorize` in `routes.<key>` **replaces** the entry's for that route, field by field.
- `{ skip: true }` opens the route: `authenticate: { skip: true }` drops authentication and authorization for it, and `authorize: { skip: true }` drops authorization only.
- Without `auth` a route has no authentication. The component never guesses a strategy.

The resolution is the one the CRUD controller factory uses (`RouteConfigResolver.resolveAuthenticate` and `resolveAuthorize`), so a static-asset route and a CRUD route answer the same way. Register an authorization enforcer before you use a spec: a route that declares one with no enforcer registered is refused, unless the authorization option `defaultDecision` is `allow`.

### `publicRead`

`auth.publicRead: { use: true }` leaves reading **one** object unauthenticated, so a browser can show an image without a token.

| Route | With `publicRead` |
|---|---|
| `getObjectByName` | open |
| `downloadObjectByName` | open |
| `listObjects` | **still guarded**: listing a bucket is not reading an object |
| every other route | still guarded |

`publicRead` is a default. A route that sets its own `authenticate` or `authorize` keeps it.

## Direct upload

### One key per policy

A POST policy signs the exact pending key (`pending/<keyPrefix><generated>/<name>`) and its form carries it. A browser cannot spend one policy on a second object, however long the policy lives. The final key appears in **no** policy, so content cannot be replaced after the commit - the property a presigned PUT cannot give you.

### The commit token

The token is an HMAC over `{ bucket, object, expiresAt, owner? }`, verified before any storage call. A caller cannot name an object it was never granted, and the route is not a name prober: a forged token fails without a round trip, so timing says nothing about what exists.

| The token proves | The token does **not** prove |
|---|---|
| A policy was issued for this key | who is holding it (unless it has an owner) |
| The grant has not expired | that the file is valid |
| Nobody edited the key, bucket or owner | that the holder may use direct upload |

### The owner in the token

Set `directUpload.resolveOwner` and the policy route signs the caller into the token. The commit and validate routes then refuse any other caller, or none, as an invalid token - the same answer a forged token gets, so it reveals nothing. Without it, a token commits for anyone who holds it. See [Who owns an upload](./direct-upload#who-owns-an-upload).

### `authorize` guards every direct-upload route

`upload-policy`, `upload-validate` and `upload-commit` all call `directUpload.authorize` first, and answer `403` `core.static_asset.upload_not_authorized` on `false`. The option may be left out only when `auth` authenticates or authorizes; with neither, the entry refuses to start.

The route's JSON validator runs before `authorize`, so a malformed body answers `422` before an unauthorized caller gets `403`.

### An invalid file never commits

`commit` runs your [`validation`](./direct-upload#validation) again, so skipping the validate route does not skip the check.

### The pending prefix

A direct upload lands in the pending prefix first, and moves to its final key at commit. The routes must never serve a pending object: it is unchecked, and the user may not have confirmed it. Two settings keep it out of reach, and the component checks both at start-up.

- `keyPrefix` is **required** with `directUpload`. Every route refuses a key outside it, so the entry serves only what lives inside it.
- `directUpload.pendingPrefix` (default `pending/`) must be **disjoint** from `keyPrefix`: neither starts with the other.

With `keyPrefix: 'products/'` and `pendingPrefix: 'products/pending/'`, a pending object would sit inside the scope, and `getObjectByName`, `downloadObjectByName` and `listObjects` would serve it. The component refuses that entry. A `keyPrefix` such as `pending/imports/` collides with the default `pending/` the same way.

| Rule for `pendingPrefix` | Start-up error when broken |
|---|---|
| Not empty and ends with `/` | `directUpload.pendingPrefix must be one or more valid key segments, each followed by a slash` |
| Every part is a valid key segment (no `..`, no leading `.`, no shell characters) | the same error |
| Does not start with `keyPrefix`, and `keyPrefix` does not start with it | `directUpload.pendingPrefix and keyPrefix must not contain one another` |

Each error is prefixed with the entry's name, and it lists the offending values.

The pending key is `pendingPrefix` + `keyPrefix` + a generated folder + the file name, so the committed key lands inside the scope. A commit token that another entry signed with the same `secretKey` cannot land outside the scope: the commit checks it again.

## Served content

The component decides the served type from the object **name**, never from the uploader or the storage:

- A type is rendered inline only when it is in the allow list: common images, video, audio, `application/pdf`, `text/plain` and `text/csv`. Everything else is served as `application/octet-stream` with `Content-Disposition: attachment`.
- `image/svg+xml` is not in the list: SVG carries script, and a renderable upload on the API origin is stored XSS.
- Every object response carries `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox`.
- Of the storage's own headers only `Content-Encoding`, `Cache-Control`, `ETag` and `Last-Modified` pass through.
- `downloadObjectByName` always attaches.

Switch `getObjectByName` off (`routes.getObjectByName: { use: false }`) to make every read an attachment.

## Rate-limit `upload-policy`

A policy is a write credential, so cap how often one caller can ask for it. A route override takes `middleware`, and it runs before the handler - before `authorize` too.

```ts
import type { MiddlewareHandler } from 'hono';
import type { TStaticAssetRoutes } from '@venizia/ignis/static-asset';

export const buildRoutes = (opts: { rateLimit: MiddlewareHandler }): TStaticAssetRoutes => ({
  uploadPolicy: { use: true, middleware: [opts.rateLimit] },
});
```

Use your own rate-limit middleware, shared across instances if you run more than one.

## Clean up the pending prefix

Abandoned uploads, files a user replaced and objects whose commit never came all stay under the pending prefix. Put a lifecycle rule on that prefix in the bucket - for example, expire after one day. The rule must target the `pendingPrefix` you configured, which is `pending/` unless you changed it.

- Make the rule **longer** than `expires.commit` (`expires.upload` when that is unset), or an object can vanish under a token that is still good.
- Keep `expires.upload` short. It is only the time to post in. Give users time to fix and confirm with `expires.commit`.
- The rule never touches a final key: a committed object lives inside `keyPrefix`, which is disjoint from the pending prefix. That is also why the rule is safe to set on the whole prefix.
- Entries that share a bucket can share `pendingPrefix`: each entry's pending files sit under its own `keyPrefix` inside it, and one rule collects them all.
- A commit whose follow-up fails leaves an object at its final key. The [service example](./direct-upload#use-from-a-service) removes it.

## A storage the browser cannot reach directly

`host` is inside every SigV4 signature, so the policy URL cannot be rewritten after it is signed. When your app talks to storage on an internal name, give the helper a public one too: `endpoint: { default: 'http://minio:9000', public: 'https://cdn.example.com' }`. See [Behind a private endpoint](./direct-upload#behind-a-private-endpoint).

## Scope a shared bucket

`keyPrefix` confines an entry to one folder of a shared bucket. Every route refuses a key outside it as `404`, before any storage call, so a caller learns nothing about keys it does not own; `listObjects` lists only inside it; and a commit token another entry signed with the same `secretKey` cannot land outside it.

**Files:**

- [`packages/core-server/src/components/static-asset/utilities/route-options.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/utilities/route-options.utility.ts) - the auth resolution
- [`packages/core-server/src/components/static-asset/utilities/key-scope.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/utilities/key-scope.utility.ts) - `keyPrefix` and `pendingPrefix` rules
- [`packages/kernel/src/base/controllers/factory/definition.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/base/controllers/factory/definition.ts) - `RouteConfigResolver`
- [`packages/core-server/src/components/static-asset/utilities/commit-token.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/utilities/commit-token.utility.ts) - the token
