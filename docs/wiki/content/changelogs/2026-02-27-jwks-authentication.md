---
title: JWKS Authentication & Service Hierarchy Refactor
description: Authentication now supports asymmetric JWKS tokens for microservices, AES payload encryption is optional, token errors no longer leak internals, and JWT setup needs a few migration changes.
packages: ['@venizia/ignis']
---

# Changelog - 2026-02-27

## JWKS Authentication & Service Hierarchy Refactor

**In one line.** One service can now sign tokens with a private key and publish the public keys at `/certs`, while other services verify them without sharing a secret.

## What changed

- **JWKS issuer mode.** `JWKSIssuerTokenService` signs with RSA or EC keys (PEM or JWK, from a file with `JWKSKeyDrivers.FILE` or inline with `JWKSKeyDrivers.TEXT`) and serves a `/certs` endpoint with `Cache-Control` headers. The path is configurable through `rest.path`.
- **JWKS verifier mode.** `JWKSVerifierTokenService` verifies tokens against a remote `jwksUrl`, with `cacheTtlMs` (default 12h) and `cooldownMs` (default 30s). It is verify-only, so `generate()` throws.
- **Lazy keys.** Both JWKS services load their keys on first use and retry if loading failed.
- **Optional AES encryption.** `applicationSecret` is now optional for all bearer services. Without it, payloads are plain (signed, not encrypted). With it, `aesAlgorithm` defaults to `'aes-256-cbc'`.
- **New strategies and key.** `JWKSIssuerAuthenticationStrategy`, `JWKSVerifierAuthenticationStrategy` and `AuthenticateBindingKeys.JWKS_OPTIONS`, which the component binds during `defineJWKSAuth()`.
- **New constants.** `JOSEStandards` (`JWS`, `JWKS`), `JWKSModes` (`ISSUER`, `VERIFIER`), `JWKSKeyDrivers` (`FILE`, `TEXT`), `JWKSKeyFormats` (`PEM`, `JWK`).

## Security fixes

- **Sanitized token errors.** `verify()` and `generate()` used to put `error.message` in the response, which could leak key paths, algorithm names and library internals. They now return generic messages such as `'[verify] Invalid or expired token'`. Full errors are still logged at `error` level.

## Who is affected

- **Apps using `JWTTokenService` or `IJWTTokenServiceOptions`.** Follow the migration below.
- **Apps relying on automatic strategy registration or the removed `Authentication` constants.** Same.
- **Microservice setups.** Can adopt JWKS; no action needed otherwise.

## Breaking changes

> [!WARNING]
> JWT options, service names, removed constants and strategy registration all change.

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
  standard: JOSEStandards.JWS,   // discriminant
  options: {
    jwtSecret: env.get('JWT_SECRET'),
    applicationSecret: env.get('APP_SECRET'),  // optional now
    getTokenExpiresFn: () => 86_400,
  },
});
```

| Before | After |
|--------|-------|
| `JWTTokenService` | `JWSTokenService` |
| `IJWTTokenServiceOptions` | `IJWSTokenServiceOptions` (inner type) |
| `defineJWTAuth` (component method) | `defineJWSAuth` |
| `Authentication.ACCESS_TOKEN_SECRET`, `Authentication.REFRESH_TOKEN_SECRET` | Use env vars directly |
| `Authentication.ACCESS_TOKEN_EXPIRES_IN`, `Authentication.REFRESH_TOKEN_EXPIRES_IN` | Use `getTokenExpiresFn` |

Strategies are no longer auto-registered by `AuthenticateComponent`.

## Migration

1. Wrap your JWT options in `{ standard: JOSEStandards.JWS, options: { ... } }` as above.
2. Rename `JWTTokenService` to `JWSTokenService` in your imports.
3. Register strategies yourself, after the component:

```typescript
this.component(AuthenticateComponent);

AuthenticationStrategyRegistry.getInstance().register({
  container: this,
  strategies: [
    { strategy: JWSAuthenticationStrategy, name: 'jwt' },
  ],
});
```

4. Replace removed constants with env vars and `getTokenExpiresFn`:

```typescript
const secret = env.get('JWT_SECRET');
const expires = Number(env.get('JWT_EXPIRES_IN') || 86_400);
```

5. Optional: remove `applicationSecret` if you do not need AES payload encryption.

## Details

Issuer service:

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

Verifier service:

```typescript
this.bind<TJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS }).toValue({
  standard: JOSEStandards.JWKS,
  options: {
    mode: JWKSModes.VERIFIER,
    jwksUrl: 'https://auth-service.internal/certs',
    cacheTtlMs: 43_200_000,
    cooldownMs: 30_000,
  },
});
```

Register the matching strategy:

```typescript
AuthenticationStrategyRegistry.getInstance().register({
  container: this,
  strategies: [
    { strategy: JWKSIssuerAuthenticationStrategy, name: 'jwks' },   // issuer service
    { strategy: JWKSVerifierAuthenticationStrategy, name: 'jwks' }, // verifier services
  ],
});
```
