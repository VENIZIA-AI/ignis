# Authentication -- Setup & Configuration

> JWT and Basic HTTP authentication with AES-encrypted payloads, multi-strategy support, and built-in auth controller

## Quick Reference

| Item | Value |
|------|-------|
| **Package** | `@venizia/ignis` |
| **Class** | `AuthenticateComponent` |
| **Runtimes** | Both |

### Key Components

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
| **authenticate** | Standalone function wrapping `AuthenticationStrategyRegistry.getInstance().authenticate()` |

### Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `APP_ENV_APPLICATION_SECRET` | Encrypt JWT payload | Required for JWT |
| `APP_ENV_JWT_SECRET` | Sign and verify JWT signature | Required for JWT |
| `APP_ENV_JWT_EXPIRES_IN` | Token expiration (seconds) | Optional |

### Auth Modes

| Mode | Behavior |
|------|----------|
| `'any'` | First successful strategy wins (fallback mode) |
| `'all'` | All strategies must pass (MFA mode) |

### Token Types

| Constant | Value | Description |
|----------|-------|-------------|
| `AuthenticationTokenTypes.TYPE_AUTHORIZATION_CODE` | `'000_AUTHORIZATION_CODE'` | Authorization code grant type |
| `AuthenticationTokenTypes.TYPE_ACCESS_TOKEN` | `'100_ACCESS_TOKEN'` | Access token type |
| `AuthenticationTokenTypes.TYPE_REFRESH_TOKEN` | `'200_REFRESH_TOKEN'` | Refresh token type |

### Authentication Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `Authentication.ACCESS_TOKEN_SECRET` | `'token.secret'` | Default access token secret key |
| `Authentication.ACCESS_TOKEN_EXPIRES_IN` | `86400` | Default access token expiration (seconds, 24h) |
| `Authentication.REFRESH_TOKEN_SECRET` | `'refresh.secret'` | Default refresh token secret key |
| `Authentication.REFRESH_TOKEN_EXPIRES_IN` | `86400` | Default refresh token expiration (seconds, 24h) |
| `Authentication.AUTHENTICATION_STRATEGY` | `'authentication.strategy'` | Namespace prefix for strategy binding keys |
| `Authentication.STRATEGY_JWT` | `'jwt'` | JWT strategy name |
| `Authentication.STRATEGY_BASIC` | `'basic'` | Basic strategy name |
| `Authentication.TYPE_BEARER` | `'Bearer'` | Bearer token type prefix |
| `Authentication.TYPE_BASIC` | `'Basic'` | Basic token type prefix |
| `Authentication.SKIP_AUTHENTICATION` | `'authentication.skip'` | Context key to dynamically skip auth |
| `Authentication.CURRENT_USER` | `'auth.current.user'` | Context key for the authenticated user payload |
| `Authentication.AUDIT_USER_ID` | `'audit.user.id'` | Context key for the authenticated user ID |

#### Import Paths
```typescript
import {
  AuthenticateComponent,
  AuthenticateBindingKeys,
  Authentication,
  AuthenticationModes,
  AuthenticationTokenTypes,
  AuthenticationStrategyRegistry,
  JWTAuthenticationStrategy,
  BasicAuthenticationStrategy,
  JWTTokenService,
  BasicTokenService,
  defineAuthController,
  authenticate,
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

#### Entity Column Helper Imports

```typescript
import {
  extraUserColumns,
  extraRoleColumns,
  extraPermissionColumns,
  extraPermissionMappingColumns,
  extraUserRoleColumns,
} from '@venizia/ignis';

