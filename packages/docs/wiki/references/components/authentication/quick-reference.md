# Quick Reference

| Item | Value |
|------|-------|
| **Package** | `@venizia/ignis` |
| **Class** | `AuthenticateComponent` |
| **Runtimes** | Both |

::: details Import Paths
```typescript
import {
  AuthenticateComponent,
  AuthenticateBindingKeys,
  Authentication,
  AuthenticationModes,
  AuthenticationStrategyRegistry,
  JWTAuthenticationStrategy,
  BasicAuthenticationStrategy,
  JWTTokenService,
  BasicTokenService,
  defineAuthController,
} from '@venizia/ignis';

import type {
  TAuthenticationRestOptions,
  IJWTTokenServiceOptions,
  IBasicTokenServiceOptions,
  IAuthenticateOptions,
  IAuthUser,
  IJWTTokenPayload,
  IAuthService,
  IAuthenticationStrategy,
  TDefineAuthControllerOpts,
  TAuthStrategy,
  TAuthMode,
  TGetTokenExpiresFn,
} from '@venizia/ignis';
```
:::

## Key Components

| Component | Purpose |
|-----------|---------|
| **AuthenticateComponent** | Main component registering auth services and controllers |
| **AuthenticationStrategyRegistry** | Singleton managing available auth strategies |
| **JWTAuthenticationStrategy** | JWT verification using `JWTTokenService` |
| **BasicAuthenticationStrategy** | Basic HTTP authentication using `BasicTokenService` |
| **JWTTokenService** | Generate, verify, encrypt/decrypt JWT tokens |
| **BasicTokenService** | Extract and verify Basic auth credentials |
| **IAuthService** | Interface for custom auth implementation (sign-in, sign-up) |
| **defineAuthController** | Factory function for creating custom auth controllers |

## Key Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `APP_ENV_APPLICATION_SECRET` | Encrypt JWT payload | Required for JWT |
| `APP_ENV_JWT_SECRET` | Sign and verify JWT signature | Required for JWT |
| `APP_ENV_JWT_EXPIRES_IN` | Token expiration (seconds) | Optional |

## Auth Modes

| Mode | Behavior |
|------|----------|
| `'any'` | First successful strategy wins (fallback mode) |
| `'all'` | All strategies must pass (MFA mode) |
