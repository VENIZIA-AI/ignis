# Authentication Component

The Authentication component provides a robust, JWT-based authentication and authorization system for your Ignis application. It is designed to be extensible, allowing you to use different authentication strategies.

## Design and Architecture

-   **`AuthenticateComponent`:** The main component for the authentication feature. It registers all necessary services and controllers.
-   **`AuthenticationStrategyRegistry`:** A singleton registry that manages available authentication strategies.
-   **`JWTAuthenticationStrategy`:** The implementation for the JWT authentication strategy. It uses the `JWTTokenService` to verify tokens.
-   **`JWTTokenService`:** A service responsible for generating, verifying, and encrypting/decrypting JWT payloads.
-   **`defineAuthRoute`:** A helper method in `BaseController` to secure a route by specifying authentication strategies and required roles. This method ensures that the authenticated user's payload is attached to the Hono `Context` using the key `Authentication.CURRENT_USER`.
-   **`AuthorizeMiddleware`:** A middleware that checks if an authenticated user has the required roles.

## Implementation Details

### Tech Stack

-   **Hono**
-   **`jose`:** For JWT signing, verification, and encryption.
-   **`@vez/ignis`**: The core framework.

### Configuration

Configure the authentication feature using environment variables:

-   `APP_ENV_APPLICATION_SECRET`: A secret for encrypting the JWT payload.
-   `APP_ENV_JWT_SECRET`: The secret for signing and verifying the JWT signature.
-   `APP_ENV_JWT_EXPIRES_IN`: The JWT expiration time in seconds.

**Example `.env` file:**

```env
APP_ENV_APPLICATION_SECRET=your-strong-application-secret
APP_ENV_JWT_SECRET=your-strong-jwt-secret
APP_ENV_JWT_EXPIRES_IN=86400
```

### Code Samples

#### 1. Registering the Authentication Component

In `src/application.ts`, register the `AuthenticateComponent` and the `JWTAuthenticationStrategy`. You also need to provide an `AuthenticationService`.

```typescript
// src/application.ts
import {
  AuthenticateComponent,
  Authentication,
  AuthenticationStrategyRegistry,
  JWTAuthenticationStrategy,
  BaseApplication,
  ValueOrPromise,
} from '@vez/ignis';
import { AuthenticationService } from './services'; // Your custom auth service

export class Application extends BaseApplication {
  // ...

  registerAuth() {
    this.service(AuthenticationService);
    this.component(AuthenticateComponent);
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

#### 2. Securing Routes

In your controllers, use `defineAuthRoute` to protect endpoints. This method will automatically run the necessary authentication middlewares and attach the authenticated user to the Hono `Context`.

```typescript
// src/controllers/test.controller.ts
import {
  Authentication,
  BaseController,
  controller,
  HTTP,
  IControllerOptions,
  jsonContent,
  ValueOrPromise,
  IJWTTokenPayload,
} from '@vez/ignis';
import { Context } from 'hono';
import { z } from '@hono/zod-openapi';

@controller({ path: '/test' })
export class TestController extends BaseController {
  constructor(opts: IControllerOptions) {
    super({
      ...opts,
      scope: TestController.name,
      path: '/test',
    });
  }

  override binding(): ValueOrPromise<void> {
    // Requires a valid JWT
    this.defineAuthRoute({
      configs: {
        path: '/secure-data',
        method: 'get',
        authStrategies: [Authentication.STRATEGY_JWT],
        responses: {
            [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
            description: 'Test message content',
            schema: z.object({ message: z.string() }),
          }),
        },
      },
      handler: (c: Context) => { // Access context directly
        const user = c.get(Authentication.CURRENT_USER) as IJWTTokenPayload | undefined;
        return c.json({ message: `Hello, ${user?.userId || 'guest'} from protected data` });
      },
    });
  }
}
```

#### 3. Accessing the Current User in Context

After a route has been processed by `defineAuthRoute`, the authenticated user's payload is available directly on the Hono `Context` object, using the `Authentication.CURRENT_USER` key.

```typescript
import { Context } from 'hono';
import { Authentication, IJWTTokenPayload } from '@vez/ignis';

// Inside a route handler or a custom middleware
const user = c.get(Authentication.CURRENT_USER) as IJWTTokenPayload | undefined;

if (user) {
  console.log('Authenticated user ID:', user.userId);
  // You can also access roles, email, etc. from the user object
} else {
  console.log('User is not authenticated or not found in context.');
}
```
