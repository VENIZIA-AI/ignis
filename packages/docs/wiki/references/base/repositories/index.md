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
| **AbstractRepository** | Base class with properties, mixins, lazy resolution | Extend for custom repositories |
| **ReadableRepository** | Read-only operations (write methods throw errors) | Views, external tables, read-only access |
| **PersistableRepository** | Read + Write operations | Full CRUD access |
| **DefaultCRUDRepository** | Extends PersistableRepository (no additions) | Standard data tables (recommended) |
| **SoftDeletableRepository** | CRUD + soft delete + restore | Tables with `deletedAt` column |

**Most common:** Extend `DefaultCRUDRepository` for standard tables, or `SoftDeletableRepository` for soft-delete patterns.

### Hierarchy

```
BaseHelper
  + FieldsVisibilityMixin
  + DefaultFilterMixin
    = AbstractRepository (abstract base, declares all CRUD signatures)
        |
        +-- ReadableRepository (implements read ops; write ops throw errors)
              |
              +-- PersistableRepository (implements write + delete ops, READ_WRITE scope)
                    |
                    +-- DefaultCRUDRepository (empty subclass, recommended entry point)
                          |
                          +-- SoftDeletableRepository (overrides delete with soft-delete)
```

### Type Parameters

All repository classes share the same four type parameters:

```typescript
class DefaultCRUDRepository<
  EntitySchema extends TTableSchemaWithId = TTableSchemaWithId,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>,
  ExtraOptions extends IExtraOptions = IExtraOptions,
>
```

| Parameter | Description |
|-----------|-------------|
| `EntitySchema` | The Drizzle `pgTable` schema type (e.g., `typeof User.schema`) |
| `DataObject` | The inferred SELECT type from the schema |
| `PersistObject` | The inferred INSERT type from the schema |
| `ExtraOptions` | Extra options for operations (defaults to `IExtraOptions`) |


## Available Methods

### Read Operations
| Method | Description | Example |
|--------|-------------|---------|
| `find(opts)` | Find multiple records | `repo.find({ filter: { where: { status: 'active' } } })` |
| `find(opts)` with range | Find with pagination range | `repo.find({ filter, options: { shouldQueryRange: true } })` |
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
| `updateAll(opts)` | Update matching records | `repo.updateAll({ data: { status: 'published' }, where: { status: 'draft' } })` |
| `updateBy(opts)` | Alias for `updateAll` | `repo.updateBy({ data: { status: 'published' }, where: { status: 'draft' } })` |
| `deleteById(opts)` | Delete by primary key | `repo.deleteById({ id: '123' })` |
| `deleteAll(opts)` | Delete matching records | `repo.deleteAll({ where: { status: 'archived' } })` |
| `deleteBy(opts)` | Alias for `deleteAll` | `repo.deleteBy({ where: { status: 'archived' } })` |


## Method Signatures

### Read Operations

```typescript
// Count matching records
count(opts: {
  where: TWhere<DataObject>;
  options?: IExtraOptions;
}): Promise<{ count: number }>;

// Check if any record matches
existsWith(opts: {
  where: TWhere<DataObject>;
  options?: IExtraOptions;
}): Promise<boolean>;

// Find multiple records (returns array)
find<R = DataObject>(opts: {
  filter: TFilter<DataObject>;
  options?: IExtraOptions & { shouldQueryRange?: false };
}): Promise<R[]>;

// Find multiple records with range info (returns data + range)
find<R = DataObject>(opts: {
  filter: TFilter<DataObject>;
  options: IExtraOptions & { shouldQueryRange: true };
}): Promise<{ data: Array<R>; range: TDataRange }>;

// Find single record
findOne<R = DataObject>(opts: {
  filter: TFilter<DataObject>;
  options?: IExtraOptions;
}): Promise<R | null>;

// Find by primary key
findById<R = DataObject>(opts: {
  id: IdType;
  filter?: Omit<TFilter<DataObject>, 'where'>;
  options?: IExtraOptions;
}): Promise<R | null>;
```

### Write Operations