import type {
  TPermissionOptions,
  TPermissionCommonColumns,
  TPermissionMappingOptions,
  TPermissionMappingCommonColumns,
  TUserRoleOptions,
  TUserRoleCommonColumns,
} from '@venizia/ignis';
```

#### Status and Type Imports

```typescript
import {
  UserStatuses,
  UserTypes,
  RoleStatuses,
} from '@venizia/ignis';
```

## Setup

### Step 1: Bind Configuration

Bind at least one of `JWT_OPTIONS` or `BASIC_OPTIONS` in your application's `preConfigure()`.

### JWT Only (Primary Setup)

```typescript
import {
  AuthenticateBindingKeys,
  IJWTTokenServiceOptions,
} from '@venizia/ignis';

// Bind JWT options
this.bind<IJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS }).toValue({
  applicationSecret: process.env.APP_ENV_APPLICATION_SECRET,
  jwtSecret: process.env.APP_ENV_JWT_SECRET,
  getTokenExpiresFn: () => Number(process.env.APP_ENV_JWT_EXPIRES_IN || 86400),
});
```

**Example `.env` file:**

```
APP_ENV_APPLICATION_SECRET=your-strong-application-secret
APP_ENV_JWT_SECRET=your-strong-jwt-secret
APP_ENV_JWT_EXPIRES_IN=86400
```

### Basic Auth Only (Alternative Setup)

```typescript
import {
  AuthenticateBindingKeys,
  IBasicTokenServiceOptions,
} from '@venizia/ignis';

// Bind Basic auth options
this.bind<IBasicTokenServiceOptions>({ key: AuthenticateBindingKeys.BASIC_OPTIONS }).toValue({
  verifyCredentials: async (opts) => {
    const { credentials, context } = opts;
    const user = await userRepo.findByUsername(credentials.username);
    if (user && await bcrypt.compare(credentials.password, user.passwordHash)) {
      return { userId: user.id, roles: user.roles };
    }
    return null;
  },
});
```

### Combined JWT + Basic with Auth Controller (Full Setup)

```typescript
import {
  AuthenticateBindingKeys,
  IJWTTokenServiceOptions,
  IBasicTokenServiceOptions,
  TAuthenticationRestOptions,
} from '@venizia/ignis';

// Bind REST options (enables auth controller)
this.bind<TAuthenticationRestOptions>({ key: AuthenticateBindingKeys.REST_OPTIONS }).toValue({
  useAuthController: true,
  controllerOpts: {
    restPath: '/auth',
    payload: {
      signIn: {
        request: { schema: SignInRequestSchema },
        response: { schema: SignInResponseSchema },
      },
      signUp: {
        request: { schema: SignUpRequestSchema },
        response: { schema: SignUpResponseSchema },
      },
    },
  },
});

// Bind JWT options
this.bind<IJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS }).toValue({
  applicationSecret: process.env.APP_ENV_APPLICATION_SECRET,
  jwtSecret: process.env.APP_ENV_JWT_SECRET,
  getTokenExpiresFn: () => Number(process.env.APP_ENV_JWT_EXPIRES_IN || 86400),
});

// Bind Basic auth options
this.bind<IBasicTokenServiceOptions>({ key: AuthenticateBindingKeys.BASIC_OPTIONS }).toValue({
  verifyCredentials: async (opts) => {
    const authenticateService = this.get<AuthenticationService>({
      key: BindingKeys.build({
        namespace: BindingNamespaces.SERVICE,
        key: AuthenticationService.name,
      }),
    });
    return authenticateService.signIn(opts.context, {
      identifier: { scheme: 'username', value: opts.credentials.username },
      credential: { scheme: 'basic', value: opts.credentials.password },
    });
  },
});
```

### Step 2: Register Component

```typescript
import {
  AuthenticateComponent,
  Authentication,
  AuthenticationStrategyRegistry,
  JWTAuthenticationStrategy,
  BasicAuthenticationStrategy,
  BaseApplication,
  ValueOrPromise,
} from '@venizia/ignis';

