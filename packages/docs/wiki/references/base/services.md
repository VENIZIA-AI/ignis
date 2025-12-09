# Deep Dive: Services

Technical reference for `BaseService` - the foundation for business logic layers in Ignis.

**File:** `packages/core/src/base/services/base.ts`

## Quick Reference

| Feature | Benefit |
|---------|---------|
| **Extends `BaseHelper`** | Auto-configured scoped logger (`this.logger`) |
| **DI Integration** | Fits into framework's dependency injection system |
| **Business Logic Layer** | Bridge between Controllers and Repositories |

## `BaseService` Class

Abstract class that all application services should extend.

### Key Features

| Feature | Description |
| :--- | :--- |
| **Standardization** | Common base for all services, fits framework architecture |
| **Logging** | Extends `BaseHelper` - auto-configured logger at `this.logger` (scope = class name) |
| **Clarity** | Signals the class contains business logic |

### Class Definition

The implementation is straightforward:

```typescript
import { BaseHelper } from '../helpers';
import { IService } from './types';

export abstract class BaseService extends BaseHelper implements IService {
  constructor(opts: { scope: string }) {
    super({ scope: opts.scope });
  }
}
```

## How Services Fit into the Architecture

Services are the core of your application's logic. They act as a bridge between the presentation layer (Controllers) and the data access layer (Repositories).

### Typical Service Flow

1.  **Instantiated by DI Container**: When the application starts, the DI container creates instances of your services.
2.  **Dependencies Injected**: The service's constructor receives instances of any repositories or other services it depends on.
3.  **Called by a Controller**: An HTTP request comes into a controller, which then calls a method on a service to handle the business logic for that request.
4.  **Orchestrates Logic**: The service method executes the business logic. This may involve:
    -   Validating input data.
    -   Calling one or more repository methods to fetch or save data.
    -   Calling other services to perform related tasks.
    -   Performing calculations or data transformations.
5.  **Returns Data**: The service returns the result of the operation back to the controller, which then formats it into an HTTP response.

### Example

```typescript
import { BaseService, inject } from '@vez/ignis';
import { UserRepository } from '../repositories/user.repository';
import { TUser } from '../models/entities';

// 1. Service is decorated with `@injectable` (or registered via `app.service()`)
@injectable()
export class UserService extends BaseService {
  // 2. Dependencies (like UserRepository) are injected
  constructor(
    @inject({ key: 'repositories.UserRepository' })
    private userRepository: UserRepository,
  ) {
    super({ scope: UserService.name });
  }

  // 3. Method is called by a controller
  async getUserProfile(userId: string): Promise<Partial<TUser>> {
    this.logger.info(`Fetching profile for user ${userId}`);

    // 4. Orchestrates logic: calls the repository
    const user = await this.userRepository.findById({ id: userId });

    if (!user) {
      throw new Error('User not found');
    }

    // 5. Returns transformed data
    return {
      id: user.id,
      name: user.name, // Assuming a 'name' field exists
      email: user.email,
    };
  }
}
```

By adhering to this pattern, you keep your code organized, testable, and maintainable. You can easily test `UserService` by providing a mock `UserRepository` without needing a real database connection.
