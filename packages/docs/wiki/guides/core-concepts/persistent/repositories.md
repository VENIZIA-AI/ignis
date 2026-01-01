# Repositories

Repositories provide type-safe CRUD operations. Use `@repository` decorator with both `model` and `dataSource` for auto-discovery.

## Pattern 1: Zero Boilerplate (Recommended)

The simplest approach - everything is auto-resolved:

```typescript
// src/repositories/configuration.repository.ts
import { Configuration } from '@/models/entities';
import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { DefaultCRUDRepository, repository } from '@venizia/ignis';

@repository({
  model: Configuration,
  dataSource: PostgresDataSource,
})
export class ConfigurationRepository extends DefaultCRUDRepository<typeof Configuration.schema> {
  // No constructor needed!

  async findByCode(opts: { code: string }) {
    return this.findOne({ filter: { where: { code: opts.code } } });
  }

  async findByGroup(opts: { group: string }) {
    return this.find({ filter: { where: { group: opts.group } } });
  }
}
```

## Pattern 2: Explicit @inject

When you need constructor control (e.g., read-only repository or additional dependencies):

```typescript
// src/repositories/user.repository.ts
import { User } from '@/models/entities';
import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { inject, ReadableRepository, repository } from '@venizia/ignis';
import { CacheService } from '@/services/cache.service';

@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends ReadableRepository<typeof User.schema> {
  constructor(
    // First parameter MUST be DataSource injection
    @inject({ key: 'datasources.PostgresDataSource' })
    dataSource: PostgresDataSource, // Must be concrete type, not 'any'

    // After first arg, you can inject any additional dependencies
    @inject({ key: 'some.cache' })
    private cache: SomeCache,
  ) {
    super(dataSource);
  }

  async findByRealm(opts: { realm: string }) {
    // Use injected dependencies
    const cached = await this.cache.get(`user:realm:${opts.realm}`);
    if (cached) {
      return cached;
    }

    return this.findOne({ filter: { where: { realm: opts.realm } } });
  }
}
```

> **Important:**
> - First constructor parameter **MUST** be the DataSource injection
> - After the first argument, you can inject any additional dependencies you need
> - When `@inject` is at param index 0, auto-injection is skipped

## Repository Types

| Type | Description |
|------|-------------|
| `DefaultCRUDRepository` | Full read/write operations |
| `ReadableRepository` | Read-only operations |
| `PersistableRepository` | Write operations only |

## Querying Data

For advanced filtering with operators like `gt`, `lt`, `like`, `in`, `between`, and more, see [Filter System](../../../references/base/filter-system/).

```typescript
const repo = this.get<ConfigurationRepository>({ key: 'repositories.ConfigurationRepository' });

// Find multiple records
const configs = await repo.find({
  filter: {
    where: { group: 'SYSTEM' },
    limit: 10,
    order: ['createdAt DESC'],
  }
});

// Find one record
const config = await repo.findOne({
  filter: { where: { code: 'APP_NAME' } }
});

// Select specific fields (array format)
const configCodes = await repo.find({
  filter: {
    fields: ['id', 'code', 'group'],  // Only these fields returned
    limit: 100,
  }
});

// Order by JSON/JSONB nested fields
const sorted = await repo.find({
  filter: {
    order: ['metadata.priority DESC', 'createdAt ASC'],
  }
});

// Create a record
const newConfig = await repo.create({
  data: {
    code: 'NEW_SETTING',
    group: 'SYSTEM',
    description: 'A new setting',
  }
});

// Update by ID
await repo.updateById({
  id: 'uuid-here',
  data: { description: 'Updated description' }
});

// Delete by ID
await repo.deleteById({ id: 'uuid-here' });
```

## Querying with Relations

Use `include` to fetch related data. The relation name must match what you defined in `static relations`:

```typescript
const configWithCreator = await repo.findOne({
  filter: {
    where: { code: 'APP_NAME' },
    include: [{ relation: 'creator' }],
  },
});

console.log('Created by:', configWithCreator.creator.name);
```

## Registering Repositories

```typescript
// src/application.ts
export class Application extends BaseApplication {
  preConfigure(): ValueOrPromise<void> {
    this.dataSource(PostgresDataSource);
    this.repository(UserRepository);
    this.repository(ConfigurationRepository);
  }
}
```

## Repository Template

```typescript
import { DefaultCRUDRepository, repository } from '@venizia/ignis';
import { MyModel } from '@/models/entities';
import { PostgresDataSource } from '@/datasources/postgres.datasource';

@repository({ model: MyModel, dataSource: PostgresDataSource })
export class MyModelRepository extends DefaultCRUDRepository<typeof MyModel.schema> {}
```

## Advanced Topics

### Performance: Core API Optimization

Ignis automatically optimizes "flat" queries (no relations, no field selection) by using Drizzle's Core API. This provides **~15-20% faster** queries for simple reads.

### Modular Persistence with Components

Bundle related persistence resources into Components for better organization:

```typescript
export class UserManagementComponent extends BaseComponent {
  override binding() {
    this.application.dataSource(PostgresDataSource);
    this.application.repository(UserRepository);
    this.application.repository(ProfileRepository);
  }
}
```

> **Deep Dive:** See [Repository Reference](../../../references/base/repositories/) for filtering operators, relations, JSON path queries, and array operators.
