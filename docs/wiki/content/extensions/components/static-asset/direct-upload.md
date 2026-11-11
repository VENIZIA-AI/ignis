---
title: Direct upload
description: Let the browser send bytes straight to storage. What to configure, what the browser does, and why each safeguard is there.
---

# Direct upload

Every upload today travels twice - browser to IGNIS, IGNIS to storage - and the backend holds the
whole file while it does. For a few megabytes that is the right model and this page is not for you.

For video, turn on `directUpload` and the bytes never touch your process.

```ts
application.component(StaticAssetComponent, {
  options: {
    assets: {
      controller: {
        name: 'AssetController',
        basePath: '/assets',
        bucket: 'uploads',              // required: a policy names one bucket
        directUpload: {
          authorize: ({ context }) => Boolean(context.get('currentUser')),
          resolveOwner: ({ context }) => context.get('currentUser').id,
          secretKey: process.env.APP_ENV_UPLOAD_SECRET,
          maxBytes: 100 * 1024 * 1024,
        },
      },
      storage: StaticAssetStorageTypes.BUN_S3,
      helper: storageHelper,
    },
  },
});
```

Two routes appear - `routes.uploadPolicy` and `routes.uploadCommit` in `controller.routes`, each overridable and each with its own `enabled` switch. A third, `routes.uploadValidate`, appears when you set `directUpload.validation`; see [Validate, then commit](#validate-then-commit). Leave `directUpload` out and none exists.

> [!TIP]
> `controller.keyPrefix` scopes direct upload too: the pending key becomes `pendingPrefix + keyPrefix`, so the committed key lands inside the scope. The commit route re-checks the scope as well, in case a token was signed by another controller with the same `secretKey`. See [`controller.keyPrefix`](./api#controller-keyprefix).

## The three round trips

```
1. browser -> IGNIS   POST {base}/upload-policy   { files: [...] }
                   <- [{ postURL, formData, objectName, commitToken, expiresAt }]

2. browser -> STORAGE  multipart POST to postURL        (IGNIS sees no byte)

3. browser -> IGNIS   POST {base}/upload-commit   { commitToken }
                   <- the object at its final key, and its MetaLink row
```

The third trip is not ceremony. Storage tells your backend nothing, so without it there is no
MetaLink row and no way to attach the object to an order, a ticket or a user.

## The commit writes the row

The response carries `metaLink` exactly as an ordinary upload does, so a client reading an `id` and
a `link` off it needs no branch for which path the bytes took.

```json
{ "commitToken": "...", "principalType": "Product", "principalId": "42", "variant": "thumbnail" }
```

The labels are the ones the ordinary upload takes. They sit beside the token and not inside it: the
token is an HMAC over `{ bucket, object, expiresAt, owner? }` and deliberately carries no other business fields.
Omit them and the row is still written, without the labels.

If the row fails the response is still **200**, with the reason as a code:

```json
{ "bucket": { "name": "uploads" }, "object": { "key": "..." }, "link": "...",
  "metaLink": { "error": "META_LINK_CREATE_FAILED" } }
```

By then the copy has happened and the pending object is gone - the object is committed. A 500 would
send the caller back with a token whose source no longer exists.

## What the browser does

```js
const [policy] = await fetch('/assets/upload-policy', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    files: [{ fileName: file.name, contentType: file.type, size: file.size }],
  }),
}).then(response => response.json());

const form = new FormData();
const formFields = Object.entries(policy.formData);

for (const [fieldName, fieldValue] of formFields) {
  form.append(fieldName, fieldValue);
}

form.append('file', file);                       // LAST, always

await fetch(policy.postURL, { method: 'POST', body: form });

await fetch('/assets/upload-commit', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    commitToken: policy.commitToken,
    principalType: 'Product',          // optional labels, beside the token
    principalId: productId,
    sequence: 0,
  }),
});
```

> [!WARNING]
> `file` must be the last field. Storage reads the form in order and ignores everything after it.
> The `key` is already in `formData`, signed: do not append your own, and do not change it. A policy is good for exactly that one object.

A runnable page that performs all three and prints each request is at
[`/direct-upload-demo.html`](/direct-upload-demo.html) - open your browser's Network tab while it
runs and watch step 2 leave without touching the backend.

## Options

| Option | Type | Default | Meaning |
|---|---|---|---|
| `authorize` | `({ context }) => ValueOrPromise<boolean>` | - | **Required.** Who may use direct upload. Guards **both** routes: `false` answers `403` with `core.static_asset.upload_not_authorized` before the body is read or storage is touched. |
| `resolveOwner` | `({ context }) => ValueOrPromise<string>` | - | Who the upload belongs to. The policy route signs the answer into the commit token; the commit route refuses a token whose owner differs, as an invalid token. Absent, a token commits for whoever holds it. |
| `secretKey` | `string` | - | Signs the commit token. Keep it out of the repository and out of the client. |
| `maxBytes` | `number` | - | The ceiling the policy carries as `content-length-range`. Over it answers `413` with `core.static_asset.upload_too_large`, the same code the ordinary upload uses. |
| `pendingPrefix` | `string` | `'pending/'` | Where a policy may write. The final key is never inside it. |
| `expires.upload` | `IDuration` | 15 minutes | How long the browser may post the bytes: the policy's lifetime. |
| `expires.commit` | `IDuration` | `expires.upload` | How long the commit token stays good, for validating and committing after the upload. Set it longer when users validate, fix and confirm after the file landed. |
| `validation` | `IStaticAssetValidation` | - | Your check of the pending file; made with `StaticAssetValidation.define`. Present, it registers `upload-validate`, and `commit` refuses an invalid file with `UPLOAD_INVALID`. |
| `onCommit` | `({ bucket, pendingObject, object }) => ValueOrPromise<void>` | - | Runs **before** the copy. |

## Use from a service

The two routes are thin wrappers over two services. The component binds one of each per entry that sets `directUpload` (and a `bucket`), so your code can issue a policy, check an upload or commit it without an HTTP call to its own server.

| Service | Key | Method |
|---|---|---|
| `StaticAssetUploadPolicyService` | `StaticAssetBindingKeys.policyService({ name })` | `issuePolicies({ files, owner? })` - the `upload-policy` body: one signed policy per file, each good for one key. |
| `StaticAssetUploadCommitService` | `StaticAssetBindingKeys.commitService({ name })` | `verify({ token, owner? })` - the checks a commit starts with, no storage call; answers the pending `{ bucket, object }`. |
| | | `commit({ token, owner?, labels? })` - `verify`, then copy to the final key, remove the pending object, write the MetaLink row. Answers `{ bucket, object, link, metaLink? }`. |

`name` is the entry's key in the options object (`assets` above), not the controller name. The HTTP field is still `commitToken`; only the service parameter is `token`.

The common case: the client sends `commitToken` along with the record, and the service commits while it saves. The example injects the storage helper to clean up on failure; `'helpers.AssetStorage'` is a placeholder for the key your own application bound that helper under, not one IGNIS provides.

```ts
import { BaseService, inject } from '@venizia/ignis';
import {
  StaticAssetUploadCommitService,
  StaticAssetBindingKeys,
} from '@venizia/ignis/static-asset';

export class ProductService extends BaseService {
  constructor(
    @inject({ key: StaticAssetBindingKeys.commitService({ name: 'assets' }) })
    private assetCommit: StaticAssetUploadCommitService,
    // Your own binding of the helper the entry was configured with.
    @inject({ key: 'helpers.AssetStorage' }) private storage: IStorageHelper,
    @inject({ key: 'repositories.ProductRepository' }) private products: ProductRepository,
  ) {
    super({ scope: ProductService.name });
  }

  async create(opts: { data: TProductInput; commitToken: string; userId: string }) {
    const committed = await this.assetCommit.commit({
      token: opts.commitToken,
      owner: opts.userId,
      labels: { principalType: 'Product', principalId: opts.data.sku },
    });

    try {
      return await this.products.create({ data: { ...opts.data, imageLink: committed.link } });
    } catch (error) {
      // The object now sits at its FINAL key, where the pending-prefix lifecycle rule never looks.
      await this.storage
        .removeObject({ bucket: committed.bucket, object: committed.object })
        .catch(() => undefined);
      throw error;
    }
  }
}
```

> [!WARNING]
> **A token commits for its owner only when you set one.** With `directUpload.resolveOwner` the token names the user it was issued to, and `commit` refuses any other `owner` (or none) as an invalid token. Without it a token carries no owner, so anyone who holds it can commit it. When you call the services yourself, pass the same `owner` you would have resolved: `issuePolicies({ files, owner })` signs it and `commit({ token, owner })` checks it.

> [!WARNING]
> **`issuePolicies` does not call `directUpload.authorize`.** That check belongs to the routes; code that calls the services decides for itself who may use direct upload. `verify` and `commit` still check the token, the owner and the `keyPrefix` scope, so a forged, expired, foreign or out-of-scope token is refused before any storage call.

**Order matters.** `commit` is the point of no return: the object leaves `pending/` for its final key. If saving your record fails afterwards, nothing removes that object for you, so remove it in the failure path as above. The cleanup is best effort: if it fails too, one object stays at the final key until you collect it.

If the MetaLink row cannot be written, `commit` still resolves, with `metaLink: { error }`: the object is committed by then, and a throw would send the caller back with a token whose source no longer exists.

## Validate, then commit

When the file has to be checked before it is accepted - an Excel import whose cells must parse, say - the user should see the problems first, and nothing should be committed until the file is good. You write only the check; the component adds the route and the refusal.

Define the shape of one issue and the check with `StaticAssetValidation.define`, and set it as `directUpload.validation`:

```ts
import { z } from '@hono/zod-openapi';
import { StaticAssetValidation } from '@venizia/ignis/static-asset';

const CellIssueSchema = z.object({
  sheet: z.string(),
  row: z.number().int(),
  column: z.string(),
  code: z.string(),
  message: z.string(),
});

const workbookValidation = StaticAssetValidation.define({
  issueSchema: CellIssueSchema,
  handler: async ({ bucket, object, owner, helper }) => {
    const fileStream = await helper.getObject({ bucket, object });

    // Your own parser: one issue per broken cell.
    const issues = await workbookChecker.check({ fileStream, owner });

    return { isValid: issues.length === 0, issues };
  },
});

// directUpload: { authorize, resolveOwner, secretKey, maxBytes, validation: workbookValidation }
```

`issueSchema` is the shape of **one** issue. It types the handler - an issue of another shape fails type-checking - and it documents the route's response. The handler gets the **pending** object (`bucket` and `object`, the shape `getObject` takes), the storage `helper` and the `owner` the token was issued to.

Setting `validation` registers `POST {base}/upload-validate`, which takes `{ commitToken }` and answers `{ isValid, issues }` with your issues in your shape. It is overridable through `routes.uploadValidate`, with the same `enabled`, `path` and `middleware` as the other routes, and it calls `authorize` first, like them.

1. The browser asks for a policy and posts the file, as above.
2. It calls `upload-validate` with the `commitToken` and shows the issues.
3. The user fixes the file and uploads again. That is a **new policy**; the abandoned pending object is left for the lifecycle rule.
4. When the file is valid, the user confirms - or your server commits by itself - with `upload-commit`, or `commit({ token, owner, labels })` from a service. The commit **is** the "accepted" mark: an object at a final key was accepted, so no tags are needed.
5. A job picks the committed object up from the commit result.

**Commit runs the validation again.** An invalid file is refused with `422` `core.static_asset.upload_invalid` before `onCommit` and before any copy, so an invalid file can never be committed - not by skipping the validate call, not by a forged client. The error carries no issues; the validate route is where a user reads them.

From a service, `validate({ token, owner })` is the same check without a route: it calls `verify`, then your handler, and with no `validation` configured it answers `{ isValid: true, issues: [] }`.

For a server-commits-only setup, drop the commit route so the browser cannot confirm on its own, and call `commit` from your service when you are satisfied:

```ts
controller: {
  // ...
  routes: { uploadCommit: { enabled: false } },
},
```

`onCommit` stays the last gate before the copy - a magic-bytes check, a size check - and not the place for user-facing validation: a throw there is one error, and a user needs the whole list.

## Why a policy and not a presigned PUT

A signed PUT binds each header to an **exact** value. `content-length: 2048` means exactly 2048
bytes; there is no way to say "at most 2 MB". The client would have to know the byte count before
asking, and every retry or re-encode would become an opaque 403.

A POST policy signs a document of conditions instead, and conditions are a small language:
`content-length-range` says what equality cannot, and the `key` condition pins the form to one object.

Worth knowing even if you never reach for it: a presigned PUT is also **reusable until it expires**
and **overwrites** an existing key. Anyone who intercepts one can replace the object.

## The safeguards, and what each is for

**One policy authorizes one object.** The policy signs the exact key `pending/<generated>` and `formData`
carries it, so a policy cannot be spent on a second object, however long it lives. On commit, IGNIS
copies server-side to the final key. That key appears in **no policy**, so content cannot be replaced
after the commit - the property a presigned PUT cannot give you.

**The commit is claimed with a token, never with a key.** The token is an HMAC over
`{ bucket, object, expiresAt, owner? }`, verified **before any storage call**. So a caller cannot name
an object it was never granted, and the route is not a name prober - a forged token fails without a
round trip, so timing says nothing about what exists.

**The token names its owner.** With `resolveOwner`, only that owner commits it, and every other
caller gets the same invalid-token answer a forged token gets.

**The token carries no other business fields.** Which order or tenant an upload belongs to is your
authorization, and a token IGNIS signs is the wrong place to keep it.

**`authorize` is required, not defaulted, and guards both routes.** The policy route hands out a write
credential and the commit route promotes an object; there is no safe default for who may use either,
so the type system makes you decide.

**`onCommit` runs before the copy.** A hook that throws leaves the object under the pending prefix
for a lifecycle rule to collect, rather than stranding it at the final key forever.

**Removing the temporary object is cleanup, not the commit.** If it fails the commit still succeeds
and logs a warning - failing the request would tell the caller their upload did not work when it did.

## Behind a private endpoint

`host` is inside every SigV4 signature, so the `postURL` your browser receives cannot be rewritten
afterwards. Give the helper both hosts:

```ts
new BunS3Helper({
  accessKey,
  secretKey,
  endpoint: {
    default: 'http://minio:9000',        // what this process talks to
    public: 'https://cdn.example.com',   // what the browser is handed
  },
});
```

## When step 2 answers 403

The policy is doing its job. In order of likelihood:

| Cause | Check |
|---|---|
| The bucket refuses cross-origin POST | your bucket's CORS rules - this one costs people an afternoon |
| The file is over `maxBytes` | the `content-length-range` condition |
| The `key` field is not the one the policy signed | you changed it, or posted a second object with one policy - a policy is good for one key |
| The policy expired | `expiresAt`, and `expires.upload` |

## Operating it

- **Put a lifecycle rule on `pending/`.** Abandoned uploads, files a user replaced and objects whose commit never came all stay there; the rule is what collects them. Set it longer than `expires.commit` (`expires.upload` when that is unset), or an object can vanish under a token that is still good. One day is a sensible start.
- **Keep `expires.upload` short.** It is only the time to upload in. Give users time to fix and confirm with `expires.commit` instead of a long policy.
- **Rate-limit `upload-policy`.** A policy is a write credential. A route override takes `middleware`, and it runs before the handler, so it also runs before `authorize`:

```ts
controller: {
  // ...
  routes: { uploadPolicy: { middleware: [uploadPolicyRateLimit] } },
},
```

## Deliberately not built

Multipart and resumable upload. Malware scanning - `onCommit` is the seam, the scanner is yours. A
commit token carrying business fields beyond the owner.

**Files:**

- [`packages/helpers/src/modules/storage/bun-s3/utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/bun-s3/utility.ts) - `S3SignatureUtility.buildPostPolicy`
- [`packages/core-server/src/components/static-asset/services/policy.service.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/services/policy.service.ts) - `StaticAssetUploadPolicyService.issuePolicies`
- [`packages/core-server/src/components/static-asset/services/commitment.service.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/services/commitment.service.ts) - `StaticAssetUploadCommitService.verify`, `StaticAssetUploadCommitService.commit`
- [`packages/core-server/src/components/static-asset/utilities/commit-token.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/utilities/commit-token.utility.ts) - `StaticAssetCommitTokenUtility.build`, `StaticAssetCommitTokenUtility.read`
