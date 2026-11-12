---
title: Direct upload takes resolvers, signs metadata per file and commits once
description: "directUpload.resolveOwner becomes directUpload.resolvers.owner (required), with per-file signed metadata and a commit destination. A file name that is a path is refused, a commit is single-use, and the token is read strictly."
packages: ['@venizia/ignis']
---

# Changelog - 2026-11-12

## Direct upload takes resolvers, signs metadata per file and commits once

<Badge type="warning" text="Breaking" /> <Badge type="danger" text="Security" /> <Badge type="tip" text="New Feature" />

**In one line.** A token always has an owner now, can carry metadata your app chose for the file, and commits once; a policy no longer accepts a file name that is a path.

## What changed

- **`resolvers`.** `directUpload.resolveOwner` is now `directUpload.resolvers.owner`, and it is required. Beside it: `resolvers.metadata({ context, file })`, run per file when the policy is issued, and `resolvers.commit.destination({ owner, metadata, file, defaultKey })`, run at commit. A service call may pass `commit({ ..., destination: { key } })`, which wins.
- **Metadata in the token.** What `resolvers.metadata` returns is signed into the commit token (strings only, 1024 bytes of JSON per file). The client may send `files[].metadata` as a hint; only what your resolver returns is signed. A client that sends metadata where no resolver reads it gets `400` `upload_metadata_invalid`. The token is signed, not encrypted: put no secrets in it.
- **Read it back everywhere.** `verify` answers `{ bucket, object, owner, metadata }`, the validation handler takes `{ file, owner, metadata }`, and the commit answers `owner` and `metadata`. The commit also writes the metadata into the MetaLink row's `metadata` column under `app`, with no migration.
- **Choose the final key.** `resolvers.commit.destination` returns another key in the same bucket. It must be a valid key inside `keyPrefix`; otherwise `400` `object_key_out_of_scope` or `object_name_invalid`, and nothing is copied.
- **A commit is single-use.** Commit now checks the destination first. A POST policy stays valid until it expires, so a client could post to the pending key again and commit again over the first object. That now answers `409` `core.static_asset.upload_already_committed`, with `extra: { object: { key }, link }` so a client that lost the first answer still gets the link; nothing is copied or recorded. It costs one `HEAD` per commit.
- **A file name is one valid key segment.** `upload-policy` refuses a `fileName` such as `../../x.png`, `a/b/c/d/e.png`, `..` or one with a line break, with `400` `object_name_invalid`. Before, it went into the key unchecked and bypassed the folder-depth and segment rules.
- **A strict token read.** A token has exactly two parts, its key must start with this entry's pending prefix and `keyPrefix`, and its bucket must be the entry's. A token that another entry signed with the same secret is refused as `invalid_commit_token`.
- **New errors.** `core.static_asset.upload_already_committed` (`409`) and `core.static_asset.upload_metadata_invalid` (`400`).

## Who is affected

- **Apps with `directUpload`.** Replace `resolveOwner` with `resolvers: { owner }`. Compilation fails until you do. Without `resolvers.owner` the entry refuses to start.
- **Apps that call the services.** `owner` is required on `issuePolicies`, `verify`, `validate` and `commit`, and `verify` is async.
- **Tokens issued before the upgrade.** They lack `metadata` and answer `400` `invalid_commit_token`. Users upload again.
- **Clients that send a path as `fileName`.** They get `400` now. Send the name only.
- **Apps that retry `upload-commit` with the same token.** The second call answers `409` instead of overwriting.

## Breaking changes

> [!WARNING]
> `directUpload.resolveOwner` is removed. `directUpload.resolvers.owner` replaces it and is required, so a token never commits for whoever holds it.

**Before:**

```typescript
directUpload: {
  use: true,
  resolveOwner: ({ context }) => userIdOf(context),
  // ...
},
```

**After:**

```typescript
directUpload: {
  use: true,
  resolvers: {
    owner: ({ context }) => userIdOf(context),
    metadata: ({ file }) => ({ orderId: file.metadata?.orderId ?? '' }),
  },
  // ...
},
```

See [Resolvers](/extensions/components/static-asset/direct-upload#resolvers), [A token commits once](/extensions/components/static-asset/security#a-token-commits-once) and the [migration notes](/extensions/components/static-asset/migration#resolvers-replace-resolveowner).
