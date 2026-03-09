---
title: Customizable JWT Payload Field Codecs
description: Pluggable serialization/deserialization for JWT payload fields with AuthenticationFieldCodecs builder
---

# Changelog - 2026-03-04

## Customizable JWT Payload Field Codecs

Adds pluggable field codecs to `AbstractBearerTokenService`, allowing consumers to control how individual JWT payload fields are serialized (encrypt) and deserialized (decrypt). Previously, `roles` was hardcoded as pipe-delimited and all other fields used `` `${value}` `` — silently corrupting arrays and objects.

## Overview

- **`IPayloadFieldCodec<T>`**: New interface for custom field serialization/deserialization
- **`AuthenticationFieldCodecs`**: New class with built-in `ROLES_CODEC` and a `build()` factory method
- **`fieldCodecs` option**: All three token service option interfaces (`IJWSTokenServiceOptions`, `IJWKSIssuerOptions`, `IJWKSVerifierOptions`) accept an optional `fieldCodecs` array
- **Symmetric JSON serialization**: Default fallback uses `JSON.stringify`/`JSON.parse` for all types — no more `String()` corruption

## Breaking Changes

> [!WARNING]
> This section contains changes that require migration or manual updates to existing code.

### 1. Default serialization changed from `String()` to `JSON.stringify`

Fields without a codec are now serialized via `JSON.stringify` instead of `String()`. This means:
- Strings are now JSON-quoted: `"hello"` → `'"hello"'` (encrypted form differs)
- Numbers and booleans roundtrip correctly: `42` → `"42"` → `42` (previously stayed as string `"42"`)
- Existing encrypted tokens using `String()` serialization **will fail to deserialize** under the new logic

**Before:**
```typescript
// String "hello" serialized as: hello
// Number 42 serialized as: 42
// Array [1,2] serialized as: 1,2 (corrupted!)
```

**After:**
```typescript
// String "hello" serialized as: "hello" (JSON)
// Number 42 serialized as: 42 (JSON)
// Array [1,2] serialized as: [1,2] (JSON, correct!)
```

### 2. `ROLES_CODEC` no longer auto-registered

The built-in roles codec is no longer automatically applied. If you use AES payload encryption with the `roles` field, you must explicitly pass `ROLES_CODEC` in the `fieldCodecs` array.

**Before:**
```typescript
// ROLES_CODEC was automatically applied — no configuration needed
this.bind<TJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS }).toValue({
  standard: JOSEStandards.JWS,
  options: {
    jwtSecret: '...',
    applicationSecret: '...',
    getTokenExpiresFn: () => 86400,
  },
});
```

**After:**
```typescript
import { AuthenticationFieldCodecs } from '@venizia/ignis';

this.bind<TJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS }).toValue({
  standard: JOSEStandards.JWS,
  options: {
    jwtSecret: '...',
    applicationSecret: '...',
    getTokenExpiresFn: () => 86400,
    fieldCodecs: [AuthenticationFieldCodecs.ROLES_CODEC],
  },
});
```

## New Features

### IPayloadFieldCodec Interface

**File:** `packages/core/src/components/auth/authenticate/common/types.ts`

**Problem:** No way to control serialization of custom JWT payload fields. Arrays and objects were silently corrupted by `String()`.

**Solution:** A generic codec interface that pairs a field key with serialize/deserialize functions.

```typescript
interface IPayloadFieldCodec<T = unknown> {
  key: string;
  serialize(opts: { value: T }): string;
  deserialize(opts: { raw: string }): T;
}
```

### AuthenticationFieldCodecs Class

**File:** `packages/core/src/components/auth/authenticate/common/codecs.ts`

**Problem:** No reusable way to define or share field codecs.

**Solution:** A class with a built-in `ROLES_CODEC` and a `build()` factory method.

```typescript
import { AuthenticationFieldCodecs } from '@venizia/ignis';

// Use the built-in roles codec
const rolesCodec = AuthenticationFieldCodecs.ROLES_CODEC;

// Build a custom codec
const permissionsCodec = AuthenticationFieldCodecs.build<string[]>({
  key: 'permissions',
  serialize(opts) { return opts.value.join(','); },
  deserialize(opts) { return opts.raw.split(','); },
});
```

**Benefits:**
- Type-safe: generic `<T>` flows through serialize/deserialize
- Reusable: codecs are plain objects, shareable across services
- `build()` factory validates structure at the type level

### fieldCodecs Option

