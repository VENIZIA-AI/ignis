# Authentication Component

JWT-based authentication and authorization system for Ignis applications.

## Quick Reference

| Component | Purpose |
|-----------|---------|
| **AuthenticateComponent** | Main component registering auth services and controllers |
| **AuthenticationStrategyRegistry** | Singleton managing available auth strategies |
| **JWTAuthenticationStrategy** | JWT verification using `JWTTokenService` |
| **JWTTokenService** | Generate, verify, encrypt/decrypt JWT tokens (safely handles undefined/null) |
| **IAuthService** | Interface for custom auth implementation (sign-in, sign-up) |
| **defineAuthController** | Factory function for creating custom auth controllers |

### Key Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `APP_ENV_APPLICATION_SECRET` | Encrypt JWT payload | ✅ Yes |
| `APP_ENV_JWT_SECRET` | Sign and verify JWT signature | ✅ Yes |
| `APP_ENV_JWT_EXPIRES_IN` | Token expiration (seconds) | Optional |

### Authentication Options Configuration

| Option | Type | Description |
|--------|------|-------------|
| `restOptions.useAuthController` | `boolean` | Enable/disable built-in auth controller (default: `false`) |
| `restOptions.controllerOpts` | `TDefineAuthControllerOpts` | Configuration for built-in auth controller (required if `useAuthController` is `true`) |
| `restOptions.controllerOpts.restPath` | `string` | Base path for auth endpoints (default: `/auth`) |
| `restOptions.controllerOpts.serviceKey` | `string` | Dependency injection key for auth service (default: `services.AuthenticationService`) |
| `restOptions.controllerOpts.requireAuthenticatedSignUp` | `boolean` | Whether sign-up requires authentication (default: `false`) |
| `restOptions.controllerOpts.payload` | `object` | Custom Zod schemas for request/response payloads |
| `alwaysAllowPaths` | `string[]` | Array of paths that bypass authentication |
| `tokenOptions` | `IJWTTokenServiceOptions` | JWT token configuration |

## Architecture Components

-   **`AuthenticateComponent`**: Registers all necessary services and optionally the authentication controller
-   **`AuthenticationStrategyRegistry`**: Singleton managing authentication strategies
-   **`JWTAuthenticationStrategy`**: JWT strategy implementation using `JWTTokenService`
-   **`JWTTokenService`**: Generates, verifies, encrypts/decrypts JWT payloads (handles undefined/null values safely)
-   **`defineAuthController`**: Factory function to create customizable authentication controller
-   **Protected Routes**: Use `authStrategies` in route configs to secure endpoints

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
Both `APP_ENV_APPLICATION_SECRET` and `APP_ENV_JWT_SECRET` are **mandatory**. For security purposes, you must set these to strong, unique secret values. The application will fail to start if these environment variables are missing or left empty.
:::

**Example `.env` file:**

```
APP_ENV_APPLICATION_SECRET=your-strong-application-secret
APP_ENV_JWT_SECRET=your-strong-jwt-secret
APP_ENV_JWT_EXPIRES_IN=86400
```

### Code Samples

#### 1. Registering the Authentication Component

In `src/application.ts`, register the `AuthenticateComponent` and the `JWTAuthenticationStrategy`. You also need to provide an `AuthenticationService`.

**Basic Setup (without built-in auth controller):**

```typescript
// src/application.ts
import {
  AuthenticateComponent,
  Authentication,
  AuthenticationStrategyRegistry,
  JWTAuthenticationStrategy,
  BaseApplication,
  ValueOrPromise,
} from '@venizia/ignis';
import { AuthenticationService } from './services'; // Your custom auth service

export class Application extends BaseApplication {
  // ...

  registerAuth() {
    this.service(AuthenticationService);
    this.component(AuthenticateComponent, {
      restOptions: {
        useAuthController: false, // Default: controller not registered
      },
      alwaysAllowPaths: [],
      tokenOptions: {
        applicationSecret: process.env.APP_ENV_APPLICATION_SECRET,
        jwtSecret: process.env.APP_ENV_JWT_SECRET,
        getTokenExpiresFn: () => Number(process.env.APP_ENV_JWT_EXPIRES_IN || 86400),
      },
    });
    AuthenticationStrategyRegistry.getInstance().register({
      container: this,
      name: Authentication.STRATEGY_JWT,
      strategy: JWTAuthenticationStrategy,
    });
  }

  preConfigure(): ValueOrPromise<void> {
    // ...
    this.registerAuth();
    // ...
  }
}
```

