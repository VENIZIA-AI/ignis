---
title: Customizable JWT Payload Field Codecs
description: JWT payload fields can now use custom codecs for AES encryption, arrays and objects no longer get corrupted, and existing AES-encrypted tokens stop working.
packages: ['@venizia/ignis']
---

# Changelog - 2026-03-04

## Customizable JWT Payload Field Codecs

**In one line.** You choose how each JWT payload field is encrypted and decrypted, and arrays and objects now survive the round trip instead of being flattened to a string.

## What changed

- **`fieldCodecs` option.** `IJWSTokenServiceOptions`, `IJWKSIssuerOptions` and `IJWKSVerifierOptions` accept an optional `fieldCodecs` array of `IPayloadFieldCodec`.
- **`AuthenticationFieldCodecs`.** Provides the built-in `ROLES_CODEC` and a type-safe `build<T>()` to make your own.
- **Correct serialization by default.** Fields without a codec now use `JSON.stringify` and `JSON.parse`. Before, `String()` corrupted arrays (`[1,2]` became `1,2`).
- **`ROLES_CODEC` is not applied automatically anymore.**

## Who is affected

- **Apps using `applicationSecret` (AES payload encryption).** Follow the breaking changes below.
- **Apps without AES payload encryption.** No action needed.

## Breaking changes

> [!WARNING]
> With AES payload encryption on, tokens issued before the upgrade will not deserialize, and `roles` need an explicit codec.

- Existing encrypted tokens using the old `String()` format **fail to deserialize**. Plan a token rotation (for example, force re-login) after upgrading.
- Strings are now JSON-quoted before encryption (`"hello"` becomes `'"hello"'`), so the encrypted form differs.

**Before:**

```typescript
// ROLES_CODEC was applied automatically
options: {
  jwtSecret: '...',
  applicationSecret: '...',
  getTokenExpiresFn: () => 86400,
},
```

**After:**

```typescript
import { AuthenticationFieldCodecs } from '@venizia/ignis';

options: {
  jwtSecret: '...',
  applicationSecret: '...',
  getTokenExpiresFn: () => 86400,
  fieldCodecs: [AuthenticationFieldCodecs.ROLES_CODEC],
},
```

## Migration

1. If your payload has `roles` and you use `applicationSecret`, add `AuthenticationFieldCodecs.ROLES_CODEC` to `fieldCodecs`.
2. Rotate tokens after upgrading (AES encryption only).
3. Replace any workaround for the old `String()` corruption (for example, post-processing array fields after decryption) with a field codec.

## Details

```typescript
interface IPayloadFieldCodec<T = unknown> {
  key: string;
  serialize(opts: { value: T }): string;
  deserialize(opts: { raw: string }): T;
}

const permissionsCodec = AuthenticationFieldCodecs.build<string[]>({
  key: 'permissions',
  serialize(opts) { return opts.value.join(','); },
  deserialize(opts) { return opts.raw.split(','); },
});
```