export class Application extends BaseApplication {
  preConfigure(): ValueOrPromise<void> {
    // Register your auth service (if using auth controller)
    this.service(AuthenticationService);

    // Step 1 bindings here...

    // Register component
    this.component(AuthenticateComponent);

    // Register strategies
    AuthenticationStrategyRegistry.getInstance().register({
      container: this,
      strategies: [
        { name: Authentication.STRATEGY_JWT, strategy: JWTAuthenticationStrategy },
        { name: Authentication.STRATEGY_BASIC, strategy: BasicAuthenticationStrategy },
      ],
    });
  }
}
```

> [!NOTE]
> Only register the strategies you need. JWT-only setups can omit `BasicAuthenticationStrategy` and vice versa.

## Configuration

### JWT Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `jwtSecret` | `string` | -- | Secret for signing and verifying JWT signature |
| `applicationSecret` | `string` | -- | Secret for AES-encrypting JWT payload fields |
| `getTokenExpiresFn` | `() => ValueOrPromise<number>` | -- | Function returning token expiration in seconds |
| `aesAlgorithm` | `AESAlgorithmType` | `'aes-256-cbc'` | AES algorithm for payload encryption |
| `headerAlgorithm` | `string` | `'HS256'` | JWT signing algorithm |

> [!WARNING]
> Both `applicationSecret` and `jwtSecret` are mandatory when using JWT authentication. They must be strong, unique secret values. The component will throw an error if either is missing or set to `'unknown_secret'`. Additionally, the error message from `defineJWTAuth` **includes the actual provided secret value** in the error output (e.g., <code v-pre>[defineJWTAuth] Invalid jwtSecret | Provided: {{jwtSecret}}</code>), so ensure these errors are never exposed to end users.

> [!NOTE]
> The `getTokenExpiresFn` is called on every token generation, not just once. This allows dynamic expiration (e.g., shorter tokens for mobile, longer for admin).

**Example `.env` file:**

```
APP_ENV_APPLICATION_SECRET=your-strong-application-secret
APP_ENV_JWT_SECRET=your-strong-jwt-secret
APP_ENV_JWT_EXPIRES_IN=86400
```

#### IJWTTokenServiceOptions -- Full Interface
```typescript
interface IJWTTokenServiceOptions {
  jwtSecret: string;
  applicationSecret: string;
  getTokenExpiresFn: () => ValueOrPromise<number>;
  aesAlgorithm?: AESAlgorithmType;
  headerAlgorithm?: string;
}
```

### Basic Auth Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `verifyCredentials` | `(opts: { credentials, context }) => Promise<IAuthUser \| null>` | -- | Callback to verify Basic auth credentials |

The `verifyCredentials` function receives an options object:

```typescript
type TBasicAuthVerifyFn<E extends Env = Env> = (opts: {
  credentials: { username: string; password: string };
  context: TContext<E, string>;
}) => Promise<IAuthUser | null>;
```

#### IBasicTokenServiceOptions -- Full Interface
```typescript
interface IBasicTokenServiceOptions<E extends Env = Env> {
  verifyCredentials: (opts: {
    credentials: { username: string; password: string };
    context: TContext<E, string>;
  }) => Promise<IAuthUser | null>;
}
```

### REST Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `useAuthController` | `boolean` | `false` | Enable/disable built-in auth controller |
| `controllerOpts` | `TDefineAuthControllerOpts` | -- | Configuration for built-in auth controller (required when `useAuthController` is `true`) |

`TAuthenticationRestOptions` is a discriminated union type:

```typescript
type TAuthenticationRestOptions = {} & (
  | { useAuthController?: false | undefined }
  | {
      useAuthController: true;
      controllerOpts: TDefineAuthControllerOpts;
    }
);
```

> [!IMPORTANT]
> When `useAuthController` is `true`, the `controllerOpts` field becomes required. The discriminated union enforces this at the type level -- you cannot set `useAuthController: true` without providing `controllerOpts`.

### Controller Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `restPath` | `string` | `'/auth'` | Base path for auth endpoints |
| `serviceKey` | `string` | `'services.AuthenticationService'` | DI key for the auth service |
| `requireAuthenticatedSignUp` | `boolean` | `false` | Whether sign-up requires JWT authentication |
| `payload` | `object` | `{}` | Custom Zod schemas for request/response payloads |

#### TDefineAuthControllerOpts -- Full Interface
```typescript
type TDefineAuthControllerOpts = {
  restPath?: string;
  serviceKey?: string;
  requireAuthenticatedSignUp?: boolean;
  payload?: {
    signIn?: {
      request: { schema: TAnyObjectSchema };
      response: { schema: TAnyObjectSchema };
    };
    signUp?: {
      request: { schema: TAnyObjectSchema };
      response: { schema: TAnyObjectSchema };
    };
    changePassword?: {
      request: { schema?: TAnyObjectSchema };
      response: { schema: TAnyObjectSchema };
    };
  };
};
```

### Route Configuration Options

These options are used in route configs to control per-route authentication:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `authStrategies` | `TAuthStrategy[]` | -- | Array of strategy names (e.g., `['jwt']`, `['jwt', 'basic']`) |
| `authMode` | `'any' \| 'all'` | `'any'` | How to handle multiple strategies |
| `skipAuth` | `boolean` | `false` | Skip authentication for this route |

### IAuthUser Interface

The base authenticated user type returned by strategies and available on the context:

```typescript
interface IAuthUser {
  userId: IdType;
  [extra: string | symbol]: any;
}
```

> [!TIP]
> `IAuthUser` is intentionally minimal. Your `IAuthService` implementation can extend the user payload with additional fields (roles, email, provider, etc.) -- these extra fields will be preserved through JWT token generation and available after authentication via `Authentication.CURRENT_USER`.

### SignInRequestSchema Field Constraints

The built-in `SignInRequestSchema` enforces the following validation constraints on sign-in request payloads:

| Field | Type | Constraints |
|-------|------|-------------|
| `identifier.scheme` | `string` | Non-empty, min 4 chars (required) |
| `identifier.value` | `string` | Non-empty, min 8 chars (required) |
| `credential.scheme` | `string` | Non-empty (required) |
| `credential.value` | `string` | Non-empty, min 8 chars (required) |
| `clientId` | `string` | Optional |

### SignUpRequestSchema Field Constraints

The built-in `SignUpRequestSchema` uses a **flat structure** (not nested like `SignInRequestSchema`):

| Field | Type | Constraints |
|-------|------|-------------|
| `username` | `string` | Non-empty, min 8 chars (required) |
| `credential` | `string` | Non-empty, min 8 chars (required) |

### ChangePasswordRequestSchema Field Constraints

The built-in `ChangePasswordRequestSchema` uses scheme-based credential naming:

| Field | Type | Constraints |
|-------|------|-------------|
| `scheme` | `string` | Required |
| `oldCredential` | `string` | Non-empty, min 8 chars (required) |
| `newCredential` | `string` | Non-empty, min 8 chars (required) |
| `userId` | `string \| number` | Required |

#### IAuthService -- Full Interface
```typescript
interface IAuthService<
  E extends Env = Env,
  SIRQ extends TSignInRequest = TSignInRequest,
  SIRS = AnyObject,
  SURQ extends TSignUpRequest = TSignUpRequest,
  SURS = AnyObject,
  CPRQ extends TChangePasswordRequest = TChangePasswordRequest,
  CPRS = AnyObject,
  UIRQ = AnyObject,
  UIRS = AnyObject,
