---
title: Authentication
description: JWT (JWS/JWKS) and Basic HTTP authentication component with multi-strategy support and a built-in auth controller
difficulty: intermediate
---

# Authentication

`AuthenticateComponent` wires up JWT and/or Basic HTTP authentication - token services, route-level strategies, and an optional built-in `/auth` controller for sign-in, sign-up, and password change.

## In one example

The smallest real setup: symmetric JWT (JWS), one strategy, one protected route.

```typescript
import {
  AuthenticateBindingKeys,
  AuthenticateComponent,
  Authentication,
  AuthenticationStrategyRegistry,
  BaseApplication,
  JOSEStandards,
  JWSAuthenticationStrategy,
  TJWTTokenServiceOptions,
  ValueOrPromise,
} from '@venizia/ignis';

export class Application extends BaseApplication {
  preConfigure(): ValueOrPromise<void> {
    this.bind<TJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS }).toValue({
      standard: JOSEStandards.JWS,
      options: {
        jwtSecret: process.env.APP_ENV_JWT_SECRET!,
        getTokenExpiresFn: () => Number(process.env.APP_ENV_JWT_EXPIRES_IN || 86400),
      },
    });

    this.component(AuthenticateComponent);

    // Strategies are NOT auto-registered - register them after the component
    AuthenticationStrategyRegistry.getInstance().register({
      container: this,
      strategies: [{ name: Authentication.STRATEGY_JWT, strategy: JWSAuthenticationStrategy }],
    });
  }
}
```

```typescript
const SECURE_ROUTE = {
  path: '/data',
  method: HTTP.Methods.GET,
  authenticate: { strategies: [Authentication.STRATEGY_JWT] },
  responses: jsonResponse({ description: 'Protected', schema: z.object({ data: z.any() }) }),
} as const;
```

## How it works

- **One component, three auth mechanisms.** `AuthenticateComponent.binding()` reads `JWT_OPTIONS` (JWS or JWKS, via a discriminated `standard` field) and `BASIC_OPTIONS` from the DI container and registers whichever token services their presence implies. At least one of the two must be bound, or the component throws at startup.
- **Strategies are manual, on purpose.** The component registers *token services* (JWS/JWKS/Basic), not *strategies*. You register strategies yourself via `AuthenticationStrategyRegistry.getInstance().register(...)` after `this.component(AuthenticateComponent)` - this is what gives routes a `Authentication.STRATEGY_JWT` / `'basic'` name to reference.
- **The registry is a DI-backed singleton.** `AuthenticationStrategyRegistry` binds each registered strategy into the container as a singleton under `authentication.strategy.<name>` and resolves it by name when a route's `authenticate.strategies` list is checked.
- **`authenticate()` is the middleware entry point.** Route-level `authenticate: { strategies, mode }` config and the standalone `authenticate()` function both go through the same `AuthenticationProvider`, which tries strategies in `'any'` (first success wins) or `'all'` (every strategy must pass) mode and sets `Authentication.CURRENT_USER` on the Hono context.
- **The auth controller is optional and generated.** Setting `REST_OPTIONS.useAuthController: true` calls `defineAuthController()`, which builds a `BaseRestController` subclass at runtime with `/sign-in`, `/sign-up`, `/change-password`, `/token/refresh`, `/who-am-i`, and `/me` routes, backed by your own `IAuthService` implementation.

**JOSE standards**

| Standard | Class | Keying | Use case |
|----------|-------|--------|----------|
| JWS | `JWSTokenService` | Shared secret (HS256) | Single service signs and verifies |
| JWKS Issuer | `JWKSIssuerTokenService` | Private + public key (ES256/RS256/EdDSA) | This service issues tokens and serves `/certs` |
| JWKS Verifier | `JWKSVerifierTokenService` | Remote JWKS URL | This service only verifies tokens from another issuer |

## Common tasks

**Configure JWS (symmetric JWT).** One shared secret signs and verifies.

```typescript
this.bind<TJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS }).toValue({
  standard: JOSEStandards.JWS,
  options: {
    jwtSecret: process.env.APP_ENV_JWT_SECRET!,
    getTokenExpiresFn: () => Number(process.env.APP_ENV_JWT_EXPIRES_IN || 86400),
  },
});
```