```typescript
// Create single record (returns created data by default)
create<R = DataObject>(opts: {
  data: PersistObject;
  options?: IExtraOptions & { shouldReturn?: true };
}): Promise<{ count: number; data: R }>;

// Create single record (skip returning data)
create(opts: {
  data: PersistObject;
  options: IExtraOptions & { shouldReturn: false };
}): Promise<{ count: number; data: undefined | null }>;

// Create multiple records (returns created data by default)
createAll<R = DataObject>(opts: {
  data: Array<PersistObject>;
  options?: IExtraOptions & { shouldReturn?: true };
}): Promise<{ count: number; data: Array<R> }>;

// Create multiple records (skip returning data)
createAll(opts: {
  data: Array<PersistObject>;
  options: IExtraOptions & { shouldReturn: false };
}): Promise<{ count: number; data: undefined | null }>;

// Update by primary key (returns updated data by default)
updateById<R = DataObject>(opts: {
  id: IdType;
  data: Partial<PersistObject>;
  options?: IExtraOptions & { shouldReturn?: true };
}): Promise<{ count: number; data: R }>;

// Update by primary key (skip returning data)
updateById(opts: {
  id: IdType;
  data: Partial<PersistObject>;
  options: IExtraOptions & { shouldReturn: false };
}): Promise<{ count: number; data: undefined | null }>;

// Update matching records (returns updated data by default)
updateAll<R = DataObject>(opts: {
  data: Partial<PersistObject>;
  where: TWhere<DataObject>;
  options?: IExtraOptions & { shouldReturn?: true; force?: boolean };
}): Promise<{ count: number; data: Array<R> }>;

// Update matching records (skip returning data)
updateAll(opts: {
  data: Partial<PersistObject>;
  where: TWhere<DataObject>;
  options: IExtraOptions & { shouldReturn: false; force?: boolean };
}): Promise<{ count: number; data: undefined | null }>;

// updateBy is an alias for updateAll (same signatures)

// Delete by primary key (returns deleted data by default)
deleteById<R = DataObject>(opts: {
  id: IdType;
  options?: IExtraOptions & { shouldReturn?: true };
}): Promise<{ count: number; data: R }>;

// Delete by primary key (skip returning data)
deleteById(opts: {
  id: IdType;
  options: IExtraOptions & { shouldReturn: false };
}): Promise<{ count: number; data: undefined | null }>;

// Delete matching records (returns deleted data by default)
deleteAll<R = DataObject>(opts: {
  where: TWhere<DataObject>;
  options?: IExtraOptions & { shouldReturn?: true; force?: boolean };
}): Promise<{ count: number; data: Array<R> }>;

// Delete matching records (skip returning data)
deleteAll(opts: {
  where: TWhere<DataObject>;
  options: IExtraOptions & { shouldReturn: false; force?: boolean };
}): Promise<{ count: number; data: undefined | null }>;

// deleteBy is an alias for deleteAll (same signatures)
```


## IExtraOptions

All repository operations accept an `options` parameter with these fields:

```typescript
interface IExtraOptions {
  /** Transaction context — switches the underlying Drizzle connector. */
  transaction?: ITransaction;

  /** Operation logging configuration. */
  log?: { use: boolean; level?: TLogLevel };

  /** If true, bypass the default filter configured in model settings (e.g., soft delete). */
  shouldSkipDefaultFilter?: boolean;
}
```

Additional fields are available as intersections on specific methods:

| Field | Type | Methods | Description |
|-------|------|---------|-------------|
| `shouldReturn` | `boolean` | `create`, `createAll`, `updateById`, `updateAll`, `deleteById`, `deleteAll` | If `false`, skip returning the data (only return count). Defaults to `true`. |
| `shouldQueryRange` | `boolean` | `find` | If `true`, returns `{ data, range: { start, end, total } }` instead of a plain array. |
| `force` | `boolean` | `updateAll`, `deleteAll`, `updateBy`, `deleteBy` | Required to allow empty `where` conditions. |


## TDataRange

When `shouldQueryRange: true` is used, the range follows the HTTP Content-Range standard:

```typescript
type TDataRange = {
  start: number;  // Inclusive start index (based on skip/offset)
  end: number;    // Inclusive end index
  total: number;  // Total matching records (ignoring limit)
};
```


## AbstractRepository Properties

### dataSource

Getter/setter for the repository's datasource. Throws if accessed before being set (either via constructor or `@repository` auto-injection).

```typescript
get dataSource(): IDataSource;
set dataSource(value: IDataSource);
setDataSource(opts: { dataSource: IDataSource }): void;
```

### entity

Lazy-resolved from `@repository` metadata on first access. Can also be set explicitly via constructor `entityClass` option.

```typescript
get entity(): BaseEntity<EntitySchema>;
set entity(value: BaseEntity<EntitySchema>);
getEntity(): BaseEntity<EntitySchema>;
getEntitySchema(): EntitySchema;
```

### operationScope

Returns the repository's operation scope: `'READ_ONLY'`, `'WRITE_ONLY'`, or `'READ_WRITE'`.

```typescript
get operationScope(): TRepositoryOperationScope;
```

- `ReadableRepository` defaults to `READ_ONLY`
- `PersistableRepository` and `DefaultCRUDRepository` default to `READ_WRITE`

### filterBuilder

Access to the `FilterBuilder` instance used for converting filter objects to Drizzle SQL.

```typescript
get filterBuilder(): FilterBuilder;
```

### connector

Shortcut for `this.dataSource.connector`.

