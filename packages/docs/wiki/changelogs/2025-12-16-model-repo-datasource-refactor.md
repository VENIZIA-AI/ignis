---
title: Model-Repository-DataSource Refactor
description: Major architecture refactor following Loopback 4 patterns with auto-discovery
---

# Changelog - 2025-12-16

## Model-Repository-DataSource Architecture Refactor

Major architecture refactor following Loopback 4 patterns with auto-discovery.

## Overview

- **Self-Contained Models**: Model is self-contained with schema and relations.
- **Repository Auto-Resolution**: Repository connects Model to DataSource (defines the binding).
- **DataSource Auto-Discovery**: DataSource auto-discovers schemas from registered repositories.

## Breaking Changes

> [!WARNING]
> This section contains changes that require migration or manual updates to existing code.

### 1. Model Static Properties

**Before:**
```typescript
const userTable = pgTable('User', {...});
const userRelations = createRelations({...});

@model({ type: 'entity' })
export class User extends BaseEntity<typeof userTable> {
  constructor() {
    super({ name: 'User', schema: userTable });
  }
}
```

**After:**
```typescript
@model({ type: 'entity' })
export class User extends BaseEntity<typeof User.schema> {
  static override schema = pgTable('User', {...});
  static override relations = () => ({...});
}
```

### 2. Repository Constructor

**Before:**
```typescript
@repository({})
export class UserRepository extends DefaultCRUDRepository<typeof userTable> {
  constructor(@inject({ key: 'datasources.PostgresDataSource' }) dataSource: IDataSource) {
    super({ dataSource, entityClass: User, relations: userRelations.definitions });
  }
}
```

**After:**
```typescript
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {
  // No constructor needed!
}
```

### 3. DataSource Schema

**Before:**
```typescript
@datasource({})
export class PostgresDataSource extends BaseDataSource {
  constructor() {
    super({
      name: PostgresDataSource.name,
      driver: 'node-postgres',
      config: {...},
      schema: { User: userTable, userRelations: userRelations.relations, ... },
    });
  }
}
```

**After:**
```typescript
@datasource({ driver: 'node-postgres' })
export class PostgresDataSource extends BaseDataSource {
  constructor() {
    super({
      name: PostgresDataSource.name,
      driver: 'node-postgres',
      config: {...},
      // NO schema - auto-discovered!
    });
  }
}
```

## New Features

### Self-Contained Models

**File:** `packages/core/src/base/models/base.ts`

**Problem:** Models were defined in three separate declarations (table, relations, class).

**Solution:** Models now define schema and relations as static properties.

```typescript
@model({ type: 'entity' })
export class Configuration extends BaseEntity<typeof Configuration.schema> {
  static override schema = pgTable('Configuration', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    ...generateTzColumnDefs(),
    code: text('code').notNull(),
    group: text('group').notNull(),
  });

  static override relations = () => ({
    creator: {
      type: 'one' as const,
      target: () => User,
      fields: [Configuration.schema.createdBy],
      references: () => [User.schema.id],
    },
  });
}
```

**Benefits:**
- Simplified Model Definition
- Better Type Safety

### Repository Auto-Resolution

**File:** `packages/core/src/base/repositories/core/base.ts`

**Problem:** Repositories required explicit constructor injection and parameter passing.

**Solution:** Repositories now use `@repository` decorator for model-datasource binding.

```typescript
@repository({
  model: Configuration,
  dataSource: PostgresDataSource,
})
export class ConfigurationRepository extends DefaultCRUDRepository<typeof Configuration.schema> {
  // No constructor needed!

  async findByCode(code: string) {
    return this.findOne({ filter: { where: { code } } });
  }
}
```

**Benefits:**
- Reduced Boilerplate
- Clear Repository Role

### DataSource Auto-Discovery

**File:** `packages/core/src/base/datasources/base.ts`

**Problem:** DataSources required manual schema registration of every model and relation.

**Solution:** DataSources automatically discover their schema from repository bindings.

