# Services and Repositories

In the Ignis framework, the application's logic is organized into two main layers: **Services** and **Repositories**. This separation of concerns is a key principle of the framework's architecture, promoting clean, maintainable, and testable code.

## Repositories: The Data Access Layer

Repositories are responsible for all communication with your data sources (e.g., databases, external APIs). Their primary role is to abstract the data access logic, providing a simple, consistent API for the rest of your application to interact with the data.

### Creating a Repository

To create a repository, you should extend the `ViewRepository` class. This provides basic CRUD operations and is intended for Drizzle ORM integration.

```typescript
import { ViewRepository, inject, repository } from '@vez/ignis';
import { PostgresDataSource } from '../datasources'; // Your datasource
import { Configuration, TConfigurationSchema } from '../models/entities'; // Your Drizzle schema and model

@repository({})
export class ConfigurationRepository extends ViewRepository<TConfigurationSchema> {
  constructor(
    @inject({ key: 'datasources.PostgresDataSource' })
    dataSource: PostgresDataSource,
  ) {
    super({ dataSource, entityClass: Configuration });
  }

  // You can add custom data access methods here
  async findByCode(code: string): Promise<Configuration | undefined> {
    // ... logic to find a configuration by code using Drizzle
    // Example: this.queryApi.select().from(this.schema).where(eq(this.schema.code, code));
    return undefined; // Placeholder
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
- `order`: A string or an array of strings to define the sorting order (e.g., `'code ASC'`, `['code ASC', 'createdAt DESC']`).
- `fields`: An object to include or exclude specific fields.

#### The `where` Clause

The `where` clause is the most powerful part of the filter. It allows you to build complex queries using various operators.

**Example: Simple Equality**

To find all configurations with a specific data type:

```typescript
const textConfigurations = await configurationRepository.find({
  where: { dataType: 'text' },
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

Find configurations with a numeric value greater than 100:
```typescript
const largeNumberConfigs = await configurationRepository.find({
  where: { nValue: { gt: 100 } },
});
```

Find configurations with codes that are either 'CODE_1' or 'CODE_2':
```typescript
const specificCodeConfigs = await configurationRepository.find({
  where: { code: { inq: ['CODE_1', 'CODE_2'] } },
});
```

**Logical Operators (`and`, `or`)**

You can combine multiple conditions using `and` and `or` at the top level of your `where` clause.

Find configurations with a 'text' data type and a numeric value greater than 50:
```typescript
const filteredConfigs = await configurationRepository.find({
  where: {
    and: [
      { dataType: 'text' },
      { nValue: { gt: 50 } },
    ],
  },
});
```

Find configurations that are either inactive or have a boolean value of `true`:
```typescript
const complexConfigs = await configurationRepository.find({
  where: {
    or: [
      { active: false }, // Assuming 'active' field exists
      { boValue: true },
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
import { ConfigurationRepository } from '../repositories';
import { Configuration, TConfiguration } from '../models/entities';

export class ConfigurationService extends BaseService {
  constructor(
    @inject({ key: 'repositories.ConfigurationRepository' }) private configurationRepository: ConfigurationRepository,
  ) {
    super({ scope: ConfigurationService.name });
  }

  async createConfiguration(data: {
    code: string;
    dataType?: string;
    nValue?: number;
    tValue?: string;
    bValue?: Buffer;
    jValue?: any;
    boValue?: boolean;
  }): Promise<TConfiguration> {
    // Business logic, e.g., validate input, check for duplicates
    const existingConfig = await this.configurationRepository.findByCode(data.code);
    if (existingConfig) {
      throw new Error('Configuration with this code already exists.');
    }

    // Use the repository to create the configuration
    return this.configurationRepository.create(data as Configuration);
  }

  async getConfigurationByCode(code: string): Promise<TConfiguration | undefined> {
    return this.configurationRepository.findByCode(code);
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