**Advanced Setup (with built-in auth controller):**

```typescript
import {
  AuthenticateComponent,
  Authentication,
  AuthenticationStrategyRegistry,
  JWTAuthenticationStrategy,
  BaseApplication,
  ValueOrPromise,
} from '@venizia/ignis';
import { z } from '@hono/zod-openapi';
import { AuthenticationService } from './services';

export class Application extends BaseApplication {
  // ...

  registerAuth() {
    this.service(AuthenticationService);
    this.component(AuthenticateComponent, {
      restOptions: {
        useAuthController: true, // Enable built-in auth controller
        controllerOpts: {
          restPath: '/auth', // Base path for auth endpoints
          serviceKey: 'services.AuthenticationService', // Default service key
          requireAuthenticatedSignUp: false, // Whether sign-up requires authentication
          payload: {
            signIn: {
              request: { 
                schema: z.object({
                  identifier: z.object({
                    type: z.string(),
                    value: z.string(),
                  }),
                  credential: z.object({
                    type: z.string(),
                    value: z.string(),
                  }),
                })
              },
              response: { 
                schema: z.object({
                  token: z.string(),
                })
              },
            },
            signUp: {
              request: { 
                schema: z.object({
                  username: z.string(),
                  email: z.string().email(),
                  password: z.string().min(8),
                })
              },
              response: { 
                schema: z.object({
                  token: z.string(),
                  userId: z.string(),
                })
              },
            },
            changePassword: {
              request: { 
                schema: z.object({
                  oldPassword: z.string(),
                  newPassword: z.string().min(8),
                })
              },
              response: { 
                schema: z.object({
                  success: z.boolean(),
                })
              },
            },
          },
        },
      },
      alwaysAllowPaths: [],
      tokenOptions: {
        applicationSecret: process.env.APP_ENV_APPLICATION_SECRET,
        jwtSecret: process.env.APP_ENV_JWT_SECRET,
        getTokenExpiresFn: () => Number(process.env.APP_ENV_JWT_EXPIRES_IN || 86400),
      },
    });
    AuthenticationStrategyRegistry.getInstance().register({
      container: this,
      name: Authentication.STRATEGY_JWT,
      strategy: JWTAuthenticationStrategy,
    });
  }

  preConfigure(): ValueOrPromise<void> {
    // ...
    this.registerAuth();
    // ...
  }
}
```

#### 2. Implementing an AuthenticationService

The `AuthenticateComponent` depends on a service that implements the `IAuthService` interface. You need to provide your own implementation for this service, which will contain your application's specific logic for user authentication.

Here is a minimal example of what this service might look like:

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

    // --- Your custom logic here ---
    // 1. Find the user by identifier (e.g., username or email).
    // 2. Verify the credential (e.g., check the password).
    // 3. If valid, create a JWT payload.
    const user = { id: 'user-id-from-db', roles: [] }; // Dummy user

    if (identifier.value !== 'test_username' || credential.value !== 'test_password') {
      throw getError({ message: 'Invalid credentials' });
    }
    // --- End of custom logic ---

    const payload: IJWTTokenPayload = {
      userId: user.id,
      roles: user.roles,
      // Add any other data you want in the token
    };

    const token = await this._jwtTokenService.generate({ payload });
    return { token };
  }

  async signUp(context: Context, opts: any): Promise<any> {
    // Implement your sign-up logic
    throw getError({ message: 'Method not implemented.' });
  }

  async changePassword(context: Context, opts: any): Promise<any> {
    // Implement your change password logic
    throw getError({ message: 'Method not implemented.' });
  }
}
```

This service is then registered in `application.ts` as shown in the previous step. It injects the `JWTTokenService` (provided by the `AuthenticateComponent`) to generate a token upon successful sign-in.

#### 3. Custom Authentication Controller (Optional)

If you need more control over the authentication endpoints, you can create a custom controller using the `defineAuthController` factory function.

```typescript
// src/controllers/custom-auth.controller.ts
import { defineAuthController } from '@venizia/ignis';
import { z } from '@hono/zod-openapi';