> {
  signIn(context: TContext<E>, opts: SIRQ): Promise<SIRS>;
  signUp(context: TContext<E>, opts: SURQ): Promise<SURS>;
  changePassword(context: TContext<E>, opts: CPRQ): Promise<CPRS>;
  getUserInformation?(context: TContext<E>, opts: UIRQ): Promise<UIRS>;
}
```

> [!NOTE]
> `IAuthService` is generic on the Hono `Env` type as well as all request/response types. The `getUserInformation` method is optional.

#### IJWTTokenPayload -- Full Interface
```typescript
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

## Binding Keys

| Key | Constant | Type | Required | Default |
|-----|----------|------|----------|---------|
| `@app/authenticate/rest-options` | `AuthenticateBindingKeys.REST_OPTIONS` | `TAuthenticationRestOptions` | No | <code v-pre>{ useAuthController: false }</code> |
| `@app/authenticate/jwt-options` | `AuthenticateBindingKeys.JWT_OPTIONS` | `IJWTTokenServiceOptions` | Conditional | -- |
| `@app/authenticate/basic-options` | `AuthenticateBindingKeys.BASIC_OPTIONS` | `IBasicTokenServiceOptions` | Conditional | -- |

> [!IMPORTANT]
> At least one of `JWT_OPTIONS` or `BASIC_OPTIONS` must be bound. If neither is configured, the component will throw an error during `binding()`.

