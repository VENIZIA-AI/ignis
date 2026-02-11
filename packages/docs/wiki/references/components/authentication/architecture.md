# Architecture Overview

```
  ┌──────────────────────────────────────────────────────────┐
  │                     Application                          │
  │                                                          │
  │  preConfigure()                                          │
  │    ├── bind JWT_OPTIONS / BASIC_OPTIONS / REST_OPTIONS   │
  │    ├── this.component(AuthenticateComponent)             │
  │    └── AuthenticationStrategyRegistry.register()         │
  └──────────────────────┬───────────────────────────────────┘
                         │
                         ▼
  ┌──────────────────────────────────────────────────────────┐
  │              AuthenticateComponent.binding()              │
  │                                                          │
  │  1. validateOptions() — at least one auth required       │
  │  2. defineJWTAuth() — bind JWTTokenService               │
  │  3. defineBasicAuth() — bind BasicTokenService           │
  │  4. defineControllers() — defineAuthController()         │
  └──────────────────────┬───────────────────────────────────┘
                         │
           ┌─────────────┼─────────────┐
           ▼             ▼             ▼
  ┌────────────┐ ┌──────────────┐ ┌──────────────────┐
  │ JWTToken   │ │ BasicToken   │ │  AuthController   │
  │ Service    │ │ Service      │ │  (factory-built)  │
  └──────┬─────┘ └──────┬───────┘ └────────┬─────────┘
         │              │                   │
         ▼              ▼                   ▼
  ┌────────────┐ ┌──────────────┐ ┌──────────────────┐
  │ JWT        │ │ Basic        │ │ /sign-in          │
  │ Strategy   │ │ Strategy     │ │ /sign-up          │
  │            │ │              │ │ /change-password   │
  └────────────┘ └──────────────┘ │ /who-am-i         │
                                  └──────────────────┘
```

## Authentication Flow

### JWT Authentication

1. Client sends request with `Authorization: Bearer <token>` header
2. `JWTAuthenticationStrategy.authenticate()` is called
3. `JWTTokenService.extractCredentials()` extracts the token from the header
4. `JWTTokenService.verify()` verifies the JWT signature using `jose.jwtVerify()`
5. `JWTTokenService.decryptPayload()` decrypts the AES-encrypted payload fields
6. The decrypted `IJWTTokenPayload` is set on `context.get(Authentication.CURRENT_USER)`

### Basic Authentication

1. Client sends request with `Authorization: Basic <base64(username:password)>` header
2. `BasicAuthenticationStrategy.authenticate()` is called
3. `BasicTokenService.extractCredentials()` decodes the Base64 credentials
4. `BasicTokenService.verify()` calls the user-provided `verifyCredentials` callback
5. The returned `IAuthUser` is set on `context.get(Authentication.CURRENT_USER)`

### Multi-Strategy Authentication

When multiple strategies are configured on a route:

- **`any` mode (default):** Strategies are tried in order. The first successful one wins. If all fail, a `401 Unauthorized` error is thrown listing all tried strategies.
- **`all` mode:** Every strategy must pass. If any fails, the request is rejected. The last strategy's user payload is used.

### Token Encryption

JWT payloads are encrypted field-by-field using AES (default `aes-256-cbc`):

- Standard JWT fields (`iss`, `sub`, `aud`, `jti`, `nbf`, `exp`, `iat`) are preserved as-is
- All other fields (including `userId`, `roles`, etc.) have both their keys and values AES-encrypted
- The `roles` field is serialized as `id|identifier|priority` pipe-separated strings before encryption
- `null` and `undefined` values are skipped during encryption

## Strategy Registry

`AuthenticationStrategyRegistry` is a **singleton** that manages all registered strategies:

- Strategies are registered with `register()` and bound to the DI container as singletons
- Strategy binding keys follow the pattern `authentication.strategy.{name}` (e.g., `authentication.strategy.jwt`)
- The `authenticate()` method returns a Hono `MiddlewareHandler` that performs the auth check
- The standalone `authenticate()` function is a convenience wrapper around the registry singleton

## Tech Stack

- **`jose`** for JWT signing, verification, and encryption
- **`@venizia/ignis-helpers`** AES utility for payload field encryption
- **Hono** middleware pattern for route-level authentication
