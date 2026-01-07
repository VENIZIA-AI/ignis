# Authentication Component

JWT and Basic authentication system for Ignis applications with multi-strategy support.

## Quick Reference

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

### Key Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `APP_ENV_APPLICATION_SECRET` | Encrypt JWT payload | Required for JWT |
| `APP_ENV_JWT_SECRET` | Sign and verify JWT signature | Required for JWT |
| `APP_ENV_JWT_EXPIRES_IN` | Token expiration (seconds) | Optional |

### Binding Keys

The authentication component uses **separate binding keys** for each configuration type:

| Binding Key | Type | Description |
|-------------|------|-------------|
| `AuthenticateBindingKeys.REST_OPTIONS` | `TAuthenticationRestOptions` | REST controller configuration |
| `AuthenticateBindingKeys.JWT_OPTIONS` | `IJWTTokenServiceOptions` | JWT token configuration |
| `AuthenticateBindingKeys.BASIC_OPTIONS` | `IBasicTokenServiceOptions` | Basic auth configuration |

### REST Options Configuration

| Option | Type | Description |
|--------|------|-------------|
| `useAuthController` | `boolean` | Enable/disable built-in auth controller (default: `false`) |
| `controllerOpts` | `TDefineAuthControllerOpts` | Configuration for built-in auth controller (required if `useAuthController` is `true`) |
| `controllerOpts.restPath` | `string` | Base path for auth endpoints (default: `/auth`) |
| `controllerOpts.serviceKey` | `string` | Dependency injection key for auth service |
| `controllerOpts.requireAuthenticatedSignUp` | `boolean` | Whether sign-up requires authentication (default: `false`) |
| `controllerOpts.payload` | `object` | Custom Zod schemas for request/response payloads |

::: warning IMPORTANT
At least one of `JWT_OPTIONS` or `BASIC_OPTIONS` must be bound. If neither is configured, the component will throw an error.
:::

### Route Configuration Options

| Option | Type | Description |
|--------|------|-------------|
| `authStrategies` | `TAuthStrategy[]` | Array of strategy names to use (e.g., `['jwt']`, `['jwt', 'basic']`) |
| `authMode` | `'any' \| 'all'` | How to handle multiple strategies (default: `'any'`) |
| `skipAuth` | `boolean` | Skip authentication for this route (default: `false`) |

### Auth Modes

| Mode | Behavior |
|------|----------|
| `'any'` | First successful strategy wins (fallback mode) |
| `'all'` | All strategies must pass (MFA mode) |

## Architecture Components

-   **`AuthenticateComponent`**: Registers all necessary services and optionally the authentication controller
-   **`AuthenticationStrategyRegistry`**: Singleton managing authentication strategies
-   **`JWTAuthenticationStrategy`**: JWT strategy implementation using `JWTTokenService`
-   **`BasicAuthenticationStrategy`**: Basic HTTP auth strategy using `BasicTokenService`
-   **`JWTTokenService`**: Generates, verifies, encrypts/decrypts JWT payloads
-   **`BasicTokenService`**: Extracts and verifies Basic auth credentials
-   **`defineAuthController`**: Factory function to create customizable authentication controller
-   **Protected Routes**: Use `authStrategies` and `authMode` in route configs to secure endpoints

## Implementation Details

### Tech Stack

-   **Hono**
-   **`jose`:** For JWT signing, verification, and encryption.
-   **`@venizia/ignis`**: The core framework.

### Configuration

Configure the authentication feature using environment variables:

-   `APP_ENV_APPLICATION_SECRET`: A secret for encrypting the JWT payload.
-   `APP_ENV_JWT_SECRET`: The secret for signing and verifying the JWT signature.
-   `APP_ENV_JWT_EXPIRES_IN`: The JWT expiration time in seconds.

::: danger SECURITY NOTE
Both `APP_ENV_APPLICATION_SECRET` and `APP_ENV_JWT_SECRET` are **mandatory** when using JWT authentication. For security purposes, you must set these to strong, unique secret values.
:::

**Example `.env` file:**

```
APP_ENV_APPLICATION_SECRET=your-strong-application-secret
APP_ENV_JWT_SECRET=your-strong-jwt-secret
APP_ENV_JWT_EXPIRES_IN=86400
```

### Code Samples

#### 1. Registering the Authentication Component

