# Guide: Testing Your Application

Testing is a crucial part of building robust and reliable applications. The Ignis framework is designed to be highly testable, and it provides a set of utilities to help you write unit and integration tests for your application. This guide uses `vitest` for examples, but you can use any testing framework you prefer.

## Unit Testing

Unit tests focus on testing individual units of code in isolation, such as services, helpers, or utility functions.

### Testing a Service

When testing a service, you should mock its dependencies (like repositories) to isolate the business logic.

Here's an example of testing a `UserService`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { UserService } from '../services/user.service';
import { UserRepository } from '../repositories/user.repository';

describe('UserService', () => {
  it('should create a new user', async () => {
    // 1. Mock the repository
    const mockUserRepository = {
      findByEmail: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((data) => Promise.resolve({ id: 1, ...data })),
    };

    // 2. Instantiate the service with the mock repository
    const userService = new UserService(mockUserRepository as any);

    // 3. Call the method to be tested
    const newUser = await userService.createUser({
      name: 'John Doe',
      email: 'john.doe@example.com',
    });

    // 4. Assert the results
    expect(newUser).toBeDefined();
    expect(newUser.name).toBe('John Doe');
    expect(mockUserRepository.findByEmail).toHaveBeenCalledWith('john.doe@example.com');
    expect(mockUserRepository.create).toHaveBeenCalled();
  });
});
```

## Integration Testing

Integration tests focus on testing the interaction between different parts of your application, such as controllers, middlewares, and services. A common use case is testing your API endpoints.

### Testing a Controller

To test a controller, you can send HTTP requests to your application instance and assert the responses.

```typescript
import { describe, it, expect } from 'vitest';
import app from '../src/index'; // Your main application instance

describe('HelloController', () => {
  it('should return a hello message', async () => {
    const res = await app.request('/api/hello');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'Hello, World!' });
  });
});
```

### Testing Authenticated Endpoints

For endpoints that require authentication, you need to generate a valid JWT and include it in the `Authorization` header of your request.

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { JWTTokenService } from '@vez/ignis';
import app from '../src/index';

describe('Protected Routes', () => {
  let token: string;

  beforeAll(async () => {
    // You can use the JWTTokenService to generate a token for your tests
    const tokenService = new JWTTokenService({
      jwtSecret: process.env.APP_ENV_JWT_SECRET,
      applicationSecret: process.env.APP_ENV_APPLICATION_SECRET,
      getTokenExpiresFn: () => 3600,
    });
    token = await tokenService.generate({ payload: { userId: 'test-user', roles: [] } });
  });

  it('should return 401 for unauthorized access', async () => {
    const res = await app.request('/api/test/secure-data');
    expect(res.status).toBe(401);
  });

  it('should return 200 for authorized access', async () => {
    const res = await app.request('/api/test/secure-data', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    expect(res.status).toBe(200);
  });
});
```

## Testing Utilities

The `src/helpers/testing` directory contains utilities that can help you structure your tests. These utilities provide a way to define test plans and test cases in a declarative way, but their use is optional.

By following these patterns, you can write comprehensive tests for your Ignis application, ensuring its quality and correctness.