```typescript
get connector(): IDataSource['connector'];
getConnector(): IDataSource['connector'];
```

### updateBuilder (PersistableRepository+)

Access to the `UpdateBuilder` instance used for transforming update data (including JSON path updates).

```typescript
get updateBuilder(): UpdateBuilder;
```


## Key Methods

### beginTransaction

Start a new database transaction through the repository's datasource:

```typescript
await repo.beginTransaction(opts?: ITransactionOptions): Promise<ITransaction>;
```

Usage:

```typescript
const tx = await repo.beginTransaction();
try {
  await repo.create({ data: { name: 'John' }, options: { transaction: tx } });
  await repo.updateById({ id: '456', data: { count: 1 }, options: { transaction: tx } });
  await tx.commit();
} catch (e) {
  await tx.rollback();
}
```

### buildQuery

Converts a `TFilter` into Drizzle query options, automatically excluding hidden properties from `@model` settings:

```typescript
buildQuery(opts: { filter: TFilter<DataObject> }): TDrizzleQueryOptions;
```

The returned `TDrizzleQueryOptions` contains:

```typescript
type TDrizzleQueryOptions = Partial<{
  limit: number;
  offset: number;
  orderBy: SQL[];
  where: SQL;
  with: Record<string, true | TDrizzleQueryOptions>;
  columns: Record<string, boolean>;
}>;
```


## Dual Query API

`ReadableRepository` automatically selects the optimal query strategy:

- **Core API** (Drizzle `select().from()`): ~15-20% faster for flat queries without relations or field selection
- **Query API** (Drizzle `connector.query[entity].findMany()`): Supports `include` for relations and `fields` for column selection

The selection is automatic based on filter complexity:

```typescript
// Uses Core API (no include, no fields)
await repo.find({ filter: { where: { status: 'active' }, limit: 10 } });

// Uses Query API (has include)
await repo.find({
  filter: {
    where: { status: 'active' },
    include: [{ relation: 'posts' }],
  },
});

// Uses Query API (has fields)
await repo.find({
  filter: {
    fields: { id: true, name: true },
    where: { status: 'active' },
  },
});
```


## Constructor

### AbstractRepository

```typescript
constructor(
  ds?: IDataSource,
  opts?: {
    scope?: string;
    entityClass?: TClass<BaseEntity<EntitySchema>>;
    operationScope?: TRepositoryOperationScope;
  },
)
```

- `ds` -- DataSource instance (optional; auto-injected by `@repository` decorator)
- `opts.scope` -- Logger scope name (defaults to class name)
- `opts.entityClass` -- Entity class to instantiate (optional; lazy-resolved from `@repository` metadata)
- `opts.operationScope` -- Defaults to `READ_ONLY`

### ReadableRepository

```typescript
constructor(
  ds?: IDataSource,
  opts?: { entityClass?: TClass<BaseEntity<EntitySchema>> },
)
```

Forces `operationScope` to `READ_ONLY`.

### PersistableRepository

```typescript
constructor(
  ds?: IDataSource,
  opts?: { entityClass?: TClass<BaseEntity<EntitySchema>> },
)
```

Forces `operationScope` to `READ_WRITE`. Also creates an `UpdateBuilder` instance.


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

### [SoftDeletableRepository](./soft-deletable.md)
Soft-delete and restore operations using `deletedAt` timestamps instead of physical deletion.

```typescript
// Preview
@repository({ model: Category, dataSource: PostgresDataSource })
export class CategoryRepository extends SoftDeletableRepository<typeof Category.schema> {}

// Soft delete (sets deletedAt)
await repo.deleteById({ id: '123' });
// Restore
await repo.restoreById({ id: '123' });
// Hard delete (physical removal)
await repo.deleteById({ id: '123', options: { shouldHardDelete: true } });
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
@repository({ model: Model, dataSource: DataSourceClass })
```

The decorator accepts `IRepositoryMetadata`:

```typescript
interface IRepositoryMetadata<Schema, Model, DataSource> {
  model: TValueOrResolver<TClass<Model>>;
  dataSource: string | TValueOrResolver<TClass<DataSource>>;
  operationScope?: TRepositoryOperationScope; // 'READ_ONLY' | 'WRITE_ONLY' | 'READ_WRITE'
}
```

```typescript
// WRONG - Missing dataSource
@repository({ model: User })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {}

// WRONG - Missing model
@repository({ dataSource: PostgresDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {}

// CORRECT
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

### Lazy Resolution

The `@repository` decorator enables two lazy resolution mechanisms:

1. **Entity resolution**: The `entity` getter auto-resolves the model class from `@repository` metadata on first access, so you never need to pass `entityClass` manually.
2. **DataSource resolution**: The DataSource is auto-injected at constructor param[0] unless an explicit `@inject` is present.


## Safety Features

### Empty Where Protection

Prevents accidental mass updates/deletes (in `PersistableRepository` and above):

```typescript
// Throws error - empty where without force flag
await repo.deleteAll({ where: {} });
await repo.updateAll({ data: { status: 'archived' }, where: {} });