In `src/application.ts`, register the `AuthenticateComponent` and authentication strategies.

**JWT Only Setup:**

```typescript
// src/application.ts
import {
  AuthenticateComponent,
  AuthenticateBindingKeys,
  Authentication,
  AuthenticationStrategyRegistry,
  IJWTTokenServiceOptions,
  JWTAuthenticationStrategy,
  BaseApplication,
  ValueOrPromise,
} from '@venizia/ignis';
import { AuthenticationService } from './services';

export class Application extends BaseApplication {
  registerAuth() {
    this.service(AuthenticationService);

    // Bind JWT options
    this.bind<IJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS }).toValue({
      applicationSecret: process.env.APP_ENV_APPLICATION_SECRET,
      jwtSecret: process.env.APP_ENV_JWT_SECRET,
      getTokenExpiresFn: () => Number(process.env.APP_ENV_JWT_EXPIRES_IN || 86400),
    });

    this.component(AuthenticateComponent);
    AuthenticationStrategyRegistry.getInstance().register({
      container: this,
      strategies: [
        { name: Authentication.STRATEGY_JWT, strategy: JWTAuthenticationStrategy },
      ],
    });
  }

  preConfigure(): ValueOrPromise<void> {
    this.registerAuth();
  }
}
```

**Basic Auth Only Setup:**

```typescript
import {
  AuthenticateComponent,
  AuthenticateBindingKeys,
  Authentication,
  AuthenticationStrategyRegistry,
  BasicAuthenticationStrategy,
  IBasicTokenServiceOptions,
  BaseApplication,
} from '@venizia/ignis';

export class Application extends BaseApplication {
  registerAuth() {
    // Bind Basic auth options
    this.bind<IBasicTokenServiceOptions>({ key: AuthenticateBindingKeys.BASIC_OPTIONS }).toValue({
      verifyCredentials: async (opts) => {
        const { credentials, context } = opts;
        // Your verification logic here
        const user = await this.userRepo.findByUsername(credentials.username);
        if (user && await bcrypt.compare(credentials.password, user.passwordHash)) {
          return { userId: user.id, roles: user.roles };
        }
        return null;
      },
    });

    this.component(AuthenticateComponent);
    AuthenticationStrategyRegistry.getInstance().register({
      container: this,
      strategies: [
        { name: Authentication.STRATEGY_BASIC, strategy: BasicAuthenticationStrategy },
      ],
    });
  }
}
```

**Combined JWT + Basic Auth Setup (with fallback):**

```typescript
import {
  AuthenticateComponent,
  AuthenticateBindingKeys,
  Authentication,
  AuthenticationStrategyRegistry,
  BasicAuthenticationStrategy,
  JWTAuthenticationStrategy,
  IJWTTokenServiceOptions,
  IBasicTokenServiceOptions,
  TAuthenticationRestOptions,
  BaseApplication,
} from '@venizia/ignis';

export class Application extends BaseApplication {
  registerAuth() {
    this.service(AuthenticationService);

    // Bind REST options (for auth controller)
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

    this.component(AuthenticateComponent);

    // Register multiple strategies at once
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

#### 2. Basic Authentication Verification Function

The `verifyCredentials` function receives an options object with credentials and context:

```typescript
type TBasicAuthVerifyFn = (opts: {
  credentials: { username: string; password: string };
  context: Context;
}) => Promise<IAuthUser | null>;
```

Example implementation:

```typescript
basicOptions: {
  verifyCredentials: async (opts) => {
    const { credentials, context } = opts;

    // Look up user by username
    const user = await userRepo.findByUsername(credentials.username);

    if (!user) {
      return null; // User not found
    }

    // Verify password
    const isValid = await bcrypt.compare(credentials.password, user.passwordHash);

    if (!isValid) {
      return null; // Invalid password
    }

    // Return user info (must include userId)
    return {
      userId: user.id,
      roles: user.roles,
      // ... any additional fields
    };
  },
}
```

#### 3. Implementing an AuthenticationService

The `AuthenticateComponent` depends on a service that implements the `IAuthService` interface.

```typescript
// src/services/authentication.service.ts
import {
  BaseService,
  inject,
  IAuthService,
  IJWTTokenPayload,
  JWTTokenService,
  TSignInRequest,
  getError,
} from '@venizia/ignis';
import { Context } from 'hono';

