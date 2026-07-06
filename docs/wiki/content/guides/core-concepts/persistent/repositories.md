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
    @inject({ key: 'services.CacheService' })
    private cacheService: CacheService,
  ) {
    super(dataSource);
  }

  async findByRealm(opts: { realm: string }) {
    // Use injected dependencies
    const cached = await this.cacheService.get(`user:realm:${opts.realm}`);
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

## Repository Hierarchy

```
AbstractRepository (engine-neutral base in src/base - lazy dataSource/entity resolution,
                    @model settings getters: hiddenProperties, defaultFilter, defaultLimit)
  ↓
PostgresBaseRepository (postgres connector - filter building, hidden-column exclusion,
                        default-filter merging, transaction-aware connector resolution)
  ↓
ReadableRepository (read-only: find, findOne, findById, count, existsWith)
  ↓
PersistableRepository (+ create, createAll, updateById, updateAll, deleteById, deleteAll)
  ↓
DefaultCRUDRepository (no additional methods - recommended default)
  ↓
SoftDeletableRepository (overrides delete to set deletedAt timestamp)
```

| Type | Description |
|------|-------------|
| `ReadableRepository` | Read-only operations. Write operations throw errors. |
| `PersistableRepository` | Read + write operations (create, update, delete). Extends ReadableRepository. |
| `DefaultCRUDRepository` | Extends PersistableRepository with no additional logic. **Recommended for most use cases.** |
| `SoftDeletableRepository` | Extends DefaultCRUDRepository. Overrides delete to set `deletedAt` timestamp instead of physically removing records. |

## Querying Data

For advanced filtering with operators like `gt`, `lt`, `like`, `in`, `between`, and more, see [Filter System](../../../references/base/filter-system/).

Return shapes: read methods return values directly (`find` returns an array, `findOne`/`findById` return a record or `null`, `count` returns `{ count }`), while write methods (`create`, `updateById`, `deleteById`, ...) return a `{ count, data }` envelope.

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

// Create a record - write operations return a { count, data } envelope
const { data: newConfig } = await repo.create({
  data: {
    code: 'NEW_SETTING',
    group: 'SYSTEM',
    description: 'A new setting',
  }
});

// Update by ID - also returns { count, data }
const { data: updatedConfig } = await repo.updateById({
  id: 'uuid-here',
  data: { description: 'Updated description' }
});

// Delete by ID - also returns { count, data }
await repo.deleteById({ id: 'uuid-here' });
```

## Extra Options

All repository operations accept an `options` parameter with these fields:

| Option | Type | Description |
| :--- | :--- | :--- |
| `transaction` | `IDatabaseTransaction` | Transaction context for atomic operations |
| `shouldReturn` | `boolean` | Write methods only - whether to return created/updated data (default: `true`) |
| `shouldQueryRange` | `boolean` | `find` only - return `{ data, range: { start, end, total } }` for pagination |
| `shouldSkipDefaultFilter` | `boolean` | Bypass the model's default filter (e.g., soft delete) |
| `force` | `boolean` | `updateAll`/`deleteAll` only - allow an empty `where` (table-wide operation) |
| `lock` | `TLockOptions` | Row-level locking for reads (`{ strength: 'update' }`, ...). Requires a transaction; incompatible with `include`/`fields` |
| `log` | `TRepositoryLogOptions` | Per-operation logging (`{ use: true, level?: 'info' }`) |

```typescript
// Create without returning data (faster)
await repo.create({
  data: { code: 'SETTING', group: 'SYSTEM' },
  options: { shouldReturn: false },
});

// Bulk create multiple records
await repo.createAll({
  data: [
    { code: 'SETTING_A', group: 'SYSTEM' },
    { code: 'SETTING_B', group: 'SYSTEM' },
  ],
});

// Query with pagination range
const result = await repo.find({
  filter: { limit: 20, skip: 0 },
  options: { shouldQueryRange: true }
});
// result = { data: [...], range: { start: 0, end: 19, total: 150 } }
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

console.log('Created by:', configWithCreator?.creator.name);
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

## SoftDeletableRepository

For soft-delete patterns, use `SoftDeletableRepository` which overrides delete operations to set a `deletedAt` timestamp instead of physically removing records:

```typescript
import {
  BasePostgresEntity,
  generateIdColumnDefs,
  generateTzColumnDefs,
  model,
  repository,
  SoftDeletableRepository,
} from '@venizia/ignis';
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

@model({
  type: 'entity',
  settings: {
    hiddenProperties: ['deletedAt'],
    defaultFilter: { where: { deletedAt: null } },
  },
})
export class Category extends BasePostgresEntity<typeof Category.schema> {
  static override schema = pgTable('Category', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    ...generateTzColumnDefs(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    name: text('name').notNull(),
  });
}

@repository({ dataSource: PostgresDataSource, model: Category })
export class CategoryRepository extends SoftDeletableRepository<typeof Category.schema> {}
```

Delete operations accept `shouldHardDelete: true` in options to physically remove a row, and soft-deleted records can be restored via `restoreById`/`restoreAll`.

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

IGNIS automatically optimizes "flat" queries (no relations, no field selection) by using Drizzle's Core API. This provides **~15-20% faster** queries for simple reads. The `canUseCoreAPI()` method on `ReadableRepository` determines when this optimization applies.

### Modular Persistence with Components

Bundle related persistence resources into Components for better organization:

```typescript
export class UserManagementComponent extends BaseComponent {
  override binding() {
    this._application.dataSource(PostgresDataSource);
    this._application.repository(UserRepository);
    this._application.repository(ProfileRepository);
  }
}
```

> **Deep Dive:** See [Repository Reference](../../../references/base/repositories/) for filtering operators, relations, JSON path queries, and array operators.

## See Also

- **Related Concepts:**
  - [Models](/guides/core-concepts/persistent/models) - Entity definitions used by repositories
  - [DataSources](/guides/core-concepts/persistent/datasources) - Database connections
  - [Services](/guides/core-concepts/services) - Use repositories for data access
  - [Transactions](/guides/core-concepts/persistent/transactions) - Multi-operation consistency

- **References:**
  - [Repositories API](/references/base/repositories/) - Complete API reference
  - [Filter System](/references/base/filter-system/) - Query operators and filtering
  - [Relations & Includes](/references/base/repositories/relations) - Loading related data
  - [Advanced Features](/references/base/repositories/advanced) - JSON queries, performance tuning

- **Best Practices:**
  - [Data Modeling](/best-practices/data-modeling) - Repository design patterns
  - [Performance Optimization](/best-practices/performance-optimization) - Query optimization

- **Tutorials:**
  - [Building a CRUD API](/guides/tutorials/building-a-crud-api) - Repository examples
  - [E-commerce API](/guides/tutorials/ecommerce-api) - Advanced queries and relations
