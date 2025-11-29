# Services and Repositories

In the Ignis framework, the application's logic is organized into two main layers: **Services** and **Repositories**. This separation of concerns is a key principle of the framework's architecture, promoting clean, maintainable, and testable code.

## Repositories: The Data Access Layer

Repositories are responsible for all communication with your data sources (e.g., databases, external APIs). Their primary role is to abstract the data access logic, providing a simple, consistent API for the rest of your application to interact with the data.

### Creating a Repository

To create a repository, you should extend the `BaseRepository` or, for more feature-rich CRUD operations, the `DefaultCrudRepository` class. When using a SQL database with Drizzle ORM, `DefaultCrudRepository` provides a convenient starting point.

```typescript
import { DefaultCrudRepository, inject } from '@vez/ignis';
import { users, User } from '../models/user.model'; // Your Drizzle schema and model
import { MyDataSource } from '../datasources/my.datasource'; // Your datasource

export class UserRepository extends DefaultCrudRepository<
  typeof users, // Drizzle table schema
  User['id'],   // Type of the primary key
  User          // The model class
> {
  constructor(
    @inject({ key: 'datasources.MyDataSource' }) dataSource: MyDataSource,
  ) {
    super(users, dataSource);
  }

  // You can add custom data access methods here
  async findByEmail(email: string): Promise<User | undefined> {
    // ... logic to find a user by email using Drizzle
  }
}
```

By using repositories, you can easily switch out your data source without having to change your business logic.

### Querying Data with Filters

When retrieving data using methods like `find`, `findOne`, and `count`, you can use a powerful **filter** object to customize your queries. This object allows you to specify conditions, pagination, ordering, and which fields to return.

The filter object can contain the following properties:

- `where`: An object specifying the query conditions.
- `limit`: The maximum number of records to return.
- `offset` (or `skip`): The number of records to skip (for pagination).
- `order`: A string or an array of strings to define the sorting order (e.g., `'name ASC'`, `['name ASC', 'createdAt DESC']`).
- `fields`: An object to include or exclude specific fields.

#### The `where` Clause

The `where` clause is the most powerful part of the filter. It allows you to build complex queries using various operators.

**Example: Simple Equality**

To find all users with the status "active":

```typescript
const activeUsers = await userRepository.find({
  where: { status: 'active' },
});
```

**Using Operators**

For more complex queries, you can use operators within the `where` clause.

- `eq`: Equal
- `neq`: Not equal
- `gt`: Greater than
- `gte`: Greater than or equal to
- `lt`: Less than
- `lte`: Less than or equal to
- `inq`: In an array of values
- `nin`: Not in an array of values
- `like`: LIKE operator for string matching
- `ilike`: ILIKE operator (case-insensitive LIKE, PostgreSQL only)

**Operator Examples:**

Find users who are older than 21:
```typescript
const adults = await userRepository.find({
  where: { age: { gt: 21 } },
});
```

Find users who are either admins or editors:
```typescript
const privilegedUsers = await userRepository.find({
  where: { role: { inq: ['admin', 'editor'] } },
});
```

**Logical Operators (`and`, `or`)**

You can combine multiple conditions using `and` and `or` at the top level of your `where` clause.

Find active users who are older than 21:
```typescript
const activeAdults = await userRepository.find({
  where: {
    and: [
      { status: 'active' },
      { age: { gt: 21 } },
    ],
  },
});
```

Find users who are either inactive or are admins:
```typescript
const inactiveOrAdmins = await userRepository.find({
  where: {
    or: [
      { status: 'inactive' },
      { role: 'admin' },
    ],
  },
});
```

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