```typescript
@datasource({ driver: 'node-postgres' })
export class PostgresDataSource extends BaseDataSource<TNodePostgresConnector, IDSConfigs> {
  constructor() {
    super({
      name: PostgresDataSource.name,
      driver: 'node-postgres',
      config: { /* connection config */ },
      // NO schema property - auto-discovered!
    });
  }

  override configure(): ValueOrPromise<void> {
    const schema = this.getSchema(); // Auto-discovers from @repository bindings
    this.connector = drizzle({ client: new Pool(this.settings), schema });
  }
}
```

**Benefits:**
- No Manual Schema Registration
- Decoupled Models and DataSources

## Files Changed

### Core Package (`packages/core`)

| File | Changes |
|------|---------|
| `src/base/models/base.ts` | Added static `schema`, `relations`, `TABLE_NAME` |
| `src/base/datasources/base.ts` | Added auto-discovery via `buildAutoDiscoveredSchema()` |
| `src/base/repositories/core/base.ts` | Added lazy resolution, static container reference |
| `src/base/repositories/core/readable.ts` | Made constructor opts optional |
| `src/base/repositories/core/persistable.ts` | Made constructor opts optional |
| `src/base/repositories/core/default-crud.ts` | Added documentation |
| `src/base/metadata/persistents.ts` | Updated decorators for auto-discovery |
| `src/base/applications/base.ts` | Added `AbstractRepository.setContainer(this)` |
| `src/components/static-asset/models/base.model.ts` | Updated to new pattern |

### Helpers Package (`packages/helpers`)

| File | Changes |
|------|---------|
| `src/helpers/inversion/common/types.ts` | Added `IModelMetadata`, `IRelationDefinition`, `IModelStatic`, `IRepositoryMetadata`, `IRepositoryBinding` |
| `src/helpers/inversion/registry.ts` | Added `registerModel`, `registerRepositoryBinding`, `buildDataSourceSchema` |

### Examples (`examples/vert`)

| File | Changes |
|------|---------|
| `src/models/entities/user.model.ts` | Updated to static schema pattern |
| `src/models/entities/configuration.model.ts` | Updated to static schema pattern |
| `src/datasources/postgres.datasource.ts` | Removed manual schema registration |
| `src/repositories/user.repository.ts` | Updated to use `@repository` decorator |
| `src/repositories/configuration.repository.ts` | Updated to use `@repository` decorator |

## Migration Guide

> [!NOTE]
> Follow these steps if you're upgrading from a previous version.

### Step 1: Update Models

Update models to use static properties for schema and relations.

```typescript
// From
@model({ type: 'entity' })
export class User extends BaseEntity<typeof userTable> {
  constructor() {
    super({ name: 'User', schema: userTable });
  }
}

// To
@model({ type: 'entity' })
export class User extends BaseEntity<typeof User.schema> {
  static override schema = pgTable('User', {...});
  static override relations = () => ({...});
}
```

### Step 2: Update Repositories

Update repositories to use the `@repository` decorator with `model` and `dataSource`.

```typescript
// From
@repository({})
export class UserRepository extends DefaultCRUDRepository<typeof userTable> {
  constructor(@inject({ key: 'datasources.PostgresDataSource' }) dataSource: IDataSource) {
    super({ dataSource, entityClass: User, relations: userRelations.definitions });
  }
}

// To
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {
  // No constructor needed!
}
```

### Step 3: Update DataSources

Remove manual schema registration from DataSources.

```typescript
// From
@datasource({})
export class PostgresDataSource extends BaseDataSource {
  constructor() {
    super({
      name: PostgresDataSource.name,
      driver: 'node-postgres',
      config: {...},
      schema: { User: userTable, userRelations: userRelations.relations, ... },
    });
  }
}

// To
@datasource({ driver: 'node-postgres' })
export class PostgresDataSource extends BaseDataSource {
  constructor() {
    super({
      name: PostgresDataSource.name,
      driver: 'node-postgres',
      config: {...},
      // NO schema - auto-discovered!
    });
  }
}
```