// Explicitly allow with force flag (logs warning)
await repo.deleteAll({ where: {}, options: { force: true } });
await repo.updateAll({ data: { status: 'archived' }, where: {}, options: { force: true } });
```

| Scenario | `force: false` (default) | `force: true` |
|----------|-------------------------|---------------|
| Empty `where` | Throws error | Logs warning, proceeds |
| Valid `where` | Executes normally | Executes normally |

### ReadableRepository Write Protection

All write methods (`create`, `createAll`, `updateById`, `updateAll`, `deleteById`, `deleteAll`) throw errors on `ReadableRepository`, enforcing the read-only scope at runtime.


## TFilter Reference

```typescript
type TFilter<T = any> = {
  where?: TWhere<T>;
  fields?: Partial<{ [K in keyof T]: boolean }> | Array<keyof T>;
  include?: Array<{
    relation: string;
    scope?: TFilter;
    shouldSkipDefaultFilter?: boolean;
  }>;
  order?: string[];       // e.g., ['createdAt DESC', 'name ASC']
  limit?: number;         // Defaults to 10
  offset?: number;
  skip?: number;          // Alias for offset
};
```


## Quick Reference

| Want to... | Code |
|------------|------|
| Find all active | `repo.find({ filter: { where: { status: 'active' } } })` |
| Find with range info | `repo.find({ filter, options: { shouldQueryRange: true } })` |
| Find by ID | `repo.findById({ id: '123' })` |
| Find with relations | `repo.find({ filter: { include: [{ relation: 'posts' }] } })` |
| Create one | `repo.create({ data: { name: 'John' } })` |
| Create without returning data | `repo.create({ data: { name: 'John' }, options: { shouldReturn: false } })` |
| Create many | `repo.createAll({ data: [{ name: 'A' }, { name: 'B' }] })` |
| Update by ID | `repo.updateById({ id: '123', data: { name: 'Jane' } })` |
| Update by condition | `repo.updateAll({ data: { status: 'published' }, where: { status: 'draft' } })` |
| Delete by ID | `repo.deleteById({ id: '123' })` |
| Delete by condition | `repo.deleteBy({ where: { status: 'archived' } })` |
| Soft delete | `repo.deleteById({ id: '123' })` (with `SoftDeletableRepository`) |
| Restore soft-deleted | `repo.restoreById({ id: '123' })` (with `SoftDeletableRepository`) |
| Hard delete (bypass soft) | `repo.deleteById({ id: '123', options: { shouldHardDelete: true } })` |
| Count matching | `repo.count({ where: { status: 'active' } })` |
| Check exists | `repo.existsWith({ where: { email: 'test@example.com' } })` |
| Skip default filter | `repo.find({ filter, options: { shouldSkipDefaultFilter: true } })` |
| Use transaction | `repo.create({ data, options: { transaction: tx } })` |


## Next Steps

- **New to filtering?** Start with [Filter System](/references/base/filter-system/)
- **Need related data?** See [Relations & Includes](./relations.md)
- **Need soft delete?** See [SoftDeletableRepository](./soft-deletable.md)
- **Need transactions?** Go to [Advanced Features](./advanced.md)

## See Also

- **Related Concepts:**
  - [Repositories Guide](/guides/core-concepts/persistent/repositories) - Creating repositories tutorial
  - [Models](/guides/core-concepts/persistent/models) - Entity definitions used by repositories
  - [DataSources](/guides/core-concepts/persistent/datasources) - Database connections
  - [Services](/guides/core-concepts/services) - Use repositories for data access
  - [Transactions](/guides/core-concepts/persistent/transactions) - Multi-operation consistency

- **Repository Topics:**
  - [Relations & Includes](./relations) - Loading related data
  - [Advanced Features](./advanced) - JSON updates, transactions, performance tuning
  - [Repository Mixins](./mixins) - Soft delete and auditing

- **Filtering:**
  - [Filter System Overview](/references/base/filter-system/) - Complete filtering guide
  - [Filter Quick Reference](/references/base/filter-system/quick-reference) - All operators cheat sheet

- **Best Practices:**
  - [Data Modeling](/best-practices/data-modeling) - Repository design patterns
  - [Performance Optimization](/best-practices/performance-optimization) - Query optimization

- **Tutorials:**
  - [Building a CRUD API](/guides/tutorials/building-a-crud-api) - Repository examples
  - [E-commerce API](/guides/tutorials/ecommerce-api) - Advanced queries and relations