### Context Variables

These values are set on the Hono `Context` during authentication and can be accessed via `context.get()`:

| Key | Constant | Type | Description |
|-----|----------|------|-------------|
| `auth.current.user` | `Authentication.CURRENT_USER` | `IAuthUser` | Authenticated user payload |
| `audit.user.id` | `Authentication.AUDIT_USER_ID` | `IdType` | Authenticated user's ID |
| `authentication.skip` | `Authentication.SKIP_AUTHENTICATION` | `boolean` | Dynamically skip auth |

### Strategy Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `Authentication.STRATEGY_JWT` | `'jwt'` | JWT strategy name |
| `Authentication.STRATEGY_BASIC` | `'basic'` | Basic strategy name |
| `Authentication.TYPE_BEARER` | `'Bearer'` | Bearer token type |
| `Authentication.TYPE_BASIC` | `'Basic'` | Basic token type |

### AuthenticateStrategy Class

Utility class for validating strategy names:

```typescript
class AuthenticateStrategy {
  static readonly BASIC = 'basic';
  static readonly JWT = 'jwt';
  static readonly SCHEME_SET: Set<string>;
  static isValid(input: string): boolean;
}
type TAuthStrategy = TConstValue<typeof AuthenticateStrategy>;
```

| Member | Type | Description |
|--------|------|-------------|
| `BASIC` | `string` | Constant for basic strategy name |
| `JWT` | `string` | Constant for JWT strategy name |
| `SCHEME_SET` | `Set<string>` | Set containing all valid strategy names |
| `isValid(input)` | `(input: string) => boolean` | Returns `true` if the input is a recognized strategy name |

### AuthenticationModes Class

Utility class for validating authentication modes:

```typescript
class AuthenticationModes {
  static readonly ANY = 'any';
  static readonly ALL = 'all';
}
type TAuthMode = TConstValue<typeof AuthenticationModes>;
```

| Member | Type | Description |
|--------|------|-------------|
| `ANY` | `string` | First successful strategy wins (fallback) |
| `ALL` | `string` | All strategies must pass (MFA) |

## See Also

- [Usage & Examples](./usage) -- Securing routes, auth flows, and API endpoints
- [API Reference](./api) -- Architecture, service internals, and strategy registry
- [Error Reference](./errors) -- Error messages and troubleshooting

- **Guides:**
  - [Components Overview](/guides/core-concepts/components) -- Component system basics
  - [Controllers](/guides/core-concepts/controllers) -- Protecting routes with auth

- **Components:**
  - [All Components](../index) -- Built-in components list

- **Helpers:**
  - [Crypto Helper](/references/helpers/crypto/) -- Password hashing utilities

- **References:**
  - [Middlewares](/references/base/middlewares) -- Custom authentication middleware

- **Best Practices:**
  - [Security Guidelines](/best-practices/security-guidelines) -- Authentication best practices

- **Tutorials:**
  - [Building a CRUD API](/guides/tutorials/building-a-crud-api) -- Adding authentication