export const CustomAuthController = defineAuthController({
  restPath: '/api/auth',
  serviceKey: 'services.AuthenticationService',
  requireAuthenticatedSignUp: true, // Require authentication for sign-up
  payload: {
    signIn: {
      request: {
        schema: z.object({
          email: z.string().email(),
          password: z.string(),
        }),
      },
      response: {
        schema: z.object({
          token: z.string(),
          expiresIn: z.number(),
        }),
      },
    },
    signUp: {
      request: {
        schema: z.object({
          email: z.string().email(),
          password: z.string().min(8),
          firstName: z.string(),
          lastName: z.string(),
        }),
      },
      response: {
        schema: z.object({
          token: z.string(),
          userId: z.string(),
        }),
      },
    },
    changePassword: {
      request: {
        schema: z.object({
          currentPassword: z.string(),
          newPassword: z.string().min(8),
        }),
      },
      response: {
        schema: z.object({
          success: z.boolean(),
          message: z.string().optional(),
        }),
      },
    },
  },
});
```

Then register it in your application:

```typescript
// src/application.ts
import { CustomAuthController } from './controllers/custom-auth.controller';

export class Application extends BaseApplication {
  registerAuth() {
    this.service(AuthenticationService);
    this.component(AuthenticateComponent, {
      restOptions: { useAuthController: false }, // Disable built-in controller
      // ... other options
    });
    
    // Register your custom controller
    this.controller(CustomAuthController);
    
    AuthenticationStrategyRegistry.getInstance().register({
      container: this,
      name: Authentication.STRATEGY_JWT,
      strategy: JWTAuthenticationStrategy,
    });
  }
}
```

#### 4. Securing Routes

In your controllers, use decorator-based routing (`@get`, `@post`, etc.) with the `authStrategies` property in the `configs` object to protect endpoints. This will automatically run the necessary authentication middlewares and attach the authenticated user to the Hono `Context`, which can then be accessed type-safely using `TRouteContext`.

```typescript
// src/controllers/test.controller.ts
import {
  Authentication,
  BaseController,
  controller,
  get, // Or @api, @post, etc.
  HTTP,
  jsonResponse,
  IJWTTokenPayload,
  TRouteContext, // Import TRouteContext for type safety
} from '@venizia/ignis';
import { z } from '@hono/zod-openapi';

const SECURE_ROUTE_CONFIG = {
  path: '/secure-data',
  method: HTTP.Methods.GET,
  authStrategies: [Authentication.STRATEGY_JWT],
  responses: jsonResponse({
      description: 'Test message content',
      schema: z.object({ message: z.string() }),
  }),
} as const;

@controller({ path: '/test' })
export class TestController extends BaseController {
  constructor() {
    super({
      scope: TestController.name,
      path: '/test',
    });
  }

  @get({ configs: SECURE_ROUTE_CONFIG })
  secureData(c: TRouteContext<typeof SECURE_ROUTE_CONFIG>) {
    // 'c' is fully typed here, including c.get and c.json return type
    const user = c.get(Authentication.CURRENT_USER) as IJWTTokenPayload | undefined;
    return c.json(
      { message: `Hello, ${user?.userId || 'guest'} from protected data` },
      HTTP.ResultCodes.RS_2.Ok,
    );
  }
}
```

#### 5. Accessing the Current User in Context

After a route has been processed, the authenticated user's payload is available directly on the Hono `Context` object, using the `Authentication.CURRENT_USER` key.

```typescript
import { Context } from 'hono';
import { Authentication, IJWTTokenPayload } from '@venizia/ignis';

// Inside a route handler or a custom middleware
const user = c.get(Authentication.CURRENT_USER) as IJWTTokenPayload | undefined;

if (user) {
  console.log('Authenticated user ID:', user.userId);
  // You can also access roles, email, etc. from the user object
} else {
  console.log('User is not authenticated or not found in context.');
}
```
