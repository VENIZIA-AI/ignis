---
title: A direct-upload policy signs one object, and a commit token can name its owner
description: "One POST policy now authorizes exactly one key, the commit token can be bound to the user it was issued to, upload-commit calls authorize, and a new verify method lets an app check a file before committing it."
packages: ['@venizia/ignis-helpers', '@venizia/ignis']
---

# Changelog - 2026-11-11

## A direct-upload policy signs one object, and a commit token can name its owner

<Badge type="danger" text="Security" /> <Badge type="tip" text="New Feature" /> <Badge type="warning" text="Breaking" />

**In one line.** A signed POST policy used to allow any number of uploads under `pending/` until it expired; it now allows exactly one key. The commit token can be bound to its owner, and the commit route is now guarded by `authorize` like the policy route.

## What changed

- **One policy, one object.** `presignPost` takes `object: { key }` and signs that key as it stands. `formData` carries the `key`, so the client no longer appends it.
- **The token names its owner.** The new optional `directUpload.resolveOwner` supplies the owner on both routes. A token issued to an owner commits only for that owner; any other caller, or none, gets the same invalid-token answer a forged token gets.
- **`upload-commit` checks `authorize`,** before the body is read and before any storage call. `false` answers `403` with `core.static_asset.upload_not_authorized`. The message now reads "Not allowed to upload", since the code answers both routes; the code is unchanged.
- **`verify({ token, owner? })`** on `StaticAssetUploadCommitService` runs the checks a commit starts with (signature, expiry, owner, `keyPrefix` scope) and returns the pending `{ bucket, object }`. It makes no storage call, so an app can read an uploaded file and report its problems before anything is committed. `commit` calls it itself.
- **`directUpload.expires`** sets two lifetimes: `upload` for the policy (default 15 minutes) and `commit` for the token (default: `upload`), so users can validate and fix a file for longer than the upload window.

## Who is affected

- **Apps that post the policy form by hand.** Append every `formData` field and then `file`; do not append `key`, and do not change it. A form with a second `key` or a different one is refused by storage.
- **Apps that call `presignPost` themselves.** Pass `object: { key }` in place of `keyPrefix`.
- **Apps that call the commit service.** The parameter is now `token`.
- **Apps that set `directUpload.expiresIn`.** It is now `directUpload.expires.upload`.
- **Apps that mounted `upload-commit` with a different gate than `authorize`.** `authorize` now runs on both routes; make sure it answers for the commit caller too.
- **Tokens issued before this release.** The token format changed, so an old token no longer verifies. They expire within minutes (the default window is 15), but a client holding one across the upgrade must ask for a new policy.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> Nothing is aliased. Replace each old form with its new one.

| Old | New |
|---|---|
| `presignPost({ bucket, keyPrefix, maxBytes })` | `presignPost({ bucket, object: { key }, maxBytes })` |
| `form.append('key', policy.objectName)` in the client | remove it; `policy.formData` already has `key` |
| `commit({ commitToken, labels })` on the commit service | `commit({ token, labels })` |
| `directUpload: { expiresIn }` | `directUpload: { expires: { upload } }` |
| commit token payload `{ bucket: string, key, expiresAt }` | `{ bucket: IBucketRef, object: IObjectRef, expiresAt, owner? }` |
| `upload-commit` ran without `authorize` | `upload-commit` calls `authorize` first |

The HTTP field is still `commitToken` in the policy response and in the commit body; only the service parameter was renamed.

**Before:**

```typescript
const form = new FormData();
for (const [key, value] of Object.entries(policy.formData)) form.append(key, value);
form.append('key', policy.objectName);
form.append('file', file);
```

**After:**

```typescript
const form = new FormData();
const formFields = Object.entries(policy.formData);

for (const [fieldName, fieldValue] of formFields) {
  form.append(fieldName, fieldValue);
}

form.append('file', file);
```

## Details

```typescript
directUpload: {
  authorize: ({ context }) => Boolean(context.get('currentUser')),
  resolveOwner: ({ context }) => context.get('currentUser').id,
  secretKey,
  maxBytes: 100 * 1024 * 1024,
  expires: { upload: { unit: 'minute', value: 10 }, commit: { unit: 'hour', value: 6 } },
},
```

See [Direct upload](/extensions/components/static-asset/direct-upload) for "Validate, then commit" and "Operating it". Put a lifecycle rule on `pending/` that is longer than `expires.commit`.
