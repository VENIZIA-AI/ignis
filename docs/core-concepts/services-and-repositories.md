# Services and Repositories

In the Ignis framework, the application's logic is organized into two main layers: **Services** and **Repositories**. This separation of concerns is a key principle of the framework's architecture, promoting clean, maintainable, and testable code.

## Repositories: The Data Access Layer

Repositories are responsible for all communication with your data sources (e.g., databases, external APIs). Their primary role is to abstract the data access logic, providing a simple, consistent API for the rest of your application to interact with the data.

### Creating a Repository

To create a repository, you should extend the `BaseRepository` or `DefaultCrudRepository` class (if you are using a SQL database with Drizzle ORM).

```typescript
import { DefaultCrudRepository } from '@vez/ignis';
import { users, User } from '../models/user.model'; // Your Drizzle schema

export class UserRepository extends DefaultCrudRepository<User> {
  constructor(
    // Inject your data source
  ) {
    super(users);
  }

  // You can add custom data access methods here
  async findByEmail(email: string): Promise<User | undefined> {
    // ... logic to find a user by email
  }
}
```

By using repositories, you can easily switch out your data source without having to change your business logic.

## Services: The Business Logic Layer

Services contain the core business logic of your application. They orchestrate the flow of data and execute the application's use cases. Services use repositories to interact with the data layer, but they should not contain any direct data access code themselves.

### Creating a Service

To create a service, you extend the `BaseService` or `BaseCrudService` class.

```typescript
import { BaseService, inject } from '@vez/ignis';
import { UserRepository } from '../repositories/user.repository';

export class UserService extends BaseService {
  constructor(
    @inject({ key: 'repositories.UserRepository' }) private userRepository: UserRepository,
  ) {
    super({ scope: UserService.name });
  }

  async createUser(data: { name: string; email: string }): Promise<User> {
    // Business logic, e.g., validate input, check for duplicates
    const existingUser = await this.userRepository.findByEmail(data.email);
    if (existingUser) {
      throw new Error('User with this email already exists.');
    }

    // Use the repository to create the user
    return this.userRepository.create(data);
  }
}
```

## How They Work Together

1.  A **Controller** receives an HTTP request.
2.  The controller calls a method on a **Service** to handle the request.
3.  The **Service** executes the business logic. If it needs to interact with the database, it calls methods on a **Repository**.
4.  The **Repository** performs the CRUD (Create, Read, Update, Delete) operations on the data source.
5.  The data flows back up the chain to the controller, which then sends a response to the client.

This layered architecture makes your application:

-   **More Organized:** Each layer has a clear responsibility.
-   **Easier to Test:** You can test your business logic (services) independently of your data access logic (repositories) by mocking the repositories.
-   **More Flexible:** You can change your database or data access implementation without affecting your business logic.
