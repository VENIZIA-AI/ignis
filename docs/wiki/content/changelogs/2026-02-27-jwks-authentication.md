---
title: JWKS Authentication & Service Hierarchy Refactor
description: Added JWKS (JSON Web Key Set) asymmetric authentication, refactored bearer token service hierarchy, introduced discriminated union options, and made AES payload encryption optional.
---

# Changelog - 2026-02-27

## JWKS Authentication & Service Hierarchy Refactor

Added full JWKS (JSON Web Key Set) asymmetric authentication support for microservice architectures. The authentication module now supports three JWT modes: **JWS** (symmetric), **JWKS Issuer** (asymmetric, signs + serves public keys), and **JWKS Verifier** (asymmetric, verifies using remote JWKS). The bearer token service hierarchy was refactored to share logic across all modes, and AES payload encryption is now optional.

## Overview

- **JWKS Issuer mode**: Asymmetric JWT signing with RSA/EC keys + automatic `/certs` JWKS endpoint
- **JWKS Verifier mode**: Verify tokens using a remote JWKS URL (for downstream microservices)
- **Service hierarchy refactor**: New `AbstractBearerTokenService` → `AbstractJWKSTokenService` base classes
- **Discriminated union options**: `TJWTTokenServiceOptions` uses `standard: 'JWS' | 'JWKS'` for type-safe configuration
- **Optional AES encryption**: `applicationSecret` is now optional - omitting it disables payload encryption
- **Manual strategy registration**: Strategies are no longer auto-registered; explicit registration required
- **File restructuring**: Bearer services moved to `services/bearer/`, Basic to `services/basic/`

## Breaking Changes

