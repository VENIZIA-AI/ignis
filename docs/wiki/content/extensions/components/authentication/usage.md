---
title: Authentication Usage
description: Securing routes, implementing IAuthService, JWKS microservice patterns, and the built-in auth controller endpoints
difficulty: intermediate
---

# Authentication Usage

Task-oriented examples for the Authentication component. See the [Overview](./) for initial setup and the [API Reference](./api) for every option and class.

## Find what you need

| You want to | Go to |
|---|---|
| Require auth on a route, or make one public | [Securing routes](#securing-routes) |
| Implement sign-in, sign-up, or change-password | [Implementing IAuthService](#implementing-iauthservice) |
| Split issuer and verifier across services | [JWKS microservice patterns](#jwks-microservice-patterns) |
| See what happens on each request, step by step | [Auth flows](#auth-flows) |
| Accept both JWT and Basic on one route | [Multi-strategy authentication](#multi-strategy-authentication) |
| Encrypt JWT payload fields | [Token encryption (optional AES)](#token-encryption-optional-aes) |
| Read `CURRENT_USER` in a handler, with types | [Hono context extension](#hono-context-extension) |
| Call the built-in `/auth` endpoints | [API endpoints](#api-endpoints) |
| Add auth columns to a Drizzle table | [Entity column helpers](#entity-column-helpers) |

## Securing routes

**Require one strategy.** Add `authenticate` to the route config.

```typescript
const SECURE_ROUTE_CONFIG = {
  path: '/secure-data',
  method: HTTP.Methods.GET,
  authenticate: { strategies: [Authentication.STRATEGY_JWT] },
  responses: jsonResponse({ description: 'Protected data', schema: z.object({ message: z.string() }) }),
} as const;
```

**Accept multiple strategies with fallback.** `mode: 'any'` (default) tries each strategy in order. The first success wins.

```typescript
const FALLBACK_AUTH_CONFIG = {
  path: '/api/data',
  method: HTTP.Methods.GET,
  authenticate: { strategies: [Authentication.STRATEGY_JWT, Authentication.STRATEGY_BASIC], mode: AuthenticationModes.ANY },
  responses: jsonResponse({ description: 'Data via JWT or Basic', schema: z.object({ data: z.any() }) }),
} as const;
```

**Make a route public.** `skip: true` bypasses authentication entirely.

```typescript
const PUBLIC_ROUTE_CONFIG = {
  path: '/public',
  method: HTTP.Methods.GET,
  authenticate: { skip: true },
  responses: jsonResponse({ description: 'Public endpoint', schema: z.object({ message: z.string() }) }),
} as const;
```

**Use `authenticate()` as raw Hono middleware.** Use this outside route configs - for a plain Hono sub-app, for example.

```typescript
import { authenticate, Authentication, AuthenticationModes } from '@venizia/ignis';

const authMiddleware = authenticate({ strategies: [Authentication.STRATEGY_JWT], mode: AuthenticationModes.ANY });

app.get('/protected', authMiddleware, c => {
  const user = c.get(Authentication.CURRENT_USER);
  return c.json({ userId: user.userId });
});
```

**Read the authenticated user in a handler.**

```typescript
import { Authentication, IJWTTokenPayload } from '@venizia/ignis';

const user = c.get(Authentication.CURRENT_USER) as IJWTTokenPayload | undefined;
if (user) {
  console.log('User ID:', user.userId, 'Roles:', user.roles);
}
```

**Skip authentication dynamically from a preceding middleware.** Useful for internal API keys or webhooks.

```typescript
import { Authentication } from '@venizia/ignis';
import { createMiddleware } from 'hono/factory';

const conditionalAuthMiddleware = createMiddleware(async (c, next) => {
  if (c.req.header('X-API-Key') === 'valid-api-key') {
    c.set(Authentication.SKIP_AUTHENTICATION, true);
  }
  return next();
});
```

## Implementing IAuthService

The built-in auth controller (`useAuthController: true`) delegates every route to a service you provide. That service implements `IAuthService`.

**JWS-backed service.**

```typescript
import {
  BaseService, inject, IAuthService, IJWTTokenPayload, JWSTokenService,
  BindingKeys, BindingNamespaces, TSignInRequest, TContext,
} from '@venizia/ignis';
import { getError } from '@venizia/ignis-helpers';
import { Env } from 'hono';

export class AuthenticationService extends BaseService implements IAuthService {
  constructor(
    @inject({ key: BindingKeys.build({ namespace: BindingNamespaces.SERVICE, key: JWSTokenService.name }) })
    private _tokenService: JWSTokenService,
  ) {
    super({ scope: AuthenticationService.name });
  }

  async signIn(context: TContext<Env>, opts: TSignInRequest): Promise<{ token: string }> {
    const { identifier, credential } = opts;
    const user = await this.userRepo.findByIdentifier(identifier);

    if (!user || !await this.verifyCredential(credential, user)) {
      throw getError({ message: 'Invalid credentials' });
    }

    const payload: IJWTTokenPayload = { userId: user.id, roles: user.roles };
    const token = await this._tokenService.generate({ payload });
    return { token };
  }

  async signUp(context: TContext<Env>, opts: any): Promise<any> { /* your logic */ }
  async changePassword(context: TContext<Env>, opts: any): Promise<any> { /* your logic */ }
}
```

**JWKS-backed service.** Same shape, inject `JWKSIssuerTokenService` instead.

```typescript
constructor(
  @inject({ key: BindingKeys.build({ namespace: BindingNamespaces.SERVICE, key: JWKSIssuerTokenService.name }) })
  private _tokenService: JWKSIssuerTokenService,
) { super({ scope: AuthenticationService.name }); }
```

**Implement `refreshToken` (optional).** It re-issues a token from the caller's currently valid one. IGNIS has no separate refresh token.

```typescript
async refreshToken(context: TContext<Env>): Promise<{ token: string }> {
  const currentUser = context.get(Authentication.CURRENT_USER);
  const token = await this._tokenService.generate({ payload: currentUser });
  return { token };
}
```

> [!NOTE]
> IGNIS does not enforce rotation or revocation policy. If you need to invalidate old tokens after refresh, implement that inside your `refreshToken`.

**Implement `getUserInformation` (optional).** Backs both `GET /me` and `GET /who-am-i?withUserInformation=true`.

```typescript
async getUserInformation(context: TContext<Env>, _opts: AnyObject): Promise<AnyObject> {
  const currentUser = context.get(Authentication.CURRENT_USER);
  return this.userRepository.findById({ id: currentUser.userId });
}
```

## JWKS microservice patterns

**Issuer + verifier split.** One service signs, others only verify - no shared secret to distribute.

```mermaid
flowchart LR
    CLIENT["Client App"]
    subgraph AUTH["Auth Service (JWKS Issuer)"]
        SIGNIN["POST /auth/sign-in"]
        CERTS["GET /certs"]
    end
    subgraph API["API Service (JWKS Verifier)"]
        DATA["GET /api/data"]
    end
    CLIENT -->|"1. Sign in"| SIGNIN
    SIGNIN -->|"2. JWT token"| CLIENT
    CLIENT -->|"3. Request + Bearer token"| DATA
    DATA -->|"4. Fetch JWKS"| CERTS
    CERTS -->|"5. Public keys"| DATA
    DATA -->|"6. Verified response"| CLIENT
```

```typescript
// Auth service (issuer)
this.bind<TJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS }).toValue({
  standard: JOSEStandards.JWKS,
  options: {
    mode: JWKSModes.ISSUER, algorithm: 'ES256',
    keys: { driver: JWKSKeyDrivers.FILE, format: JWKSKeyFormats.PEM, private: './keys/private.pem', public: './keys/public.pem' },
    kid: 'auth-key-1', getTokenExpiresFn: () => 86400,
  },
});

// API service (verifier)
this.bind<TJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS }).toValue({
  standard: JOSEStandards.JWKS,
  options: { mode: JWKSModes.VERIFIER, jwksUrl: 'https://auth-service.internal/certs', cacheTtlMs: 43_200_000, cooldownMs: 30_000 },
});
```

**Generate ES256 or RS256 keys.**

```bash
# ES256
openssl ecparam -genkey -name prime256v1 -noout -out private.pem
openssl ec -in private.pem -pubout -out public.pem

# RS256
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
```

> [!WARNING]
> Never commit private keys to version control.

**Use inline keys instead of files.** For serverless or restricted-filesystem environments, switch `driver` to `text`.

```typescript
keys: {
  driver: JWKSKeyDrivers.TEXT,
  format: JWKSKeyFormats.PEM,
  private: process.env.JWKS_PRIVATE_KEY!, // PEM string from env
  public: process.env.JWKS_PUBLIC_KEY!,
}
```

**Share AES payload encryption across issuer and verifier.** Both sides need the identical `applicationSecret` - the verifier decrypts what the issuer encrypted.

```typescript
// Issuer
{ mode: JWKSModes.ISSUER, /* ... */ applicationSecret: process.env.APP_ENV_APPLICATION_SECRET }

// Verifier - must match
{ mode: JWKSModes.VERIFIER, jwksUrl: '...', applicationSecret: process.env.APP_ENV_APPLICATION_SECRET }
```

## Auth flows

- **JWS:** extract Bearer token -> `jose.jwtVerify()` with the shared secret -> decrypt payload (if AES configured) -> set `CURRENT_USER`.
- **JWKS Issuer:** extract Bearer token -> `ensureInitialized()` (lazy-loads keys once) -> `jwtVerify()` with the public key -> decrypt payload -> set `CURRENT_USER`.
- **JWKS Verifier:** extract Bearer token -> `ensureInitialized()` (creates the remote JWKS verifier once) -> `jwtVerify()` with the remote JWKS -> decrypt payload -> set `CURRENT_USER`.
- **Basic:** decode `Authorization: Basic <base64>` -> call your `verifyCredentials` callback -> on `null`, throw `401`; on a user, set `CURRENT_USER`.

```mermaid
sequenceDiagram
    participant C as Client
    participant MW as Auth Middleware
    participant S as Strategy
    participant SVC as TokenService

    C->>MW: Request + Authorization header
    MW->>S: authenticate(context)
    S->>SVC: extractCredentials(context)
    SVC-->>S: { type, token } | { username, password }
    S->>SVC: verify(...)
    SVC-->>S: IAuthUser
    S-->>MW: IAuthUser
    MW->>MW: Set CURRENT_USER + AUDIT_USER_ID
    MW->>C: Continue to handler
```

## Multi-strategy authentication

| Mode | Behavior | Use case |
|------|----------|----------|
| `'any'` (default) | Tried in order.<br>First success wins.<br>Failures are logged at debug, not returned.<br>All fail -> `401` listing the tried strategies. | Fallback auth (JWT primary, Basic for legacy clients) |
| `'all'` | Every strategy must pass.<br>First failure rejects immediately.<br>The **first** strategy's user payload is the identity source. | Multi-factor authentication |

```mermaid
flowchart TD
    REQ["Request arrives"] --> MODE{"mode?"}
    MODE -->|"any"| S1{"Strategy 1"}
    S1 -->|"Success"| WIN["Set user, continue"]
    S1 -->|"Fail"| S2{"Strategy 2"}
    S2 -->|"Success"| WIN
    S2 -->|"Fail"| FAIL_ANY["401: Tried strategies"]
    MODE -->|"all"| A1{"Strategy 1"}
    A1 -->|"Fail"| FAIL_ALL["Exception propagates"]
    A1 -->|"Pass"| A2{"Strategy 2"}
    A2 -->|"Fail"| FAIL_ALL
    A2 -->|"Pass"| CHECK{"userId?"}
    CHECK -->|"Yes"| WIN2["Set user, continue"]
    CHECK -->|"No"| FAIL_ID["401: Failed to identify user"]
```

## Token encryption (optional AES)

AES payload encryption is off by default. It only activates when you set `applicationSecret` on the JWS/JWKS options.

| Aspect | Behavior |
|---|---|
| Default | Off. Without `applicationSecret`, payloads stay standard plaintext JWT. |
| Standard fields | `iss`, `sub`, `aud`, `jti`, `nbf`, `exp`, `iat` are never encrypted, on either side. |
| Other fields | Both the key and the value are AES-encrypted. `null` and `undefined` values are skipped. |
| Serialization | `JSON.stringify` by default. Opt in to `AuthenticationFieldCodecs.ROLES_CODEC` for `roles` - it serializes as pipe-separated `id\|identifier\|priority` strings instead. |
| Secret | Must stay constant. Changing `applicationSecret` invalidates every existing token. |
| Issuer/verifier match | Both sides need the identical secret, and identical `fieldCodecs` if you use them. |

```typescript
this.bind<TJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS }).toValue({
  standard: JOSEStandards.JWS,
  options: {
    jwtSecret: process.env.APP_ENV_JWT_SECRET!,
    getTokenExpiresFn: () => 86400,
    applicationSecret: process.env.APP_ENV_APPLICATION_SECRET, // enables AES encryption
    fieldCodecs: [AuthenticationFieldCodecs.ROLES_CODEC],       // optional, opt-in
  },
});
```

## Hono context extension

The module augments Hono's `ContextVariableMap` (a plain interface, not generic) so `c.get()` is type-safe:

```typescript
declare module 'hono' {
  interface ContextVariableMap {
    [Authentication.CURRENT_USER]: IAuthUser;
    [Authentication.AUDIT_USER_ID]: IdType;
  }
}
```

| Constant | Key string | Type | Description |
|----------|-----------|------|-------------|
| `Authentication.CURRENT_USER` | `auth.current.user` | `IAuthUser` | Authenticated user payload |
| `Authentication.AUDIT_USER_ID` | `audit.user.id` | `IdType` | Authenticated user's ID |
| `Authentication.SKIP_AUTHENTICATION` | `authentication.skip` | `boolean` | Set `true` to bypass authentication |

## API endpoints

The built-in auth controller exists only when `REST_OPTIONS.useAuthController: true` is set - see [Setup](./#common-tasks).

| Method | Path | Auth required | Description |
|--------|------|---------------|-------------|
| `POST` | `/auth/sign-in` | No | Authenticate, receive a JWT |
| `POST` | `/auth/sign-up` | Configurable (`requireAuthenticatedSignUp`) | Create a user account |
| `POST` | `/auth/change-password` | JWT | Change the authenticated user's password |
| `POST` | `/auth/token/refresh` | JWT | Re-issue a token from the caller's valid JWT |
| `GET` | `/auth/who-am-i` | JWT | Return the JWT payload, optionally merged with `getUserInformation` |
| `GET` | `/auth/me` | JWT | Return `getUserInformation` result directly |
| `GET` | `/certs` | No | JWKS endpoint (Issuer mode only) |

> [!NOTE]
> `/auth` is configurable via `controllerOpts.restPath`. `/certs` is configurable via `rest.path` in `IJWKSIssuerOptions`, and is intentionally unauthenticated.

**`POST /auth/sign-in`** - body defaults to `SignInRequestSchema` (nested `identifier`/`credential`), overridable via `payload.signIn`.

```json
{ "token": "eyJhbGciOiJFUzI1NiIsImtpZCI6Im15LWtleS1pZC0xIn0..." }
```

**`POST /auth/sign-up`** - public unless `requireAuthenticatedSignUp: true`. Body defaults to a flat `SignUpRequestSchema` (`username`, `credential`) - unlike sign-in, the shape isn't nested.

**`POST /auth/change-password`** - always requires JWT. Body defaults to `ChangePasswordRequestSchema` (`scheme`, `oldCredential`, `newCredential`, `userId`).

**`POST /auth/token/refresh`** - always requires JWT, no request body. Returns `501` if `IAuthService.refreshToken` isn't implemented.

**`GET /auth/who-am-i`** - always requires JWT. The `withUserInformation` query param (`true`, `false`, `1`, `0`; default `false`) attaches a `userInformation` field from `getUserInformation`. Returns `501` if you request that field without implementing `getUserInformation`.

```json
{ "userId": "123", "roles": [{ "id": "1", "identifier": "admin", "priority": 0 }] }
```

**`GET /auth/me`** - always requires JWT, delegating entirely to `getUserInformation(context, {})`. The response is not merged with the JWT payload. Returns `501` if `getUserInformation` isn't implemented.

> [!TIP]
> One `getUserInformation` implementation backs both routes. Use `GET /me` for the raw profile. Use `GET /who-am-i?withUserInformation=true` to get it merged with the principal in one round-trip.

**`GET /certs`** (Issuer mode only) - public, returns the JSON Web Key Set with `Cache-Control: public, max-age=3600, stale-while-revalidate=86400`.

```json
{ "keys": [{ "kty": "EC", "kid": "my-key-id-1", "use": "sig", "alg": "ES256", "crv": "P-256", "x": "...", "y": "..." }] }
```

## Entity column helpers

Column helper functions return pre-configured Drizzle columns for auth-related tables - spread them into `pgTable()` alongside your own columns.

```typescript
import { pgTable, text } from 'drizzle-orm/pg-core';
import {
  extraUserColumns, extraRoleColumns, extraPermissionColumns, extraPolicyDefinitionColumns,
  generateIdColumnDefs, generateTzColumnDefs,
} from '@venizia/ignis';

export const users = pgTable('users', {
  ...generateIdColumnDefs(),
  ...generateTzColumnDefs(),
  ...extraUserColumns(),
  username: text('username').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
});

export const roles = pgTable('roles', { ...generateIdColumnDefs(), ...generateTzColumnDefs(), ...extraRoleColumns() });
export const permissions = pgTable('permissions', { ...generateIdColumnDefs(), ...generateTzColumnDefs(), ...extraPermissionColumns() });
export const policyDefinitions = pgTable('policy_definitions', { ...generateIdColumnDefs(), ...generateTzColumnDefs(), ...extraPolicyDefinitionColumns() });
```

**`extraUserColumns(opts?: { idType })`**

| Column | DB column | Type | Default | Description |
|--------|-----------|------|---------|-------------|
| `realm` | `realm` | `text` | `''` | Multi-tenancy realm identifier |
| `status` | `status` | `text` | `UserStatuses.UNKNOWN` | User lifecycle status |
| `type` | `type` | `text` | `UserTypes.SYSTEM` | `SYSTEM` or `LINKED` |
| `activatedAt` | `activated_at` | `timestamp (tz)` | `null` | Activation timestamp |
| `lastLoginAt` | `last_login_at` | `timestamp (tz)` | `null` | Last login timestamp |
| `parentId` | `parent_id` | `text` or `integer` | `null` | Depends on `idType` |

**`extraRoleColumns()`** - no options.

| Column | DB column | Type | Default | Description |
|--------|-----------|------|---------|-------------|
| `identifier` | `identifier` | `text` (unique) | -- | For example, `'admin'`, `'editor'` |
| `name` | `name` | `text` | -- | Human-readable name |
| `description` | `description` | `text` | `null` | Optional |
| `priority` | `priority` | `integer` | -- | Lower = higher priority |
| `status` | `status` | `text` | `RoleStatuses.ACTIVATED` | Role lifecycle status |

**`extraPermissionColumns(opts?: { idType })`**

| Column | DB column | Type | Default | Description |
|--------|-----------|------|---------|-------------|
| `code` | `code` | `text` (unique) | -- | Unique permission code |
| `name` | `name` | `text` | -- | Display name |
| `subject` | `subject` | `text` | -- | For example, `'User'`, `'Order'` |
| `method` | `method` | `text` | -- | For example, `'GET'`, `'POST'` |
| `action` | `action` | `text` | -- | For example, `'read'`, `'write'` |
| `scope` | `scope` | `text` | -- | Permission scope |
| `description` | `description` | `text` | `null` | Optional |
| `parentId` | `parent_id` | `text` or `integer` | `null` | Depends on `idType` |

**`extraPolicyDefinitionColumns(opts?: { idType })`** - Casbin-style policies mapping subjects to targets.

| Column | DB column | Type | Nullable | Description |
|--------|-----------|------|----------|-------------|
| `variant` | `variant` | `text` | No | One of the seven `AuthorizationPolicyVariants` edge kinds: `grant`, `assign_role`, `role_inherits`, `join_domain`, `domain_inherits`, `resource_inherits`, `action_inherits` |
| `subjectType` | `subject_type` | `text` | No | For example, `'user'`, `'Role'` |
| `targetType` | `target_type` | `text` | No | For example, `'Permission'`, `'Role'` |
| `action` | `action` | `text` | Yes | Policy action |
| `effect` | `effect` | `text` | Yes | `'allow'` / `'deny'` |
| `domain` | `domain` | `text` | Yes | Multi-tenancy domain |
| `subjectId` | `subject_id` | `text` or `integer` | No | Depends on `idType` |
| `targetId` | `target_id` | `text` or `integer` | No | Depends on `idType` |
| `metadata` | `metadata` | `jsonb` | Yes | Free-form metadata. Only some grants populate it |

All `idType` options default to `'number'` (`integer` columns). Pass `'string'` for `text` columns - UUID primary keys, for example.

`'p'` and `'g'` are Casbin rule prefixes, not `variant` values - each `variant` maps to one of them internally. See the [Authorization component](../authorization/) to build these tables end to end. Its [Usage guide](../authorization/usage) covers policy definitions, domain scoping, and the adapter that reads this table.

## See also

- [Overview](./) - initial setup and binding keys
- [API Reference](./api) - full option tables, service class hierarchy, strategy registry
- [Error Reference](./errors) - every error message and how to fix it