**Problem:** All token service options lacked codec configuration.

**Solution:** Added `fieldCodecs?: IPayloadFieldCodec[]` to `IJWSTokenServiceOptions`, `IJWKSIssuerOptions`, and `IJWKSVerifierOptions`.

```typescript
this.bind<TJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS }).toValue({
  standard: JOSEStandards.JWS,
  options: {
    jwtSecret: process.env.APP_ENV_JWT_SECRET,
    applicationSecret: process.env.APP_ENV_APPLICATION_SECRET,
    getTokenExpiresFn: () => 86400,
    fieldCodecs: [
      AuthenticationFieldCodecs.ROLES_CODEC,
      AuthenticationFieldCodecs.build<string[]>({
        key: 'permissions',
        serialize(opts) { return opts.value.join(','); },
        deserialize(opts) { return opts.raw.split(','); },
      }),
    ],
  },
});
```

### Symmetric JSON Serialization

**File:** `packages/core/src/components/auth/authenticate/services/bearer/abstract.service.ts`

**Problem:** `serializeField` used `String()` for primitives but `deserializeField` needed try/catch to guess the format — asymmetric and error-prone.

**Solution:** Both sides now use `JSON.stringify`/`JSON.parse` uniformly. No try/catch, no type guessing.

```typescript
// serializeField: codec → JSON.stringify
protected serializeField(opts: { key: string; value: any }): string {
  const codec = this.fieldCodecs.get(key);
  if (codec) return codec.serialize({ value });
  return JSON.stringify(value);
}

// deserializeField: codec → JSON.parse
protected deserializeField(opts: { key: string; value: string }) {
  const codec = this.fieldCodecs.get(key);
  if (codec) return codec.deserialize({ raw: value });
  return JSON.parse(value);
}
```

## Files Changed

### Core Package (`packages/core`)

| File | Changes |
|------|---------|
| `src/components/auth/authenticate/common/types.ts` | Added `IPayloadFieldCodec<T>` interface; added `fieldCodecs?: IPayloadFieldCodec[]` to `IJWSTokenServiceOptions`, `IJWKSIssuerOptions`, `IJWKSVerifierOptions` |
| `src/components/auth/authenticate/common/codecs.ts` | New file — `AuthenticationFieldCodecs` class with `ROLES_CODEC` and `build()` factory |
| `src/components/auth/authenticate/common/constants.ts` | Removed `ROLES_CODEC` (moved to `codecs.ts`) |
| `src/components/auth/authenticate/common/index.ts` | Added `export * from './codecs'` |
| `src/components/auth/authenticate/services/bearer/abstract.service.ts` | Added `fieldCodecs` Map; updated `configurePayloadEncryption` to accept codecs; extracted `serializeField`/`deserializeField` methods; symmetric JSON serialization |
| `src/components/auth/authenticate/services/bearer/jws.service.ts` | Forwards `fieldCodecs` to `configurePayloadEncryption` |
| `src/components/auth/authenticate/services/bearer/jwks/issuer.service.ts` | Forwards `fieldCodecs` to `configurePayloadEncryption` |
| `src/components/auth/authenticate/services/bearer/jwks/verifier.service.ts` | Forwards `fieldCodecs` to `configurePayloadEncryption` |

## Migration Guide

> [!NOTE]
> Follow these steps if you're upgrading from a previous version.

### Step 1: Add ROLES_CODEC if using AES payload encryption with roles

If your JWT payloads include `roles` and you use `applicationSecret` for AES encryption, add `AuthenticationFieldCodecs.ROLES_CODEC` to your options:

```typescript
import { AuthenticationFieldCodecs } from '@venizia/ignis';

// In your JWT options
options: {
  // ...existing options
  fieldCodecs: [AuthenticationFieldCodecs.ROLES_CODEC],
},
```

### Step 2: Rotate tokens (if using AES encryption)

The default serialization changed from `String()` to `JSON.stringify`. Existing encrypted tokens will not deserialize correctly under the new format. Plan a token rotation (e.g., force re-login) after upgrading.

### Step 3: Replace custom serialization workarounds

If you had custom logic working around the old `String()` corruption (e.g., post-processing array fields after decryption), replace it with a proper field codec:

```typescript
const myArrayCodec = AuthenticationFieldCodecs.build<string[]>({
  key: 'tags',
  serialize(opts) { return JSON.stringify(opts.value); },
  deserialize(opts) { return JSON.parse(opts.raw); },
});
```