> [!WARNING]
> This release contains breaking changes that require migration. See the [Migration Guide](#migration-guide) below.

### 1. JWT options now use a discriminated union

**Before:**
```typescript
this.bind<IJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS }).toValue({
  jwtSecret: env.get('JWT_SECRET'),
  applicationSecret: env.get('APP_SECRET'),
  getTokenExpiresFn: () => 86_400,
});
```

**After:**
```typescript
this.bind<TJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS }).toValue({
  standard: JOSEStandards.JWS,   // Discriminant field
  options: {                       // Options nested under 'options'
    jwtSecret: env.get('JWT_SECRET'),
    applicationSecret: env.get('APP_SECRET'),  // Now optional
    getTokenExpiresFn: () => 86_400,
  },
});
```

### 2. Service and type renames

| Before | After |
|--------|-------|
| `JWTTokenService` | `JWSTokenService` |
| `IJWTTokenServiceOptions` | `IJWSTokenServiceOptions` (inner type) |
| `defineJWTAuth` (component method) | `defineJWSAuth` |

### 3. Removed constants

The following constants were removed from `Authentication`:

| Removed | Replacement |
|---------|-------------|
| `Authentication.ACCESS_TOKEN_SECRET` | Use env vars directly |
| `Authentication.REFRESH_TOKEN_SECRET` | Use env vars directly |
| `Authentication.ACCESS_TOKEN_EXPIRES_IN` | Use `getTokenExpiresFn` |
| `Authentication.REFRESH_TOKEN_EXPIRES_IN` | Use `getTokenExpiresFn` |

### 4. Strategy registration is now manual

**Before:** Strategies were auto-registered by `AuthenticateComponent`.

**After:** You must explicitly register strategies after component registration:

```typescript
this.component(AuthenticateComponent);

AuthenticationStrategyRegistry.getInstance().register({
  container: this,
  strategies: [
    { strategy: JWSAuthenticationStrategy, name: 'jwt' },
  ],
});
```

### 5. File structure changed

| Before | After |
|--------|-------|
| `services/jwt-token.service.ts` | `services/bearer/jws.service.ts` |
| `services/basic-token.service.ts` | `services/basic/service.ts` |
| `strategies/jwt.strategy.ts` | `strategies/jws.strategy.ts` |
| (n/a) | `services/bearer/abstract.service.ts` |
| (n/a) | `services/bearer/jwks/abstract.service.ts` |
| (n/a) | `services/bearer/jwks/issuer.service.ts` |
| (n/a) | `services/bearer/jwks/verifier.service.ts` |
| (n/a) | `strategies/jwks.strategy.ts` |
| (n/a) | `controllers/jwks/controller.ts` |

## New Features

### JWKS Issuer Mode

**Files:** `services/bearer/jwks/issuer.service.ts`, `controllers/jwks/controller.ts`

**Problem:** Microservice architectures need asymmetric JWT - one service signs tokens with a private key, other services verify using the public key. Symmetric JWT (shared secret) doesn't scale because every service needs the same secret.

**Solution:** `JWKSIssuerTokenService` signs tokens with RSA/EC private keys and serves the public key set via a `/certs` JWKS endpoint.

```typescript
this.bind<TJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS }).toValue({
  standard: JOSEStandards.JWKS,
  options: {
    mode: JWKSModes.ISSUER,
    algorithm: 'RS256',
    kid: 'auth-key-1',
    keys: {
      driver: JWKSKeyDrivers.FILE,
      format: JWKSKeyFormats.PEM,
      private: './keys/private.pem',
      public: './keys/public.pem',
    },
    getTokenExpiresFn: () => 86_400,
  },
});
```

**Features:**
- Lazy initialization with retry-on-failure - keys are loaded on first use, failed init is retried
- Supports PEM and JWK key formats
- Supports file-based (`JWKSKeyDrivers.FILE`) and inline (`JWKSKeyDrivers.TEXT`) key drivers
- Automatic `/certs` endpoint with `Cache-Control` headers
- Configurable endpoint path via `rest.path`

### JWKS Verifier Mode

**File:** `services/bearer/jwks/verifier.service.ts`

**Problem:** Downstream microservices need to verify tokens without having access to the private key.

**Solution:** `JWKSVerifierTokenService` fetches the public key set from a remote JWKS URL and verifies tokens.

```typescript
this.bind<TJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS }).toValue({
  standard: JOSEStandards.JWKS,
  options: {
    mode: JWKSModes.VERIFIER,
    jwksUrl: 'https://auth-service.internal/certs',
    cacheTtlMs: 43_200_000,   // 12h cache (default)
    cooldownMs: 30_000,        // 30s cooldown (default)
  },
});
```

**Features:**
- Lazy initialization - JWKS URL is set up on first verification
- Configurable cache TTL and cooldown
- Verify-only - `generate()` throws, preventing accidental signing
- Uses `jose` library's `createRemoteJWKSet` with built-in key rotation

### Bearer Token Service Hierarchy

**File:** `services/bearer/abstract.service.ts`

**Problem:** `JWTTokenService` contained all the logic - credential extraction, AES encryption/decryption, verify/generate flow. Adding JWKS required duplicating this.

**Solution:** Extracted shared logic into `AbstractBearerTokenService`, creating a clean inheritance hierarchy:

```
AbstractBearerTokenService
  ├── JWSTokenService (symmetric, HS256)
  └── AbstractJWKSTokenService (lazy init + retry)
      ├── JWKSIssuerTokenService (sign + verify + /certs)
      └── JWKSVerifierTokenService (verify only)
```

**Shared in base class:**
- `extractCredentials()` - parse `Authorization: Bearer` header
- `verify()` → delegates to abstract `doVerify()`
- `generate()` → delegates to abstract `getSigner()` + `getSigningKey()`
- `encryptPayload()` / `decryptPayload()` - optional AES encryption
- `configurePayloadEncryption()` - configure AES from constructor

### Optional AES Payload Encryption

**File:** `services/bearer/abstract.service.ts`

**Problem:** `applicationSecret` was previously required for both JWS and JWKS. For JWKS, AES encryption adds complexity without clear benefit (tokens are already signed with private keys).

**Solution:** `applicationSecret` is now optional across all bearer services. When omitted, `encryptPayload()` and `decryptPayload()` pass through payloads unchanged.

```typescript
// Without AES - payloads are plaintext (signed, not encrypted)
options: {
  jwtSecret: env.get('JWT_SECRET'),
  getTokenExpiresFn: () => 86_400,
}

// With AES - payload keys and values are AES-encrypted
options: {
  jwtSecret: env.get('JWT_SECRET'),
  applicationSecret: env.get('APP_SECRET'),     // Enables AES
  aesAlgorithm: 'aes-256-cbc',                  // Default
  getTokenExpiresFn: () => 86_400,
}
```

### JWKS Authentication Strategies

**File:** `strategies/jwks.strategy.ts`

Two new strategies for JWKS:

- `JWKSIssuerAuthenticationStrategy` - for the issuer service (both sign and verify)
- `JWKSVerifierAuthenticationStrategy` - for downstream verifier services (verify only)

```typescript
AuthenticationStrategyRegistry.getInstance().register({
  container: this,
  strategies: [
    // On the issuer service
    { strategy: JWKSIssuerAuthenticationStrategy, name: 'jwks' },
    // On verifier services
    { strategy: JWKSVerifierAuthenticationStrategy, name: 'jwks' },
  ],
});
```

### New Binding Key: `JWKS_OPTIONS`

**File:** `common/keys.ts`

Added `AuthenticateBindingKeys.JWKS_OPTIONS` for binding JWKS-specific options. The component binds this automatically during `defineJWKSAuth()`.

### New Constants

**File:** `common/constants.ts`

| Constant | Values | Purpose |
|----------|--------|---------|
| `JOSEStandards.JWS` | `'JWS'` | Discriminant for symmetric JWT |
| `JOSEStandards.JWKS` | `'JWKS'` | Discriminant for asymmetric JWT |
| `JWKSModes.ISSUER` | `'issuer'` | Sign tokens + serve JWKS |
| `JWKSModes.VERIFIER` | `'verifier'` | Verify tokens via remote JWKS |
| `JWKSKeyDrivers.FILE` | `'file'` | Load keys from filesystem |
| `JWKSKeyDrivers.TEXT` | `'text'` | Inline key content |
| `JWKSKeyFormats.PEM` | `'PEM'` | PKCS8/SPKI PEM format |
| `JWKSKeyFormats.JWK` | `'JWK'` | JSON Web Key format |

## Security Fixes

### Sanitized Error Messages

**Files:** `services/bearer/abstract.service.ts`

**Vulnerability:** Error messages in `verify()` and `generate()` previously included `${error.message}`, which could leak internal details (key paths, algorithm names, jose library internals) to API consumers.

**Fix:** Error messages are now generic constants. Full errors are still logged at `error` level for debugging.

```typescript
// Before: leaked internal error details
message: `[verify] Failed to verify token | Message: ${error.message}`

// After: sanitized
message: '[verify] Invalid or expired token'
```

## Files Changed

### Core Package (`packages/core-server`)

| File | Changes |
|------|---------|
| `components/auth/authenticate/component.ts` | Discriminated union dispatch, `defineJWSAuth`, `defineJWKSAuth`, removed `applicationSecret` validation |
| `components/auth/authenticate/common/constants.ts` | Added `JOSEStandards`, `JWKSModes`, `JWKSKeyDrivers`, `JWKSKeyFormats`; removed legacy `Authentication` constants |
| `components/auth/authenticate/common/keys.ts` | Added `JWKS_OPTIONS` binding key |
| `components/auth/authenticate/common/types.ts` | Added `TJWTTokenServiceOptions` discriminated union, `IJWKSIssuerOptions`, `IJWKSVerifierOptions`, `TJWKSTokenServiceOptions`; made `applicationSecret` optional |
| `components/auth/authenticate/services/bearer/abstract.service.ts` | **New.** `AbstractBearerTokenService` with shared extract/verify/generate/encrypt/decrypt |
| `components/auth/authenticate/services/bearer/jws.service.ts` | Renamed from `jwt-token.service.ts`; extends `AbstractBearerTokenService`; removed duplicated AES logic |
| `components/auth/authenticate/services/bearer/jwks/abstract.service.ts` | **New.** `AbstractJWKSTokenService` with lazy init + retry |
| `components/auth/authenticate/services/bearer/jwks/issuer.service.ts` | **New.** Asymmetric signing, key parsing (PEM/JWK), JWKS export |
| `components/auth/authenticate/services/bearer/jwks/verifier.service.ts` | **New.** Remote JWKS verification with cache |
| `components/auth/authenticate/services/basic/service.ts` | Moved from `basic-token.service.ts` |
| `components/auth/authenticate/strategies/jws.strategy.ts` | Renamed from `jwt.strategy.ts`; uses `JWSTokenService` |
| `components/auth/authenticate/strategies/jwks.strategy.ts` | **New.** `JWKSIssuerAuthenticationStrategy`, `JWKSVerifierAuthenticationStrategy` |
| `components/auth/authenticate/controllers/jwks/controller.ts` | **New.** Serves `/certs` JWKS endpoint |
| `components/auth/authenticate/controllers/jwks/definitions.ts` | **New.** Route config for GET /certs |

### Deleted Files

| File | Reason |
|------|--------|
| `services/jwt-token.service.ts` | Replaced by `services/bearer/jws.service.ts` |
| `services/basic-token.service.ts` | Replaced by `services/basic/service.ts` |
| `strategies/jwt.strategy.ts` | Replaced by `strategies/jws.strategy.ts` |

### Examples (`examples/vert`)

| File | Changes |
|------|---------|
| `src/application.ts` | Updated to use discriminated union options, JWKS issuer mode, manual strategy registration |
| `src/services/authentication.service.ts` | Updated imports for `JWSTokenService` → uses new binding key patterns |
| `src/controllers/authorization-example/controller.ts` | Updated strategy name references |
| `src/controllers/test/controller.ts` | Updated strategy name references |

## Migration Guide

> [!NOTE]
> Follow these steps if you're upgrading from a version using `JWTTokenService`.

### Step 1: Update JWT options binding

Wrap your existing options in the discriminated union:

```typescript
// Before
import { IJWTTokenServiceOptions, AuthenticateBindingKeys } from '@venizia/ignis';

this.bind<IJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS }).toValue({
  jwtSecret: env.get('JWT_SECRET'),
  applicationSecret: env.get('APP_SECRET'),
  getTokenExpiresFn: () => 86_400,
});

// After
import { TJWTTokenServiceOptions, JOSEStandards, AuthenticateBindingKeys } from '@venizia/ignis';

this.bind<TJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS }).toValue({
  standard: JOSEStandards.JWS,
  options: {
    jwtSecret: env.get('JWT_SECRET'),
    applicationSecret: env.get('APP_SECRET'),  // Optional now
    getTokenExpiresFn: () => 86_400,
  },
});
```

### Step 2: Update service references

```typescript
// Before
import { JWTTokenService } from '@venizia/ignis';

// After
import { JWSTokenService } from '@venizia/ignis';
```

### Step 3: Add manual strategy registration

```typescript
import {
  AuthenticateComponent,
  AuthenticationStrategyRegistry,
  JWSAuthenticationStrategy,
} from '@venizia/ignis';

// Register component first
this.component(AuthenticateComponent);

// Then register strategies manually
AuthenticationStrategyRegistry.getInstance().register({
  container: this,
  strategies: [
    { strategy: JWSAuthenticationStrategy, name: 'jwt' },
  ],
});
```

### Step 4: Update removed constant references

```typescript
// Before
const secret = Authentication.ACCESS_TOKEN_SECRET;
const expires = Authentication.ACCESS_TOKEN_EXPIRES_IN;

// After - use environment variables directly
const secret = env.get('JWT_SECRET');
const expires = Number(env.get('JWT_EXPIRES_IN') || 86_400);
```

### Step 5 (Optional): Remove applicationSecret

If you don't need AES payload encryption, you can remove `applicationSecret`:

```typescript
options: {
  jwtSecret: env.get('JWT_SECRET'),
  getTokenExpiresFn: () => 86_400,
  // applicationSecret removed - payloads are plaintext (but still signed)
}
```
