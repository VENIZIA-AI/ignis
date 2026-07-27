---
title: Authentication Reference
description: Full option tables, binding keys, service class hierarchy, strategy registry, and controller factory for the Authentication component
difficulty: intermediate
---

# Authentication Reference

Every option, binding key, class, and method the Authentication component exposes. See the [Overview](./) for the guided introduction.

**Files:**

- [`packages/core/src/components/auth/authenticate/`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/auth/authenticate) - component, services, strategies, controllers
- [`packages/core/src/components/auth/models/`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/auth/models) - entity column helpers + request schemas
- [`packages/core/src/components/auth/base/abstract-auth-registry.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/auth/base/abstract-auth-registry.ts) - `AbstractAuthRegistry`

## Find what you need

| You want to | Go to |
|---|---|
| See how the pieces fit together | [Architecture](#architecture) |
| Look up a binding key or option field | [Binding keys](#binding-keys), [Option interfaces](#option-interfaces) |
| Check what `IAuthUser` / `IAuthService` require | [IAuthUser / IJWTTokenPayload](#iauthuser-ijwttokenpayload), [IAuthService](#iauthservice) |
| Understand the JWS/JWKS/Basic class hierarchy | [Service class hierarchy](#service-class-hierarchy) |
| Register or resolve a strategy programmatically | [Strategy registry](#strategy-registry) |
| See exactly what the built-in `/auth` controller builds | [Controller factory](#controller-factory) |
| Find a file on disk | [File structure](#file-structure) |

## Import paths

```typescript
import {
  // Component + registry
  AuthenticateComponent,
  AuthenticateBindingKeys,
  Authentication,
  AuthenticationFieldCodecs,
  AuthenticationModes,
  AuthenticationTokenTypes,
  AuthenticationStrategyRegistry,

  // JOSE standards + constants
  JOSEStandards,
  JWKSModes,
  JWKSKeyDrivers,
  JWKSKeyFormats,

  // Strategies
  JWSAuthenticationStrategy,
  JWKSIssuerAuthenticationStrategy,
  JWKSVerifierAuthenticationStrategy,
  BasicAuthenticationStrategy,

  // Services
  AbstractBearerTokenService,
  JWSTokenService,
  JWKSIssuerTokenService,
  JWKSVerifierTokenService,
  BasicTokenService,

  // Controllers
  defineAuthController,
  JWKSController,
  authenticate,

  // Entity column helpers
  extraUserColumns,
  extraRoleColumns,
  extraPermissionColumns,
  extraPolicyDefinitionColumns,
  UserStatuses,
  UserTypes,
  RoleStatuses,
} from '@venizia/ignis';

import type {
  TAuthenticationRestOptions,
  TJWTTokenServiceOptions,
  IJWSTokenServiceOptions,
  IJWKSIssuerOptions,
  IJWKSVerifierOptions,
  TJWKSTokenServiceOptions,
  TBasicTokenServiceOptions,
  IAuthenticateOptions,
  IAuthUser,
  IJWTTokenPayload,
  IPayloadFieldCodec,
  IAuthService,
  IAuthenticationStrategy,
  TDefineAuthControllerOpts,
  TAuthStrategy,
  TAuthMode,
  TGetTokenExpiresFn,
  TJWKSAlgorithm,
  TJWKSKeyDriver,
  TJWKSKeyFormat,
  TJOSEStandard,
  TJWKSMode,
  TPermissionOptions,
  TPermissionCommonColumns,
  TPolicyDefinitionOptions,
  TPolicyDefinitionCommonColumns,
} from '@venizia/ignis';
```

## Architecture

```
Application.preConfigure()
  ├── bind JWT_OPTIONS (TJWTTokenServiceOptions, discriminated on `standard`)
  ├── bind BASIC_OPTIONS / REST_OPTIONS
  ├── this.component(AuthenticateComponent)
  └── AuthenticationStrategyRegistry.register() -- manual, after the component

AuthenticateComponent.binding()
  ├── switch on jwtOptions.standard
  │     ├── JWS  -> defineJWSAuth()  -> registers JWSTokenService
  │     └── JWKS -> defineJWKSAuth() -> switch on mode
  │                   ├── issuer   -> JWKSIssuerTokenService + JWKSController (/certs)
  │                   └── verifier -> JWKSVerifierTokenService
  ├── defineBasicAuth() -> registers BasicTokenService (if basicOptions bound)
  ├── defineControllers() -> registers AuthController (if useAuthController: true)
  └── defineOAuth2() -> stub, not implemented

Bearer token service hierarchy:
  AbstractBearerTokenService (extractCredentials, verify, generate, encryptPayload/decryptPayload)
    ├── JWSTokenService (symmetric HS256)
    └── AbstractJWKSTokenService (lazy ensureInitialized() + retry-on-failure)
          ├── JWKSIssuerTokenService (sign + verify + getJWKS/getJWKSAsync)
          └── JWKSVerifierTokenService (verify only, via createRemoteJWKSet())
```

**Tech stack**

| Technology | Purpose |
|------------|---------|
| `jose` | JWT signing (`SignJWT`), verification (`jwtVerify`), JWKS (`createRemoteJWKSet`, `exportJWK`, `importPKCS8`, `importSPKI`, `importJWK`) |
| `@venizia/ignis-helpers` | `AES` payload encryption, `BaseHelper`/`BaseService`, `getError`, `HTTP` result codes |
| Hono middleware | Route-level integration via `createMiddleware` from `hono/factory` |
| `node:fs/promises` | Async key file reads for JWKS |

## Component methods

`AuthenticateComponent.binding()` runs four private configuration methods and one public stub:

| Method | Purpose |
|--------|---------|
| `defineJWSAuth(opts)` | Validates `jwtSecret` and `getTokenExpiresFn`, binds `IJWSTokenServiceOptions` to `JWT_OPTIONS`, registers `JWSTokenService` |
| `defineJWKSAuth(opts)` | Switches on `mode`.<br>**Issuer:** validates keys/format/kid/getTokenExpiresFn, binds to `JWKS_OPTIONS`, registers `JWKSIssuerTokenService` + `JWKSController`.<br>**Verifier:** validates `jwksUrl`, binds to `JWKS_OPTIONS`, registers `JWKSVerifierTokenService` |
| `defineBasicAuth(opts)` | Validates `verifyCredentials` presence, registers `BasicTokenService`. Skips (debug log) if `basicOptions` not bound |
| `defineControllers(opts)` | Requires `jwtOptions` when `useAuthController: true`. Calls `defineAuthController()` and registers the generated controller |
| `defineOAuth2()` | Public stub, called during `binding()`, performs no action - not yet implemented |

> [!NOTE]
> The component reads the discriminated union from `JWT_OPTIONS`. It then re-binds only the inner options object - `IJWSTokenServiceOptions`, or `IJWKSIssuerOptions`/`IJWKSVerifierOptions` - to `JWKS_OPTIONS` or back to `JWT_OPTIONS`. The token service resolves it with a plain `@inject`.

## Binding keys

| Constant | Key string | Type | Required | Default |
|----------|-----------|------|----------|---------|
| `AuthenticateBindingKeys.REST_OPTIONS` | `@app/authenticate/rest-options` | `TAuthenticationRestOptions` | No | <code v-pre>{ useAuthController: false }</code> |
| `AuthenticateBindingKeys.JWT_OPTIONS` | `@app/authenticate/jwt-options` | `TJWTTokenServiceOptions` | Conditional | -- |
| `AuthenticateBindingKeys.JWKS_OPTIONS` | `@app/authenticate/jwks-options` | `IJWKSIssuerOptions \| IJWKSVerifierOptions` | Internal | Bound by the component from `JWT_OPTIONS` |
| `AuthenticateBindingKeys.BASIC_OPTIONS` | `@app/authenticate/basic-options` | `TBasicTokenServiceOptions` | Conditional | -- |

> [!IMPORTANT]
> At least one of `JWT_OPTIONS` or `BASIC_OPTIONS` must be bound, or `AuthenticateComponent.binding()` throws.

## Option interfaces

### TJWTTokenServiceOptions

Discriminated union on `standard`:

```typescript
type TJWTTokenServiceOptions =
  | { standard: typeof JOSEStandards.JWS; options: IJWSTokenServiceOptions }
  | { standard: typeof JOSEStandards.JWKS; options: TJWKSTokenServiceOptions };

type TJWKSTokenServiceOptions = IJWKSIssuerOptions | IJWKSVerifierOptions; // discriminated on `mode`
```

### IJWSTokenServiceOptions

| Option | Type | Default | Required | Description |
|--------|------|---------|----------|-------------|
| `jwtSecret` | `string` | -- | Yes | Secret for signing and verifying the JWT signature |
| `getTokenExpiresFn` | `TGetTokenExpiresFn` | -- | Yes | Returns token expiration in seconds |
| `applicationSecret` | `string` | -- | No | Enables AES payload field encryption when set |
| `aesAlgorithm` | `AESAlgorithmType` | `'aes-256-cbc'` | No | AES algorithm for payload encryption |
| `headerAlgorithm` | `string` | `'HS256'` | No | JWT signing algorithm |
| `fieldCodecs` | `IPayloadFieldCodec[]` | `[]` | No | Custom serialize/deserialize per field name |

> [!WARNING]
> `jwtSecret` is mandatory - the component throws if it's missing or equals the placeholder `'unknown_secret'`. `applicationSecret` is optional. When you omit it, the JWT payload stays standard plaintext. Standard fields (`iss`, `sub`, `aud`, `jti`, `nbf`, `exp`, `iat`) are never encrypted either way.

### IJWKSIssuerOptions

| Option | Type | Default | Required | Description |
|--------|------|---------|----------|-------------|
| `mode` | `typeof JWKSModes.ISSUER` | -- | Yes | Must be `'issuer'` |
| `algorithm` | `TJWKSAlgorithm` | -- | Yes | `'ES256'`, `'RS256'`, or `'EdDSA'` |
| `keys.driver` | `TJWKSKeyDriver` | -- | Yes | `'text'` (inline) or `'file'` (path) |
| `keys.format` | `TJWKSKeyFormat` | -- | Yes | `'pem'` or `'jwk'` |
| `keys.private` | `string` | -- | Yes | Private key content or file path |
| `keys.public` | `string` | -- | Yes | Public key content or file path |
| `kid` | `string` | -- | Yes | Key ID exposed in the JWKS endpoint and JWT header |
| `getTokenExpiresFn` | `TGetTokenExpiresFn` | -- | Yes | Returns token expiration in seconds |
| `rest.path` | `string` | `'/certs'` | No | Path of the generated `JWKSController` |
| `aesAlgorithm` | `AESAlgorithmType` | `'aes-256-cbc'` | No | AES algorithm for payload encryption |
| `applicationSecret` | `string` | -- | No | Enables AES payload field encryption when set |
| `fieldCodecs` | `IPayloadFieldCodec[]` | `[]` | No | Custom serialize/deserialize per field name |

### IJWKSVerifierOptions

| Option | Type | Default | Required | Description |
|--------|------|---------|----------|-------------|
| `mode` | `typeof JWKSModes.VERIFIER` | -- | Yes | Must be `'verifier'` |
| `jwksUrl` | `string` | -- | Yes | URL of the issuer's JWKS endpoint |
| `cacheTtlMs` | `number` | `43_200_000` (12h) | No | `createRemoteJWKSet` `cacheMaxAge` |
| `cooldownMs` | `number` | `30_000` (30s) | No | `createRemoteJWKSet` `cooldownDuration` |
| `aesAlgorithm` | `AESAlgorithmType` | `'aes-256-cbc'` | No | AES algorithm for payload decryption |
| `applicationSecret` | `string` | -- | No | Must match the issuer's secret to decrypt payloads |
| `fieldCodecs` | `IPayloadFieldCodec[]` | `[]` | No | Must match the issuer's codecs to decrypt custom fields |

> [!IMPORTANT]
> `JWKSVerifierTokenService` cannot sign tokens - `getSigner()`, `getSigningKey()`, and `getDefaultTokenExpiresFn()` all throw. Only `verify()` and `extractCredentials()` are functional.

### TBasicTokenServiceOptions

| Option | Type | Description |
|--------|------|-------------|
| `verifyCredentials` | <code v-pre>(opts: { credentials: { username: string; password: string }; context: TContext }) =&gt; Promise&lt;IAuthUser \| null&gt;</code> | Callback that validates Basic credentials and returns the authenticated user, or `null` |

### TAuthenticationRestOptions

Discriminated union on `useAuthController` - when `true`, `controllerOpts` becomes required:

```typescript
type TAuthenticationRestOptions = {} & (
  | { useAuthController?: false | undefined }
  | { useAuthController: true; controllerOpts: TDefineAuthControllerOpts }
);
```

### TDefineAuthControllerOpts

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `restPath` | `string` | `'/auth'` | Base path for the generated controller |
| `serviceKey` | `string` | -- | DI key for the `IAuthService` implementation (required) |
| `requireAuthenticatedSignUp` | `boolean` | `false` | Whether `POST /sign-up` requires a valid JWT |
| `payload.signIn` | `{ request: { schema }, response: { schema } }` | Built-in schemas | Custom Zod schemas for `/sign-in` |
| `payload.signUp` | `{ request: { schema }, response: { schema } }` | Built-in schemas | Custom Zod schemas for `/sign-up` |
| `payload.changePassword` | `{ request: { schema? }, response: { schema } }` | Built-in schemas | Custom Zod schemas for `/change-password` |
| `payload.refreshToken` | `{ response: { schema } }` | `AnyObjectSchema` | Custom response schema for `/token/refresh` |
| `payload.getUserInformation` | `{ response: { schema } }` | `AnyObjectSchema` | Custom response schema for `/me` and the `who-am-i` `userInformation` field |

### Route authenticate config

```typescript
type TRouteAuthenticateConfig =
  | { skip: true }
  | { skip?: false; strategies?: TAuthStrategy[]; mode?: TAuthMode };
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `authenticate.strategies` | `TAuthStrategy[]` | -- | Strategy names to try - for example, `['jwt']` or `['jwt', 'basic']` |
| `authenticate.mode` | `'any' \| 'all'` | `'any'` | `'any'`: first success wins. `'all'`: every strategy must pass |
| `authenticate.skip` | `true` | -- | Skips authentication for this route entirely |

### IAuthUser / IJWTTokenPayload

```typescript
interface IAuthUser {
  userId: IdType;
  [extra: string | symbol]: any;
}

interface IJWTTokenPayload extends JWTPayload, IAuthUser {
  userId: IdType;
  roles: { id: IdType; identifier: string; priority: number }[];
  clientId?: string;
  provider?: string;
  email?: string;
  name?: string;
  [extra: string | symbol]: any;
}
```

> [!TIP]
> `IAuthUser` is intentionally minimal. Your `IAuthService` can return extra fields (roles, email, provider) - they pass through JWT generation and are available on `Authentication.CURRENT_USER` after authentication.

### IAuthService

```typescript
interface IAuthService<
  E extends Env = Env,
  SIRQ extends TSignInRequest = TSignInRequest, SIRS = AnyObject,
  SURQ extends TSignUpRequest = TSignUpRequest, SURS = AnyObject,
  CPRQ extends TChangePasswordRequest = TChangePasswordRequest, CPRS = AnyObject,
  UIRQ = AnyObject, UIRS = AnyObject,
  RTRS = AnyObject,
> {
  signIn(context: TContext<E>, opts: SIRQ): Promise<SIRS>;
  signUp(context: TContext<E>, opts: SURQ): Promise<SURS>;
  changePassword(context: TContext<E>, opts: CPRQ): Promise<CPRS>;
  getUserInformation?(context: TContext<E>, opts: UIRQ): Promise<UIRS>;
  refreshToken?(context: TContext<E>): Promise<RTRS>;
}
```

> [!NOTE]
> `getUserInformation` and `refreshToken` are optional. The generated auth controller returns `501` for `/me`, `/token/refresh`, or `?withUserInformation=true` on `/who-am-i` if the bound service doesn't implement the corresponding method.

### Field codecs

```typescript
interface IPayloadFieldCodec<T = unknown> {
  key: string;
  serialize(opts: { value: T }): string;
  deserialize(opts: { raw: string }): T;
}
```

`AuthenticationFieldCodecs.ROLES_CODEC` is a ready-made codec for the `roles` field (pipe-separated `id|identifier|priority` strings). It is **not applied automatically** - pass it explicitly via `fieldCodecs: [AuthenticationFieldCodecs.ROLES_CODEC]` in the JWS/JWKS options. Without it, `roles` (and every other non-standard field) is serialized with plain `JSON.stringify` before AES encryption.

```typescript
class AuthenticationFieldCodecs {
  static readonly ROLES_CODEC: IPayloadFieldCodec<IJWTTokenPayload['roles']>;
  static build<T>(opts: { key: string; serialize; deserialize }): IPayloadFieldCodec<T>;
}
```

## Context variables

Set on the Hono `Context` during authentication, readable via `context.get()`:

| Constant | Key string | Type | Description |
|----------|-----------|------|-------------|
| `Authentication.CURRENT_USER` | `auth.current.user` | `IAuthUser` | Authenticated user payload |
| `Authentication.AUDIT_USER_ID` | `audit.user.id` | `IdType` | Authenticated user's ID |
| `Authentication.SKIP_AUTHENTICATION` | `authentication.skip` | `boolean` | Set `true` in a preceding middleware to bypass auth |

## Constants

**Authentication**

| Constant | Value | Description |
|----------|-------|-------------|
| `Authentication.STRATEGY_JWT` | `'jwt'` | JWT strategy name |
| `Authentication.STRATEGY_BASIC` | `'basic'` | Basic strategy name |
| `Authentication.TYPE_BEARER` | `'Bearer'` | Bearer token type prefix |
| `Authentication.TYPE_BASIC` | `'Basic'` | Basic token type prefix |
| `Authentication.AUTHENTICATION_STRATEGY` | `'authentication.strategy'` | Binding key prefix for registered strategies |

**AuthenticationTokenTypes**

| Constant | Value |
|----------|-------|
| `TYPE_AUTHORIZATION_CODE` | `'000_AUTHORIZATION_CODE'` |
| `TYPE_ACCESS_TOKEN` | `'100_ACCESS_TOKEN'` |
| `TYPE_REFRESH_TOKEN` | `'200_REFRESH_TOKEN'` |

**JOSE / JWKS constants** - each class also exposes `SCHEME_SET: Set<string>` and `isValid(input): boolean`

| Class | Members |
|-------|---------|
| `JOSEStandards` | `JWS` (`'JWS'`), `JWKS` (`'JWKS'`) |
| `JWKSModes` | `ISSUER` (`'issuer'`), `VERIFIER` (`'verifier'`) |
| `JWKSKeyDrivers` | `TEXT` (`'text'`), `FILE` (`'file'`) |
| `JWKSKeyFormats` | `PEM` (`'pem'`), `JWK` (`'jwk'`) |
| `AuthenticateStrategy` | `BASIC` (`'basic'`), `JWT` (`'jwt'`) - same values as `Authentication.STRATEGY_*` |
| `AuthenticationModes` | `ANY` (`'any'`), `ALL` (`'all'`) |

## Strategy registry

`AuthenticationStrategyRegistry` is a singleton extending `AbstractAuthRegistry<IAuthenticationStrategy>`.

| Method | Signature | Description |
|--------|-----------|--------------|
| `getInstance()` | `static (): AuthenticationStrategyRegistry` | Returns (creating if needed) the singleton |
| `register` | <code v-pre>(opts: { container: Container; strategies: { name: string; strategy: TClass&lt;IAuthenticationStrategy&gt; }[] }) =&gt; this</code> | Binds each strategy into the container as a singleton under `authentication.strategy.<name>`. Returns `this` |
| `resolveStrategy` | `(opts: { name: string }) => IAuthenticationStrategy` | Resolves a registered strategy instance by name |

```typescript
AuthenticationStrategyRegistry.getInstance().register({
  container: this,
  strategies: [
    { name: Authentication.STRATEGY_JWT, strategy: JWKSIssuerAuthenticationStrategy },
    { name: Authentication.STRATEGY_BASIC, strategy: BasicAuthenticationStrategy },
  ],
});
```

**Standalone `authenticate()` function** - the primary export for creating middleware outside the route-config `authenticate` field:

```typescript
const authenticationProvider = new AuthenticationProvider();
const authenticateFn = authenticationProvider.value();

export const authenticate = (opts: { strategies: string[]; mode?: TAuthMode }) => authenticateFn(opts);
```

**`AuthenticationProvider` middleware behavior:**

1. If `Authentication.SKIP_AUTHENTICATION` is set on context, skips entirely (debug log)
2. If `Authentication.CURRENT_USER` is already set, skips (already authenticated)
3. Runs strategies per `mode` (`'any'` or `'all'`)
4. On success, sets `Authentication.CURRENT_USER` and `Authentication.AUDIT_USER_ID`
5. On failure, throws `401`

> [!NOTE]
> `'any'` mode logs each failing strategy at debug and discards the error. It only throws once every strategy is exhausted. `'all'` mode uses the **first** strategy's user payload as the identity source. If that payload has no `userId`, it throws `401` even though every strategy technically passed.

## Service class hierarchy

```
AbstractBearerTokenService<E>          (extends BaseService)
  #aes, #applicationSecret, #fieldCodecs
  +extractCredentials(context)         Extract Bearer token from Authorization header
  +verify(opts)                        Template method -> doVerify()
  +generate(opts)                      Template method -> getSigner() + getSigningKey()
  +encryptPayload(payload) / decryptPayload(opts)
  #doVerify(token)*  +getSigner(opts)*  #getSigningKey()*  #getDefaultTokenExpiresFn()*

  JWSTokenService                       Symmetric HS256, shared secret
    used by JWSAuthenticationStrategy

  AbstractJWKSTokenService              Lazy ensureInitialized() + retry-on-failure
    #initialized, #initPromise
    +ensureInitialized()   #initialize()*

    JWKSIssuerTokenService               Sign with private key, verify with public key
      +getJWKS() (sync, throws if uninitialized)  +getJWKSAsync()
      used by JWKSIssuerAuthenticationStrategy

    JWKSVerifierTokenService             Verify only, via remote JWKS
      used by JWKSVerifierAuthenticationStrategy
```

### AbstractBearerTokenService

**File:** [`packages/core/src/components/auth/authenticate/services/bearer/abstract.service.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/auth/authenticate/services/bearer/abstract.service.ts)

| Method | Signature | Description |
|--------|-----------|-------------|
| `configurePayloadEncryption` | <code v-pre>(opts: { aesAlgorithm?; applicationSecret?; fieldCodecs?: IPayloadFieldCodec[] }) =&gt; void</code> | Sets up AES + field codecs. AES only activates if `applicationSecret` is provided |
| `extractCredentials` | `(context) => { type: string; token: string }` | Parses `Authorization: Bearer <token>` |
| `verify` | `(opts: { type, token }) => Promise<IJWTTokenPayload>` | Calls `doVerify()`, wraps errors as sanitized `401` |
| `generate` | `(opts: { payload, getTokenExpiresFn? }) => Promise<string>` | Calls `getSigner()` then signs with `getSigningKey()` |
| `serializeField` / `deserializeField` | `(opts) => string` / `any` | Per-field codec lookup, `JSON.stringify`/`JSON.parse` fallback |
| `encryptPayload` | `(payload) => Record<string, any>` | AES-encrypts non-standard fields (keys and values). No-op if AES not configured |
| `decryptPayload` | `(opts: { result }) => IJWTTokenPayload` | Reverses `encryptPayload`. No-op if AES not configured |

Static: `JWT_COMMON_FIELDS: Set<'iss'|'sub'|'aud'|'jti'|'nbf'|'exp'|'iat'>` - never encrypted or touched by field codecs.

### JWSTokenService

**File:** [`packages/core/src/components/auth/authenticate/services/bearer/jws.service.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/auth/authenticate/services/bearer/jws.service.ts)

The constructor validates `jwtSecret` and `getTokenExpiresFn`, throwing `500` if either is missing. It encodes the secret to `Uint8Array` and calls `configurePayloadEncryption()`. `doVerify` calls `jose.jwtVerify()` with the shared secret. `getSigner` signs with header `HS256`, or `headerAlgorithm` if you set one.

### AbstractJWKSTokenService

**File:** [`packages/core/src/components/auth/authenticate/services/bearer/jwks/abstract.service.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/auth/authenticate/services/bearer/jwks/abstract.service.ts)

`ensureInitialized()` lazily runs `initialize()` on the first call. Concurrent callers share the pending promise. If `initialize()` rejects, the promise resets - the next call retries instead of caching the failure.

### JWKSIssuerTokenService

**File:** [`packages/core/src/components/auth/authenticate/services/bearer/jwks/issuer.service.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/auth/authenticate/services/bearer/jwks/issuer.service.ts)

`initialize()` runs in order:

1. Reads the key content - `readFile` for `keys.driver: 'file'`, inline text for `'text'`.
2. Imports it - `importPKCS8`/`importSPKI` for PEM, `importJWK` for JWK.
3. Exports the public JWK with `kid`, `alg`, and `use: 'sig'` set.
4. Caches the result as `{ keys: [publicJWK] }`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `getJWKS` | `() => { keys: JWK[] }` | Synchronous, returns the cached JWKS. Throws if called before `initialize()` completes |
| `getJWKSAsync` | `() => Promise<{ keys: JWK[] }>` | Calls `ensureInitialized()` first |

### JWKSVerifierTokenService

**File:** [`packages/core/src/components/auth/authenticate/services/bearer/jwks/verifier.service.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/auth/authenticate/services/bearer/jwks/verifier.service.ts)

`initialize()` calls `createRemoteJWKSet(jwksUrl, { cacheMaxAge: cacheTtlMs ?? 43_200_000, cooldownDuration: cooldownMs ?? 30_000 })`. `getSigner`/`getSigningKey`/`getDefaultTokenExpiresFn` all throw - this service is verify-only.

### BasicTokenService

**File:** [`packages/core/src/components/auth/authenticate/services/basic/service.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/auth/authenticate/services/basic/service.ts)

| Method | Signature | Description |
|--------|-----------|-------------|
| `extractCredentials` | `(context) => { username: string; password: string }` | Decodes `Authorization: Basic <base64>` |
| `verify` | `(opts: { credentials, context }) => Promise<IAuthUser>` | Calls the user-provided `verifyCredentials` |

Constructor throws `500` if `verifyCredentials` is missing from the injected options.

## Strategy classes

All four strategies extend `BaseHelper` and implement `IAuthenticationStrategy<E>`. Each one carries:

- A `name` field.
- A `standard` field (Bearer strategies only).
- One injected token service.
- An `authenticate(context)` method that calls `extractCredentials()`, then `verify()`.

| Strategy | `name` | Injects | File |
|----------|--------|---------|------|
| `JWSAuthenticationStrategy` | `Authentication.STRATEGY_JWT` | `JWSTokenService` | [`strategies/jws.strategy.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/auth/authenticate/strategies/jws.strategy.ts) |
| `JWKSIssuerAuthenticationStrategy` | `Authentication.STRATEGY_JWT` | `JWKSIssuerTokenService` | [`strategies/jwks.strategy.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/auth/authenticate/strategies/jwks.strategy.ts) |
| `JWKSVerifierAuthenticationStrategy` | `Authentication.STRATEGY_JWT` | `JWKSVerifierTokenService` | same file |
| `BasicAuthenticationStrategy` | `Authentication.STRATEGY_BASIC` | `BasicTokenService` | [`strategies/basic.strategy.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/auth/authenticate/strategies/basic.strategy.ts) |

> [!NOTE]
> Choose the strategy class that matches your JOSE standard. `JWKSIssuerAuthenticationStrategy` and `JWKSVerifierAuthenticationStrategy` both register under the same `'jwt'` name - use only one of the two per service.

## JWKSController

Serves the JWKS endpoint (default path `/certs`, configurable via `rest.path`). Intentionally unauthenticated - it serves the public keys external verifiers need.

**File:** [`packages/core/src/components/auth/authenticate/controllers/jwks/controller.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/auth/authenticate/controllers/jwks/controller.ts)

```typescript
class JWKSController extends BaseRestController {
  constructor(@inject(...) private jwksService: JWKSIssuerTokenService) {
    super({ scope: JWKSController.name, path: '/certs', isStrict: true });
  }

  override binding() {
    this.defineRoute({
      configs: RouteConfigs.GET_JWKS_CERTS, // GET '/'
      handler: async context => {
        const jwks = await this.jwksService.getJWKSAsync();
        context.header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
        return context.json(jwks, HTTP.ResultCodes.RS_2.Ok);
      },
    });
  }
}
```

The component applies `@controller({ path })` to `JWKSController` dynamically at binding time (via `Reflect.decorate`), since the path depends on a runtime option.

## Controller factory

`defineAuthController(opts: TDefineAuthControllerOpts): typeof AuthController` builds a `BaseRestController` subclass at runtime.

**File:** [`packages/core/src/components/auth/authenticate/controllers/factory.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/auth/authenticate/controllers/factory.ts)

**How it works:**

1. **Class creation.** `class AuthController extends BaseRestController {}` inside the factory closure, decorated with `@controller({ path: restPath })`, `isStrict: true`.
2. **Service injection.** `inject({ key: serviceKey })(AuthController, undefined, 0)` is applied *after* class definition - the programmatic equivalent of decorating constructor parameter 0. The constructor throws `400` if the resolved service is falsy.
3. **Routes.** Defined in `binding()` via `this.defineRoute()` - see the endpoint table in [Usage & Examples](./usage#api-endpoints).
4. **Schemas.** Each endpoint uses `payload.<name>.{request,response}.schema` if you provide it. Otherwise it falls back to a built-in default, or `AnyObjectSchema` where there's no built-in schema for that response.

Also exports `JWTTokenPayloadSchema`, the Zod schema backing `/who-am-i`'s response. It's extended at runtime with an optional `userInformation` field, typed from `payload.getUserInformation.response.schema` (or `AnyObjectSchema` if you don't provide one).

## Entity column helper types

Exported for extending the auth entity column helpers - see [Usage & Examples](./usage#entity-column-helpers) for the columns themselves.

```typescript
type TPermissionOptions = { idType?: 'string' | 'number' };
type TPermissionCommonColumns = {
  code: NotNull<PgTextBuilderInitial<...>>;
  name: NotNull<PgTextBuilderInitial<...>>;
  subject: NotNull<PgTextBuilderInitial<...>>;
  method: NotNull<PgTextBuilderInitial<...>>;
  action: NotNull<PgTextBuilderInitial<...>>;
  scope: NotNull<PgTextBuilderInitial<...>>;
  description: PgTextBuilderInitial<...>;
};

type TPolicyDefinitionOptions = { idType?: 'string' | 'number' };
type TPolicyDefinitionCommonColumns = {
  variant: ReturnType<typeof text>;
  subjectType: ReturnType<typeof text>;
  targetType: ReturnType<typeof text>;
  action: ReturnType<typeof text>;
  effect: ReturnType<typeof text>;
  domain: ReturnType<typeof text>;
  metadata: ReturnType<typeof jsonb>;
};
```

## File structure

```
packages/core/src/components/auth/
├── authenticate/
│   ├── common/
│   │   ├── codecs.ts             # AuthenticationFieldCodecs (ROLES_CODEC, build() factory)
│   │   ├── constants.ts          # AuthenticateStrategy, JOSEStandards, JWKSModes, JWKSKeyDrivers, JWKSKeyFormats, Authentication, AuthenticationTokenTypes, AuthenticationModes
│   │   ├── keys.ts               # AuthenticateBindingKeys
│   │   ├── types.ts              # Option interfaces, discriminated unions, IAuthUser, IJWTTokenPayload, IAuthService
│   │   └── index.ts
│   ├── controllers/
│   │   ├── factory.ts            # defineAuthController() + JWTTokenPayloadSchema
│   │   └── jwks/                 # JWKSController + route config
│   ├── middlewares/
│   │   └── authenticate.middleware.ts   # Standalone authenticate() function
│   ├── providers/
│   │   └── authentication.provider.ts   # AuthenticationProvider
│   ├── services/
│   │   ├── basic/service.ts             # BasicTokenService
│   │   └── bearer/
│   │       ├── abstract.service.ts      # AbstractBearerTokenService
│   │       ├── jws.service.ts           # JWSTokenService
│   │       └── jwks/                    # AbstractJWKSTokenService, JWKSIssuerTokenService, JWKSVerifierTokenService
│   ├── strategies/                      # JWSAuthenticationStrategy, JWKS*, BasicAuthenticationStrategy, AuthenticationStrategyRegistry
│   └── component.ts                     # AuthenticateComponent
├── base/
│   └── abstract-auth-registry.ts        # AbstractAuthRegistry (shared by authenticate + authorize)
└── models/
    ├── entities/                        # extraUserColumns, extraRoleColumns, extraPermissionColumns, extraPolicyDefinitionColumns
    └── requests/                        # SignInRequestSchema, SignUpRequestSchema, ChangePasswordRequestSchema
```

## See also

- [Overview](./) - guided introduction and common tasks
- [Usage & Examples](./usage) - securing routes, auth flows, JWKS microservice patterns, API endpoints
- [Error Reference](./errors) - every error message and how to fix it
