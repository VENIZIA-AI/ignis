# Repositories Overview

Repositories are the data access layer in Ignis - they provide type-safe CRUD operations for your database entities.

**Files:** `packages/core/src/base/repositories/core/*.ts`


## Quick Start

If you're new to repositories, start here:

```typescript
import { DefaultCRUDRepository, repository } from '@venizia/ignis';
import { Todo } from '@/models/todo.model';
import { PostgresDataSource } from '@/datasources/postgres.datasource';

@repository({ model: Todo, dataSource: PostgresDataSource })
export class TodoRepository extends DefaultCRUDRepository<typeof Todo.schema> {
  // That's it! You get: find, findOne, create, updateById, deleteById, etc.
}
```


## Repository Classes

| Class | Capabilities | Use Case |
|-------|--------------|----------|
| **AbstractRepository** | Base class with properties | Extend for custom repositories |
| **ReadableRepository** | Read-only operations | Views, external tables |
| **PersistableRepository** | Read + Write operations | Rarely used directly |
| **DefaultCRUDRepository** | Full CRUD operations | Standard data tables |

**Most common:** Extend `DefaultCRUDRepository` for standard tables.


## Available Methods

### Read Operations
| Method | Description | Example |
|--------|-------------|---------|
| `find(opts)` | Find multiple records | `repo.find({ filter: { where: { status: 'active' } } })` |
| `findOne(opts)` | Find single record | `repo.findOne({ filter: { where: { email } } })` |
| `findById(opts)` | Find by primary key | `repo.findById({ id: '123' })` |
| `count(opts)` | Count matching records | `repo.count({ where: { status: 'active' } })` |
| `existsWith(opts)` | Check if exists | `repo.existsWith({ where: { email } })` |

### Write Operations
| Method | Description | Example |
|--------|-------------|---------|
| `create(opts)` | Create single record | `repo.create({ data: { title: 'New' } })` |
| `createAll(opts)` | Create multiple records | `repo.createAll({ data: [{ title: 'A' }, { title: 'B' }] })` |
| `updateById(opts)` | Update by primary key | `repo.updateById({ id: '123', data: { title: 'Updated' } })` |
| `updateAll(opts)` | Update matching records | `repo.updateAll({ where: { status: 'draft' }, data: { status: 'published' } })` |
| `deleteById(opts)` | Delete by primary key | `repo.deleteById({ id: '123' })` |
| `deleteAll(opts)` | Delete matching records | `repo.deleteAll({ where: { status: 'archived' } })` |


## Documentation Sections

This documentation is split into focused guides:

### [Filter System](/references/base/filter-system/)
Complete reference for querying data - operators, JSON filtering, array operators, default filters, and query patterns.

```typescript
// Preview
await repo.find({
  filter: {
    where: {
      status: 'active',
      age: { gte: 18 },
      'metadata.priority': { gte: 3 },
      tags: { contains: ['featured'] }
    },
    order: ['createdAt DESC'],
    limit: 20
  }
});
```

### [Relations & Includes](./relations.md)
Fetch related data using `include` for eager loading and nested queries.

```typescript
// Preview
await repo.find({
  filter: {
    include: [{
      relation: 'posts',
      scope: { where: { published: true } }
    }]
  }
});
```

### [Advanced Features](./advanced.md)
Transactions, hidden properties, default filter bypass, performance optimization, and type inference.

```typescript
// Preview
const tx = await repo.beginTransaction();
try {
  await repo.create({ data, options: { transaction: tx } });
  await tx.commit();
} catch (e) {
  await tx.rollback();
}
```

### [Repository Mixins](./mixins.md)
Composable mixins for repository features - `DefaultFilterMixin` and `FieldsVisibilityMixin`.


## @repository Decorator

**Both `model` AND `dataSource` are required** for schema auto-discovery:

```typescript
// ❌ WRONG - Missing dataSource
@repository({ model: User })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {}

// ❌ WRONG - Missing model
@repository({ dataSource: PostgresDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {}

// ✅ CORRECT
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {}
```

### Zero Boilerplate Pattern (Recommended)

DataSource is auto-injected - no constructor needed:

```typescript
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {
  // Custom methods only - no boilerplate!

  async findByEmail(opts: { email: string }) {
    return this.findOne({ filter: { where: { email: opts.email } } });
  }
}
```

### Explicit @inject Pattern

When you need constructor control:

```typescript
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {
  constructor(
    @inject({ key: 'datasources.PostgresDataSource' })
    dataSource: PostgresDataSource,
  ) {
    super(dataSource);
  }
}
```


## Safety Features

### Empty Where Protection

Prevents accidental mass updates/deletes:

```typescript
// ❌ Throws error - empty where without force flag
await repo.deleteAll({ where: {} });

// ✅ Explicitly allow with force flag (logs warning)
await repo.deleteAll({ where: {}, options: { force: true } });
```

| Scenario | `force: false` (default) | `force: true` |
|----------|-------------------------|---------------|
| Empty `where` | Throws error | Logs warning, proceeds |
| Valid `where` | Executes normally | Executes normally |


## Quick Reference

| Want to... | Code |
|------------|------|
| Find all active | `repo.find({ filter: { where: { status: 'active' } } })` |
| Find by ID | `repo.findById({ id: '123' })` |
| Find with relations | `repo.find({ filter: { include: [{ relation: 'posts' }] } })` |
| Create one | `repo.create({ data: { name: 'John' } })` |
| Update by ID | `repo.updateById({ id: '123', data: { name: 'Jane' } })` |
| Delete by ID | `repo.deleteById({ id: '123' })` |
| Count matching | `repo.count({ where: { status: 'active' } })` |
| Check exists | `repo.existsWith({ where: { email: 'test@example.com' } })` |


## Next Steps

- **New to filtering?** Start with [Filter System](/references/base/filter-system/)
- **Need related data?** See [Relations & Includes](./relations.md)
- **Need transactions?** Go to [Advanced Features](./advanced.md)
