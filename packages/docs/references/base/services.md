# Deep Dive: Services

This document provides a technical overview of the `BaseService` class, the foundation for creating business logic layers in an Ignis application.

## `BaseService` Class

The `BaseService` is a simple abstract class that all of your application's services should extend.

-   **File:** `packages/core/src/base/services/base.ts`

### Purpose and Features

| Feature | Description |
| :--- | :--- |
| **Standardization** | It provides a common base for all services, ensuring they fit into the framework's architecture and DI system. |
| **Logging** | It extends `BaseHelper`, which means every service automatically gets a pre-configured, scoped logger instance available at `this.logger`. The scope is automatically set to the service's class name. |
| **Clarity** | By extending `BaseService`, you clearly signal that the purpose of the class is to contain business logic. |

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
