# Authentication and Authorization

## 1. Feature Overview

- **Feature Name:** Authentication and Authorization
- **Purpose:** To provide a secure and flexible way to authenticate users and control access to resources based on their roles and permissions.
- **Background:** Modern web applications require a robust authentication and authorization system to protect sensitive data and restrict actions to authorized users. This feature provides a complete, JWT-based solution for these needs within the Ignis framework.
- **Related Features/Modules:** This feature is deeply integrated with the core of the framework, including `base/applications`, `base/controllers`, and the dependency injection system.

## 2. Functional Specifications

- **JWT-based Authentication:** The system uses JSON Web Tokens (JWT) for stateless, secure authentication.
- **Role-Based Access Control (RBAC):** Access to specific routes can be restricted to users with certain roles.
- **Pluggable Authentication Strategies:** The framework is designed to be extensible with different authentication strategies. The primary built-in strategy is JWT.
- **Secure Token Handling:** Implements secure generation and verification of tokens using the `jose` library.
- **Current User Injection:** Provides a `@CurrentUser` decorator to easily inject the authenticated user object into controllers and services.

## 3. Design and Architecture

- **`AuthenticateComponent`:** The main component for the authentication feature. It registers all necessary services and controllers.
- **`AuthenticationStrategyRegistry`:** A singleton registry that manages available authentication strategies.
- **`JWTAuthenticationStrategy`:** The implementation for the JWT authentication strategy. It uses the `JWTTokenService` to verify tokens.
- **`JWTTokenService`:** A service responsible for generating, verifying, and encrypting/decrypting JWT payloads.
- **`defineAuthRoute`:** A helper method in `BaseController` to secure a route by specifying authentication strategies and required roles.
- **`AuthorizeMiddleware`:** A middleware that checks if an authenticated user has the required roles.
- **`@CurrentUser` decorator:** A decorator to inject the current user into class constructors.

## 4. Implementation Details

### Tech Stack
- **Hono:** The underlying web framework.
- **`jose`:** For JWT signing, verification, and encryption.
- **Winston:** For logging.

### Configuration

Configure the authentication feature using environment variables:

- `APP_ENV_APPLICATION_SECRET`: A secret for encrypting the JWT payload.
- `APP_ENV_JWT_SECRET`: The secret for signing and verifying the JWT signature.
- `APP_ENV_JWT_EXPIRES_IN`: The JWT expiration time in seconds.

Example `.env` file:
```
APP_ENV_APPLICATION_SECRET=your-strong-application-secret
APP_ENV_JWT_SECRET=your-strong-jwt-secret
APP_ENV_JWT_EXPIRES_IN=86400
```

### Code Samples

#### 1. Registering the Authentication Component

In `src/application.ts`, register the `AuthenticateComponent` and the `JWTAuthenticationStrategy`.

```typescript
// src/application.ts
import {
  AuthenticateComponent,
  Authentication,
  AuthenticationStrategyRegistry,
  JWTAuthenticationStrategy,
} from '@vez/ignis';

// ... in your Application class
  registerAuth() {
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
```

#### 2. Securing Routes

In your controllers, use `defineAuthRoute` to protect endpoints.

```typescript
// src/controllers/test.controller.ts
import {
  Authentication,
  BaseController,
  controller,
  ERole,
} from '@vez/ignis';

@controller({ path: '/test' })
export class TestController extends BaseController {
  // ...

  override binding(): ValueOrPromise<void> {
    // Requires a valid JWT
    this.defineAuthRoute({
      configs: {
        path: '/secure-data',
        method: 'get',
        authStrategies: [Authentication.STRATEGY_JWT],
      },
      handler: (c) => c.json({ data: 'This is protected data' }),
    });

    // Requires a valid JWT and the 'admin' role
    this.defineAuthRoute({
      configs: {
        path: '/admin-only',
        method: 'get',
        authStrategies: [Authentication.STRATEGY_JWT],
        roles: [ERole.Admin],
      },
      handler: (c) => c.json({ message: 'Welcome, admin!' }),
    });
  }
}
```

#### 3. Injecting the Current User

Use the `@CurrentUser` decorator to inject the authenticated user into your services or controllers.

```typescript
import { BaseService, CurrentUser, TJwtPayload } from '@vez/ignis';

export class MyService extends BaseService {
  constructor(
    @CurrentUser() private readonly getCurrentUser: () => TJwtPayload | undefined,
  ) {
    super({ scope: 'MyService' });
  }

  doSomething() {
    const user = this.getCurrentUser();
    if (user) {
      console.log(`Doing something for user ${user.id}`);
    } else {
      console.log('No user is authenticated.');
    }
  }
}
```

## 6. Testing and Validation

You can write tests for your protected endpoints by providing a valid JWT in the `Authorization` header of your test requests.

Here's an example of a test case for a protected route using `vitest`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { app } from '../src/index'; // Your app instance
import { JWTTokenService } from '@vez/ignis';

describe('Protected Routes', () => {
  let token: string;

  beforeAll(async () => {
    // Generate a token for testing
    const tokenService = new JWTTokenService({
      jwtSecret: 'test-secret',
      applicationSecret: 'test-app-secret',
      getTokenExpiresFn: () => 3600,
    });
    token = await tokenService.generate({ payload: { userId: '123', roles: [{id: 1, identifier: 'user', priority: 1}] } });
  });

  it('should return 401 for unauthorized access', async () => {
    const res = await app.request('/test/secure-data');
    expect(res.status).toBe(401);
  });

  it('should return 200 for authorized access', async () => {
    const res = await app.request('/test/secure-data', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: 'This is protected data' });
  });
});
```