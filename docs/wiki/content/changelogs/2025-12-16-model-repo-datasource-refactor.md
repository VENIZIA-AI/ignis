---
title: Model-Repository-DataSource Refactor
description: Models now carry their own schema and relations, repositories bind a model to a datasource with one decorator, and datasources find their schema on their own.
packages: ['@venizia/ignis', '@venizia/ignis-helpers']
---

# Changelog - 2025-12-16

## Model-Repository-DataSource Refactor

**In one line.** You write less boilerplate: a model holds its schema and relations, a repository is one decorator, and a datasource discovers its schema from the repositories.

## What changed

- **Self-contained models.** Set `static override schema` and `static override relations` on the model class. No separate table and relations declarations.
- **Repositories need no constructor.** `@repository({ model, dataSource })` binds the model to the datasource.
- **Datasources discover their schema.** Do not pass `schema` to the datasource; it is built from the `@repository` bindings.

## Who is affected

- **Everyone with models, repositories or datasources written the old way.** You must migrate (below).

## Breaking changes

> [!WARNING]
> Existing models, repositories and datasources must be updated to the new pattern.

### 1. Model static properties

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

### 2. Repository constructor

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

### 3. DataSource schema

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

Migrate in this order: models, then repositories, then datasources.