export class AuthenticationService extends BaseService implements IAuthService {
  constructor(
    @inject({ key: 'services.JWTTokenService' })
    private _jwtTokenService: JWTTokenService,
  ) {
    super({ scope: AuthenticationService.name });
  }

  async signIn(context: Context, opts: TSignInRequest): Promise<{ token: string }> {
    const { identifier, credential } = opts;

    // Your custom logic here
    const user = await this.userRepo.findByIdentifier(identifier);

    if (!user || !await this.verifyCredential(credential, user)) {
      throw getError({ message: 'Invalid credentials' });
    }

    const payload: IJWTTokenPayload = {
      userId: user.id,
      roles: user.roles,
    };

    const token = await this._jwtTokenService.generate({ payload });
    return { token };
  }

  async signUp(context: Context, opts: any): Promise<any> {
    // Implement your sign-up logic
  }

  async changePassword(context: Context, opts: any): Promise<any> {
    // Implement your change password logic
  }
}
```

#### 4. Securing Routes

Use `authStrategies` and `authMode` in route configurations:

**Single Strategy:**

```typescript
const SECURE_ROUTE_CONFIG = {
  path: '/secure-data',
  method: HTTP.Methods.GET,
  authStrategies: [Authentication.STRATEGY_JWT],
  responses: jsonResponse({
    description: 'Protected data',
    schema: z.object({ message: z.string() }),
  }),
} as const;
```

**Multiple Strategies with Fallback (any mode):**

```typescript
const FALLBACK_AUTH_CONFIG = {
  path: '/api/data',
  method: HTTP.Methods.GET,
  authStrategies: [Authentication.STRATEGY_JWT, Authentication.STRATEGY_BASIC],
  authMode: 'any', // First successful strategy wins (default)
  responses: jsonResponse({
    description: 'Data accessible via JWT or Basic auth',
    schema: z.object({ data: z.any() }),
  }),
} as const;
```

**Multiple Strategies with MFA (all mode):**

```typescript
const MFA_CONFIG = {
  path: '/admin/sensitive',
  method: HTTP.Methods.POST,
  authStrategies: [Authentication.STRATEGY_JWT, Authentication.STRATEGY_MFA],
  authMode: 'all', // All strategies must pass
  responses: jsonResponse({
    description: 'Requires both JWT and MFA',
    schema: z.object({ success: z.boolean() }),
  }),
} as const;
```

**Skipping Authentication:**

```typescript
const PUBLIC_ROUTE_CONFIG = {
  path: '/public',
  method: HTTP.Methods.GET,
  skipAuth: true, // Bypass authentication even if controller has default auth
  responses: jsonResponse({
    description: 'Public endpoint',
    schema: z.object({ message: z.string() }),
  }),
} as const;
```

#### 5. Accessing the Current User in Context

After authentication, the user payload is available on the Hono `Context`:

```typescript
import { Context } from 'hono';
import { Authentication, IJWTTokenPayload } from '@venizia/ignis';

// Inside a route handler
const user = c.get(Authentication.CURRENT_USER) as IJWTTokenPayload | undefined;

if (user) {
  console.log('Authenticated user ID:', user.userId);
  console.log('User roles:', user.roles);
}
```

#### 6. Dynamic Skip Authentication

Use `Authentication.SKIP_AUTHENTICATION` to dynamically skip auth in middleware:

```typescript
import { Authentication } from '@venizia/ignis';
import { createMiddleware } from 'hono/factory';

const conditionalAuthMiddleware = createMiddleware(async (c, next) => {
  // Skip auth for certain conditions
  if (c.req.header('X-API-Key') === 'valid-api-key') {
    c.set(Authentication.SKIP_AUTHENTICATION, true);
  }
  return next();
});
```

## See Also

- **Related Concepts:**
  - [Components Overview](/guides/core-concepts/components) - Component system basics
  - [Controllers](/guides/core-concepts/controllers) - Protecting routes with auth

- **Other Components:**
  - [Components Index](./index) - All built-in components

- **References:**
  - [Middlewares](/references/base/middlewares) - Custom authentication middleware
  - [Crypto Helper](/references/helpers/crypto) - Password hashing utilities

- **Best Practices:**
  - [Security Guidelines](/best-practices/security-guidelines) - Authentication best practices

- **Tutorials:**
  - [Building a CRUD API](/guides/tutorials/building-a-crud-api) - Adding authentication