**Configure JWKS Issuer (asymmetric JWT, microservice-friendly).** Signs with a private key, serves the public key at `/certs`.

```typescript
this.bind<TJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS }).toValue({
  standard: JOSEStandards.JWKS,
  options: {
    mode: JWKSModes.ISSUER,
    algorithm: 'ES256',
    keys: { driver: JWKSKeyDrivers.FILE, format: JWKSKeyFormats.PEM, private: './keys/private.pem', public: './keys/public.pem' },
    kid: 'my-key-id-1',
    getTokenExpiresFn: () => Number(process.env.APP_ENV_JWT_EXPIRES_IN || 86400),
  },
});
```

**Add Basic auth.** Provide a `verifyCredentials` callback; it becomes the `'basic'` strategy's source of truth.

```typescript
this.bind<TBasicTokenServiceOptions>({ key: AuthenticateBindingKeys.BASIC_OPTIONS }).toValue({
  verifyCredentials: async ({ credentials, context }) => {
    const user = await userRepo.findByUsername(credentials.username);
    if (user && await bcrypt.compare(credentials.password, user.passwordHash)) {
      return { userId: user.id, roles: user.roles };
    }
    return null;
  },
});
```

**Enable the built-in `/auth` controller.** Requires `jwtOptions` and a bound `IAuthService`.

```typescript
this.service(AuthenticationService);

this.bind<TAuthenticationRestOptions>({ key: AuthenticateBindingKeys.REST_OPTIONS }).toValue({
  useAuthController: true,
  controllerOpts: {
    restPath: '/auth',
    serviceKey: BindingKeys.build({ namespace: BindingNamespaces.SERVICE, key: AuthenticationService.name }),
  },
});
```

**Secure a route with multiple strategies.** `mode: 'any'` (default) falls back through strategies; `mode: 'all'` requires every one to pass.

```typescript
const FALLBACK_AUTH_CONFIG = {
  path: '/api/data',
  method: HTTP.Methods.GET,
  authenticate: { strategies: [Authentication.STRATEGY_JWT, Authentication.STRATEGY_BASIC], mode: AuthenticationModes.ANY },
  responses: jsonResponse({ description: 'Data', schema: z.object({ data: z.any() }) }),
} as const;
```

**Add auth entity columns to a Drizzle table.** Spread helper functions into `pgTable()` for User/Role/Permission/PolicyDefinition columns.

```typescript
import { extraUserColumns } from '@venizia/ignis';

export const users = pgTable('users', {
  ...withSerialId(),
  ...withTimestamps(),
  ...extraUserColumns(),
  username: text('username').unique().notNull(),
});
```

## See also

- [Usage & Examples](./usage) - securing routes, auth flows, JWKS microservice patterns, entity column helpers
- [API Reference](./api) - architecture, service class hierarchy, strategy registry, controller factory
- [Error Reference](./errors) - every error message and how to fix it
- [Components Overview](/guides/core-concepts/components) - component system basics
- [REST Controllers](/guides/core-concepts/rest-controllers) - protecting routes with `authenticate`
- [Crypto Helper](/extensions/helpers/crypto/) - password hashing utilities for `verifyCredentials`

**Files:**

- [`packages/core/src/components/auth/authenticate/component.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/auth/authenticate/component.ts) - `AuthenticateComponent`
- [`packages/core/src/components/auth/authenticate/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/auth/authenticate/common/types.ts) - all option interfaces
- [`packages/core/src/components/auth/authenticate/common/keys.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/auth/authenticate/common/keys.ts) - `AuthenticateBindingKeys`
- [`packages/core/src/components/auth/authenticate/common/constants.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/auth/authenticate/common/constants.ts) - `Authentication`, `JOSEStandards`, `JWKSModes`, `JWKSKeyDrivers`, `JWKSKeyFormats`
- [`packages/core/src/components/auth/models/entities`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/auth/models/entities) - `extraUserColumns`, `extraRoleColumns`, `extraPermissionColumns`, `extraPolicyDefinitionColumns`
