---
title: Models & Enrichers Reference
description: Technical reference for model architecture and schema enrichers
difficulty: intermediate
---

# Deep Dive: Models and Enrichers

Technical reference for model architecture and schema enrichers in IGNIS.

> [!IMPORTANT] Base vs. Connectors
> The engine-neutral root `AbstractEntity` (`packages/core/src/base/models/base.ts`) has no Drizzle, no `pgTable`, and no `drizzle-zod` - just a `name`, an abstract `getSchema()`, a `getIdType(): TIdSchemaType` method (default `'string'`), and `toObject()`/`toJSON()`. Everything described below - the Drizzle-backed `BaseEntity`, `drizzle-zod` schema generation, and all schema enrichers - belongs to the **PostgreSQL connector**'s `BasePostgresEntity`, not the neutral base. See [Connectors](./connectors) for the full base-vs-connectors architecture.

**Files:**
- `packages/core/src/base/models/base.ts` (neutral `AbstractEntity`)
- `packages/core/src/connectors/postgres/models/base.ts` (PostgreSQL `BasePostgresEntity`)
- `packages/core/src/connectors/postgres/models/enrichers/*.ts`

## Quick Reference

| Component | Purpose | Key Features |
|-----------|---------|--------------|
| **BasePostgresEntity** (alias: `BaseEntity`) | Wraps Drizzle schema | Schema encapsulation, Zod generation, `toObject()`/`toJSON()` |
| **Schema Enrichers** | Add common columns to tables | `generateIdColumnDefs()`, `generateTzColumnDefs()`, etc. |

## `BasePostgresEntity` Class (alias: `BaseEntity`)

PostgreSQL connector's entity class, wrapping a Drizzle ORM schema. Extends the neutral `AbstractEntity`.

**File:** `packages/core/src/connectors/postgres/models/base.ts`

> [!TIP] Naming
> `BasePostgresEntity` is the canonical, engine-carrying name. `BaseEntity` is a compatibility alias re-exporting the same class from `connectors/postgres/models/index.ts` (`export { BasePostgresEntity as BaseEntity } from './base'`) - both resolve to identical runtime behavior. Code samples on this page use `BaseEntity` since it remains the most common import today.

### Purpose

| Feature | Description |
|---------|-------------|
| **Schema Encapsulation** | Holds Drizzle `pgTable` schema for consistent repository access |
| **Metadata** | Works with `@model` decorator to mark database entities |
| **Schema Generation** | Uses `drizzle-zod` to generate Zod schemas (`select`, `create`, `update`) |
| **Static Properties** | Supports static `schema`, `relations`, `TABLE_NAME`, and `AUTHORIZATION_SUBJECT` |
| **Convenience** | Includes `toObject()` and `toJSON()` methods |

### The `@model` Decorator

The `@model` decorator marks a class as a database entity and configures its behavior.

**File:** `packages/core/src/base/metadata/persistents.ts`

#### Decorator Options

```typescript
@model({
  type: 'entity' | 'view',
  tableName?: string,
  skipMigrate?: boolean,
  settings?: {
    hiddenProperties?: string[],  // Properties to exclude from query results
    defaultFilter?: TFilter,      // Filter applied to all repository queries
    defaultLimit?: number,        // Default row limit when a query omits `limit`
    authorize?: {                  // Authorization settings
      principal: string,           // Authorization subject name
      [extra: string | symbol]: any, // Extensible metadata
    },
  }
})
```

| Option | Type | Description |
|--------|------|-------------|
| `type` | `'entity' \| 'view'` | Entity type - `'entity'` for tables, `'view'` for database views |
| `tableName` | `string` | Optional custom table name. Resolution order: `tableName` > static `TABLE_NAME` > class name |
| `skipMigrate` | `boolean` | Skip this model during schema migrations |
| `settings.hiddenProperties` | `string[]` | Array of property names to exclude from all repository query results |
| `settings.defaultFilter` | `TFilter` | Filter automatically applied to all repository queries (see [Default Filter](/references/base/filter-system/default-filter)) |
| `settings.defaultLimit` | `number` | Default row limit applied when a query omits `limit`. Must be a positive integer (validated at decoration time). Falls back to the global `DEFAULT_LIMIT` (10). See [Pagination](/references/base/filter-system/fields-order-pagination#default-limit) |
| `settings.authorize` | `IModelAuthorizeSettings` | Authorization settings - declares the model's authorization principal (see [Authorization](/extensions/components/authorization/usage#model-based-resource-references)) |
| `settings.authorize.principal` | `string` | The authorization subject name for this model. Auto-populates `AUTHORIZATION_SUBJECT` static property |

#### `@model` Behavior

When the `@model` decorator is applied:
1. If `settings.defaultLimit` is provided, it is validated to be a positive integer - otherwise the decorator throws at decoration (boot) time
2. If `settings.authorize.principal` is provided and `AUTHORIZATION_SUBJECT` is not already defined on the class, it auto-populates `AUTHORIZATION_SUBJECT` with the principal value
3. The model is registered in the `MetadataRegistry` model registry, keyed by table name (resolved as: `metadata.tableName` > `static TABLE_NAME` > class name)
4. The static `relations` property is stored as a resolver (not immediately resolved) to avoid circular dependency issues between models

### Hidden Properties

Hidden properties are **excluded at the SQL level** - they are never fetched from the database when querying through repositories. This provides:

- **Security**: Sensitive data like passwords are never accidentally exposed
- **Performance**: Less data transferred from database
- **Consistency**: Hidden properties are excluded from ALL repository operations

```typescript
import { pgTable, text } from 'drizzle-orm/pg-core';
import { BaseEntity, model, generateIdColumnDefs } from '@venizia/ignis';

@model({
  type: 'entity',
  settings: {
    hiddenProperties: ['password', 'secret'],  // Never returned via repository
  },
})
export class User extends BaseEntity<typeof User.schema> {
  static override schema = pgTable('User', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    email: text('email').notNull(),
    password: text('password'),  // Hidden - never in query results
    secret: text('secret'),      // Hidden - never in query results
  });
}
```

#### Behavior

| Operation | Hidden Properties |
|-----------|-------------------|
| `find()`, `findOne()`, `findById()` | Excluded from SELECT |
| `create()`, `createAll()` | Excluded from RETURNING |
| `updateById()`, `updateAll()` | Excluded from RETURNING |
| `deleteById()`, `deleteAll()` | Excluded from RETURNING |
| `count()`, `existsWith()` | Can filter by hidden fields |
| Direct connector query | **Included** (bypasses repository) |

#### Important Notes

- Hidden properties can still be used in `where` clauses for filtering
- Data is still **stored** in the database - only excluded from query results
- Use direct connector queries when you need to access hidden data:

```typescript
// Repository query - password/secret NOT included
const user = await userRepository.findById({ id: '123' });
// user = { id: '123', email: 'john@example.com' }

// Direct connector query - ALL fields included
const connector = userRepository.getConnector();
const [fullUser] = await connector
  .select()
  .from(User.schema)
  .where(eq(User.schema.id, '123'));
// fullUser = { id: '123', email: 'john@example.com', password: 'hashed...', secret: '...' }
```

### Default Filter

Default filters are **automatically applied** to all repository queries for a model. This is useful for:

- **Soft Delete**: Automatically exclude deleted records
- **Multi-Tenancy**: Isolate data by tenant
- **Active Records**: Filter to active/non-expired records
- **Query Limits**: Prevent unbounded queries

```typescript
@model({
  type: 'entity',
  settings: {
    defaultFilter: {
      where: { isDeleted: false },  // Applied to all queries
      limit: 100,                    // Prevents unbounded queries
    },
  },
})
export class Post extends BaseEntity<typeof Post.schema> {
  static override schema = postTable;
}
```

#### Behavior

| Operation | Default Filter |
|-----------|----------------|
| `find()`, `findOne()`, `findById()` | Applied to WHERE clause |
| `count()`, `existsWith()` | Applied to WHERE clause |
| `updateById()`, `updateAll()` | Applied to WHERE clause |
| `deleteById()`, `deleteAll()` | Applied to WHERE clause |
| `create()`, `createAll()` | **Not applied** |

#### Bypassing

Use `shouldSkipDefaultFilter: true` to bypass:

```typescript
// Normal query - includes default filter
await postRepository.find({ filter: {} });
// WHERE isDeleted = false LIMIT 100

// Admin query - bypass default filter
await postRepository.find({
  filter: {},
  options: { shouldSkipDefaultFilter: true }
});
// No WHERE clause (includes deleted)
```

> [!TIP]
> See [Default Filter](/references/base/filter-system/default-filter) for full documentation including merge strategies and common patterns.

### Definition Patterns

`BaseEntity` supports two patterns for defining models:

#### Pattern 1: Static Properties (Recommended)

Define schema and relations as static properties:

```typescript
import { pgTable, text } from 'drizzle-orm/pg-core';
import { BaseEntity, model, generateIdColumnDefs, createRelations } from '@venizia/ignis';

// Define table schema
export const userTable = pgTable('User', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  name: text('name').notNull(),
  email: text('email').notNull(),
});

// Define relations
export const userRelations = createRelations({
  source: userTable,
  relations: [],
});

// Entity class with static properties
@model({ type: 'entity' })
export class User extends BaseEntity<typeof User.schema> {
  static override schema = userTable;
  static override relations = () => userRelations.definitions;
  static override TABLE_NAME = 'User';
}
```

**Benefits:**
- Schema and relations are auto-resolved by repositories
- No need to pass `relations` in repository constructor
- Cleaner, more declarative syntax

#### Pattern 2: Constructor-Based (Legacy)

Pass schema in constructor:

```typescript
@model({ type: 'entity' })
export class User extends BaseEntity<typeof userTable> {
  constructor() {
    super({ name: 'User', schema: userTable });
  }
}
```

### Static Properties

| Property | Type | Description |
|----------|------|-------------|
| `schema` | `TTableSchemaWithId` | Drizzle table schema defined with `pgTable()` |
| `relations` | `TValueOrResolver<Array<TRelationConfig>>` | Relation definitions (can be a function for lazy loading to avoid circular deps) |
| `TABLE_NAME` | `string \| undefined` | Optional table name (defaults to class name if not set) |
| `AUTHORIZATION_SUBJECT` | `string \| undefined` | Authorization principal name. Auto-populated from `@model` settings `authorize.principal` |

### IEntity Interface

Models implementing static properties conform to the `IEntity` interface:

```typescript
interface IEntity<Schema extends TTableSchemaWithId = TTableSchemaWithId> {
  TABLE_NAME?: string;
  schema: Schema;
  relations?: TValueOrResolver<Array<TRelationConfig>>;
}
```

### Instance Methods

| Method | Description |
|--------|-------------|
| `getSchema({ type })` | Get Zod schema for validation (`'select'`, `'create'`, `'update'`) |
| `toObject()` | Convert to plain object (shallow spread of `this`) |
| `toJSON()` | Delegates to `toObject()` - returns a plain object (used by `JSON.stringify`) |

### `getSchema` Method

Generates a Zod validation schema from the Drizzle table schema using `drizzle-zod`.

```typescript
getSchema(opts: { type: TSchemaType }): ZodSchema
```

The `type` parameter accepts lowercase string values defined in the `SchemaTypes` class:

| Type | Value | Zod Schema Generated | Description |
|------|-------|---------------------|-------------|
| `SchemaTypes.SELECT` | `'select'` | `createSelectSchema(schema)` | Schema for query results |
| `SchemaTypes.CREATE` | `'create'` | `createInsertSchema(schema)` | Schema for insert operations |
| `SchemaTypes.UPDATE` | `'update'` | `createUpdateSchema(schema)` | Schema for update operations |

```typescript
const user = new User();

// Get Zod schema for validating insert data
const createSchema = user.getSchema({ type: 'create' });

// Get Zod schema for validating query results
const selectSchema = user.getSchema({ type: 'select' });

// Get Zod schema for validating update data
const updateSchema = user.getSchema({ type: 'update' });
```

The `schemaFactory` is a static lazy singleton created via `drizzle-zod`'s `createSchemaFactory()`, shared across all `BaseEntity` instances to avoid per-entity overhead.

### Class Definition

```typescript
export class BasePostgresEntity<Schema extends TTableSchemaWithId = TTableSchemaWithId>
  extends AbstractEntity
  implements IEntity<Schema>
{
  // Instance property (name, toObject(), toJSON() are inherited from AbstractEntity)
  schema: Schema;

  // Static properties - override in subclass
  static schema: TTableSchemaWithId;
  static relations?: TValueOrResolver<Array<TRelationConfig>>;
  static TABLE_NAME?: string;  // Optional, defaults to class name
  static AUTHORIZATION_SUBJECT?: string;  // Auto-set by @model decorator from authorize.principal

  // Static singleton for schemaFactory - shared across all instances
  // Performance optimization: avoids creating new factory per entity
  private static _schemaFactory?: ReturnType<typeof createSchemaFactory>;
  protected static get schemaFactory(): ReturnType<typeof createSchemaFactory> {
    return (BasePostgresEntity._schemaFactory ??= createSchemaFactory());
  }

  // Constructor supports both patterns
  constructor(opts?: { name?: string; schema?: Schema }) {
    const ctor = new.target as typeof BasePostgresEntity;
    // Resolution order: opts.name > static TABLE_NAME > class name
    const name = opts?.name ?? ctor.TABLE_NAME ?? ctor.name;

    super({ name });

    this.schema = opts?.schema || (ctor.schema as Schema);
  }

  // Maps the pgTable id column's Drizzle dataType to 'number' or 'string'
  override getIdType(): TIdSchemaType {
    return getIdType({ entity: this.schema }) === 'number' ? 'number' : 'string';
  }

  getSchema(opts: { type: TSchemaType }) {
    const factory = BasePostgresEntity.schemaFactory;  // Uses static singleton
    switch (opts.type) {
      case SchemaTypes.CREATE:
        return factory.createInsertSchema(this.schema);
      case SchemaTypes.UPDATE:
        return factory.createUpdateSchema(this.schema);
      case SchemaTypes.SELECT:
        return factory.createSelectSchema(this.schema);
      default:
        throw getError({
          message: `[getSchema] Invalid schema type | type: ${opts.type}`,
        });
    }
  }
}
```

## Key Types

### `TTableSchemaWithId`

Ensures a Drizzle `PgTable` has an `id` column:

```typescript
type TTableSchemaWithId<TC extends TableConfig = TableConfig> = PgTable<TC> & {
  id: TIdColumn;
};
```

### `TTableObject`

Infers the select (output) type from a table schema:

```typescript
type TTableObject<T extends TTableSchemaWithId> = T['$inferSelect'];
```

### `TTableInsert`

Infers the insert (input) type from a table schema:

```typescript
type TTableInsert<T extends TTableSchemaWithId> = T['$inferInsert'];
```

### `TGetIdType`

Extracts the `id` field type from a table schema:

```typescript
type TGetIdType<T extends TTableSchemaWithId> = TTableObject<T>['id'];
```

### `IdType`

Union of supported ID types:

```typescript
type NumberIdType = number;
type StringIdType = string;
type BigIntIdType = bigint;
type IdType = NumberIdType | StringIdType | BigIntIdType;
```

### `TRelationConfig`

Configuration for entity relationships:

```typescript
type TRelationConfig = {
  name: string;
} & (
  | { type: 'one'; schema: TTableSchemaWithId; metadata: /* Drizzle one() params */ }
  | { type: 'many'; schema: TTableSchemaWithId; metadata: /* Drizzle many() params */ }
);
```

Relation types are defined in the `RelationTypes` class:

| Type | Value | Description |
|------|-------|-------------|
| `RelationTypes.ONE` | `'one'` | One-to-one or many-to-one relationship |
| `RelationTypes.MANY` | `'many'` | One-to-many relationship |

### `TValueOrResolver`

From `@venizia/ignis-helpers`, enables lazy resolution to avoid circular dependencies:

```typescript
type TValueOrResolver<T> = T | TResolver<T>;  // T or () => T
```

Used for `relations` on `BaseEntity` - store a function that returns the relations array, resolved lazily when `DataSource.buildSchema()` is called.

## Schema Enrichers

Enrichers are helper functions located in `packages/core/src/connectors/postgres/models/enrichers/` that return an object of Drizzle ORM column definitions. They are designed to be spread into a `pgTable` definition to quickly add common, standardized fields to your models.

### Available Enrichers

| Enricher Function | Convenience Wrapper | Purpose |
| :--- | :--- | :--- |
| **`generateIdColumnDefs`** | `enrichId` | Adds a primary key `id` column (string UUID, numeric integer, or big integer). |
| **`generateTzColumnDefs`** | `enrichTz` | Adds `createdAt`, `modifiedAt`, and `deletedAt` timestamp columns with timezone support. |
| **`generateUserAuditColumnDefs`** | `enrichUserAudit` | Adds `createdBy` and `modifiedBy` columns to track user audit information. |
| **`generatePrincipalColumnDefs`** | `enrichPrincipal` | Adds polymorphic principal columns (`{discriminator}Id` and `{discriminator}Type`). |
| **`generateDataTypeColumnDefs`** | `enrichDataTypes` | Adds generic data type columns (`dataType`, `nValue`, `tValue`, `bValue`, `jValue`, `boValue`) for flexible data storage. |
| **`extraUserColumns`** | - | Adds common user fields (`realm`, `status`, `type`, `activatedAt`, `lastLoginAt`, `parentId`). Imported from `@venizia/ignis` (part of auth component). |

Each `generate*` function returns column definition objects for spreading into `pgTable`. The `enrich*` convenience wrappers accept an existing `TColumnDefinitions` object as the first argument and merge the generated columns into it.

### Example Usage

```typescript
import { pgTable, text } from 'drizzle-orm/pg-core';
import {
  generateIdColumnDefs,
  generateTzColumnDefs,
  generateUserAuditColumnDefs,
} from '@venizia/ignis';

export const myTable = pgTable('MyTable', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  ...generateTzColumnDefs(),
  ...generateUserAuditColumnDefs({
    created: { dataType: 'string', columnName: 'created_by' },
    modified: { dataType: 'string', columnName: 'modified_by' },
  }),
  name: text('name').notNull(),
});
```


## Detailed Enricher Reference

### `generateIdColumnDefs`

Adds a primary key `id` column with support for string UUID, integer, or big integer types with full TypeScript type inference.

**File:** `packages/core/src/connectors/postgres/models/enrichers/id.enricher.ts`

#### Signature

```typescript
generateIdColumnDefs<Opts extends TIdEnricherOptions | undefined>(
  opts?: Opts,
): TIdColumnDef<Opts>
```

#### Options (`TIdEnricherOptions`)

```typescript
type TIdEnricherOptions = {
  id?: { columnName?: string } & (
    | { dataType: 'string'; generator?: () => string }  // Optional custom ID generator
    | {
        dataType: 'number';
        sequenceOptions?: PgSequenceOptions;
      }
    | {
        dataType: 'big-number';
        numberMode: 'number' | 'bigint'; // Required for big-number
        sequenceOptions?: PgSequenceOptions;
      }
  );
};
```

**Default values:**
- `dataType`: `'number'` (auto-incrementing integer)
- `columnName`: `'id'`

#### Generated Columns

| Data Type | Column Type | Constraints | Description |
|-----------|------------|-------------|-------------|
| `'string'` | `text` | Primary Key, Default: `crypto.randomUUID()` | Text column with customizable ID generator (default: UUID) |
| `'number'` | `integer` | Primary Key, `GENERATED ALWAYS AS IDENTITY` | Auto-incrementing integer |
| `'big-number'` | `bigint` | Primary Key, `GENERATED ALWAYS AS IDENTITY` | Auto-incrementing big integer (mode: 'number' or 'bigint') |

#### Type Inference

The function provides **full TypeScript type inference** based on the configuration options:

```typescript
// Type aliases for readability
type TStringIdCol = HasRuntimeDefault<
  HasDefault<IsPrimaryKey<NotNull<PgTextBuilderInitial<'id', [string, ...string[]]>>>>
>;
type TNumberIdCol = IsIdentity<IsPrimaryKey<NotNull<PgIntegerBuilderInitial<'id'>>>, 'always'>;
type TBigInt53IdCol = IsIdentity<IsPrimaryKey<NotNull<PgBigInt53BuilderInitial<'id'>>>, 'always'>;
type TBigInt64IdCol = IsIdentity<IsPrimaryKey<NotNull<PgBigInt64BuilderInitial<'id'>>>, 'always'>;

type TIdColumnDef<Opts extends TIdEnricherOptions | undefined> = Opts extends {
  id: infer IdOpts;
}
  ? IdOpts extends { dataType: 'string' }
    ? { id: TStringIdCol }
    : IdOpts extends { dataType: 'number' }
      ? { id: TNumberIdCol }
      : IdOpts extends { dataType: 'big-number' }
        ? IdOpts extends { numberMode: 'number' }
          ? { id: TBigInt53IdCol }
          : { id: TBigInt64IdCol }
        : { id: TNumberIdCol }
  : { id: TNumberIdCol };
```

This ensures that TypeScript correctly infers the exact column type based on your configuration.

#### Usage Examples

**Default (auto-incrementing integer):**

```typescript
import { pgTable, text } from 'drizzle-orm/pg-core';
import { generateIdColumnDefs } from '@venizia/ignis';

export const myTable = pgTable('MyTable', {
  ...generateIdColumnDefs(),
  name: text('name').notNull(),
});

// Generates: id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY
```

**Text-based string ID (UUID by default):**

```typescript
export const myTable = pgTable('MyTable', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  name: text('name').notNull(),
});

// Generates: id text PRIMARY KEY with $defaultFn(() => crypto.randomUUID())
// Uses text column for maximum database compatibility
```

**Custom ID generator (e.g., nanoid, cuid):**

```typescript
import { nanoid } from 'nanoid';

export const myTable = pgTable('MyTable', {
  ...generateIdColumnDefs({
    id: {
      dataType: 'string',
      generator: () => nanoid(),  // Custom generator function
    },
  }),
  name: text('name').notNull(),
});

// Generates: id text PRIMARY KEY with $defaultFn(() => nanoid())
```

**Auto-incrementing integer with sequence options:**

```typescript
export const myTable = pgTable('MyTable', {
  ...generateIdColumnDefs({
    id: {
      dataType: 'number',
      sequenceOptions: { startWith: 1000, increment: 1 },
    },
  }),
  name: text('name').notNull(),
});

// Generates: id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (START WITH 1000 INCREMENT BY 1)
```

**Big number with JavaScript number mode (up to 2^53-1):**

```typescript
export const myTable = pgTable('MyTable', {
  ...generateIdColumnDefs({
    id: {
      dataType: 'big-number',
      numberMode: 'number', // Required field
      sequenceOptions: { startWith: 1, increment: 1 },
    },
  }),
  name: text('name').notNull(),
});

// Generates: id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY
// Type-safe: Returns PgBigInt53BuilderInitial (safe for JavaScript numbers)
```

**Big number with BigInt mode (for values > 2^53-1):**

```typescript
export const myTable = pgTable('MyTable', {
  ...generateIdColumnDefs({
    id: {
      dataType: 'big-number',
      numberMode: 'bigint', // Required field
      sequenceOptions: { startWith: 1, increment: 1 },
    },
  }),
  name: text('name').notNull(),
});

// Generates: id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY
// Type-safe: Returns PgBigInt64BuilderInitial (requires BigInt in JavaScript)
```

#### Important Notes

- **Text Column:** When using `dataType: 'string'`, a `text` column is used for maximum database compatibility. This allows you to use any ID format (UUID, nanoid, cuid, etc.) without database-specific constraints.
- **Custom Generator:** You can provide a custom `generator` function to generate IDs. Default is `crypto.randomUUID()`.
- **Type Safety:** The return type is fully inferred based on your options, providing better autocomplete and type checking
- **Big Number Mode:** For `dataType: 'big-number'`, the `numberMode` field is required to specify whether to use JavaScript `number` (up to 2^53-1) or `bigint` (for larger values)
- **Sequence Options:** Available for `number` and `big-number` types to customize identity generation behavior

#### Convenience Wrapper: `enrichId`

```typescript
enrichId(baseColumns: TColumnDefinitions, opts?: TIdEnricherOptions): TColumnDefinitions
```

Merges the generated ID column into an existing column definitions object:

```typescript
import { text } from 'drizzle-orm/pg-core';
import { enrichId } from '@venizia/ignis';

const columns = enrichId(
  { name: text('name').notNull() },
  { id: { dataType: 'string' } },
);
```


### `generateTzColumnDefs`

Adds timestamp columns for tracking entity creation, modification, and soft deletion.

**File:** `packages/core/src/connectors/postgres/models/enrichers/tz.enricher.ts`

#### Signature

```typescript
generateTzColumnDefs<Opts extends TTzEnricherOptions | undefined>(
  opts?: Opts,
): TTzEnricherResult<Opts>
```

#### Options (`TTzEnricherOptions`)

```typescript
type TTzEnricherOptions = {
  created?: { columnName: string; withTimezone: boolean };
  modified?: { enable: false } | { enable?: true; columnName: string; withTimezone: boolean };
  deleted?: { enable: false } | { enable?: true; columnName: string; withTimezone: boolean };
};
```

The `modified` and `deleted` options use a discriminated union pattern:
- When `enable: false`, no other properties are needed
- When `enable: true` (or omitted), `columnName` and `withTimezone` are required

**Default values:**
- `created`: `{ columnName: 'created_at', withTimezone: true }`
- `modified`: `{ enable: true, columnName: 'modified_at', withTimezone: true }`
- `deleted`: `{ enable: false }` (disabled by default)

#### Generated Columns

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `createdAt` | `timestamp` | `NOT NULL` | `now()` | When the record was created (always included) |
| `modifiedAt` | `timestamp` | `NOT NULL` | `now()`, auto-updates via `$onUpdate(() => new Date().toISOString())` | When the record was last modified (optional, enabled by default) |
| `deletedAt` | `timestamp` | nullable | `null` | When the record was soft-deleted (optional, **disabled by default**) |

#### Usage Examples

**Basic usage (default columns):**

```typescript
import { pgTable, text } from 'drizzle-orm/pg-core';
import { generateTzColumnDefs } from '@venizia/ignis';

export const myTable = pgTable('MyTable', {
  ...generateTzColumnDefs(),
  name: text('name').notNull(),
});

// Generates: createdAt, modifiedAt (deletedAt is disabled by default)
```

**Enable soft delete:**

```typescript
export const myTable = pgTable('MyTable', {
  ...generateTzColumnDefs({
    deleted: { enable: true, columnName: 'deleted_at', withTimezone: true },
  }),
  name: text('name').notNull(),
});

// Generates: createdAt, modifiedAt, deletedAt
```

**Custom column names:**

```typescript
export const myTable = pgTable('MyTable', {
  ...generateTzColumnDefs({
    created: { columnName: 'created_date', withTimezone: true },
    modified: { enable: true, columnName: 'updated_date', withTimezone: true },
    deleted: { enable: true, columnName: 'removed_date', withTimezone: true },
  }),
  name: text('name').notNull(),
});
```

**Without timezone:**

```typescript
export const myTable = pgTable('MyTable', {
  ...generateTzColumnDefs({
    created: { columnName: 'created_at', withTimezone: false },
    modified: { enable: true, columnName: 'modified_at', withTimezone: false },
    deleted: { enable: true, columnName: 'deleted_at', withTimezone: false },
  }),
  name: text('name').notNull(),
});
```



**Minimal setup (only createdAt):**

```typescript
export const myTable = pgTable('MyTable', {
  ...generateTzColumnDefs({
    modified: { enable: false },
    deleted: { enable: false },
  }),
  name: text('name').notNull(),
});

// Generates: createdAt only
```

#### Soft Delete Pattern

The `deletedAt` column enables the soft delete pattern, where records are marked as deleted rather than physically removed from the database.

**Example soft delete query:**

```typescript
import { eq, isNull } from 'drizzle-orm';

// Soft delete: set deletedAt timestamp
await db.update(myTable)
  .set({ deletedAt: new Date() })
  .where(eq(myTable.id, id));

// Query only active (non-deleted) records
const activeRecords = await db.select()
  .from(myTable)
  .where(isNull(myTable.deletedAt));

// Query deleted records
const deletedRecords = await db.select()
  .from(myTable)
  .where(isNotNull(myTable.deletedAt));

// Restore a soft-deleted record
await db.update(myTable)
  .set({ deletedAt: null })
  .where(eq(myTable.id, id));
```

#### Type Inference

The enricher provides **conditional TypeScript type inference** based on the options:

```typescript
type TIsoTimestampColumn = ReturnType<typeof isoTimestamp>; // custom ISO 8601 timestamp column

type TTzEnricherResult<Opts extends TTzEnricherOptions | undefined = undefined> = {
  createdAt: NotNull<HasDefault<TIsoTimestampColumn>>;
} & (/* modifiedAt included unless opts.modified.enable === false */)
  & (/* deletedAt included only when opts.deleted.enable === true */);
```

- `createdAt` is always present
- `modifiedAt` is present by default; excluded only when `modified: { enable: false }`
- `deletedAt` is absent by default; included only when `deleted: { enable: true, ... }`

#### Convenience Wrapper: `enrichTz`

```typescript
enrichTz(baseSchema: TColumnDefinitions, opts?: TTzEnricherOptions): TColumnDefinitions
```

Merges timestamp columns into an existing column definitions object.


### `generateUserAuditColumnDefs`

Adds `createdBy` and `modifiedBy` columns to track which user created or modified a record.

**File:** `packages/core/src/connectors/postgres/models/enrichers/user-audit.enricher.ts`

#### Signature

```typescript
generateUserAuditColumnDefs(opts?: TUserAuditEnricherOptions): {
  createdBy: PgIntegerBuilderInitial | PgTextBuilderInitial;
  modifiedBy: PgIntegerBuilderInitial | PgTextBuilderInitial;
}
```

#### Options (`TUserAuditEnricherOptions`)

```typescript
type TUserAuditColumnOpts = {
  dataType: 'string' | 'number';  // Required - type of user ID
  columnName: string;              // Column name in database
  allowAnonymous?: boolean;        // Allow null user ID (default: true)
};

type TUserAuditEnricherOptions = {
  created?: TUserAuditColumnOpts;
  modified?: TUserAuditColumnOpts;
};
```

**Default values:**
- `created`: `{ dataType: 'number', columnName: 'created_by', allowAnonymous: true }`
- `modified`: `{ dataType: 'number', columnName: 'modified_by', allowAnonymous: true }`

#### How It Works

The enricher uses Hono's `contextStorage` (via `tryGetContext()`) to automatically retrieve the current user ID from the request context at insert/update time:

- **`createdBy`**: Set via `$default()` - only populated on record creation
- **`modifiedBy`**: Set via both `$default()` and `$onUpdate()` - populated on creation and updated on every modification

The user ID is read from the `Authentication.AUDIT_USER_ID` key in the Hono context.

#### `allowAnonymous` Behavior

The `allowAnonymous` option controls whether the enricher requires an authenticated user context:

| `allowAnonymous` | No Context | No User ID | Has User ID |
|------------------|------------|------------|-------------|
| `true` (default) | Returns `null` | Returns `null` | Returns user ID |
| `false` | Throws error | Throws error | Returns user ID |

**When to use `allowAnonymous: false`:**
- Sensitive audit trails that must track the responsible user
- Tables where anonymous operations should be forbidden
- Compliance requirements that mandate user attribution

**When to use `allowAnonymous: true` (default):**
- Background jobs, migrations, or seed scripts without user context
- System-generated records
- Tables that allow both authenticated and anonymous operations

> [!WARNING]
> Fire-and-forget promises may run outside the async context, losing access to `AUDIT_USER_ID`. Ensure audit-critical operations complete within the request lifecycle.

#### Generated Columns

| Column | Data Type | Column Name | Description |
|--------|-----------|-------------|-------------|
| `createdBy` | `integer` or `text` | `created_by` | User ID who created the record |
| `modifiedBy` | `integer` or `text` | `modified_by` | User ID who last modified the record |

#### Validation

The enricher validates the `dataType` option and throws an error for invalid values:

```typescript
// Valid
generateUserAuditColumnDefs({ created: { dataType: 'number', columnName: 'created_by' } });
generateUserAuditColumnDefs({ created: { dataType: 'string', columnName: 'created_by' } });

// Invalid - throws error
generateUserAuditColumnDefs({ created: { dataType: 'uuid', columnName: 'created_by' } });
// Error: [enrichUserAudit] Invalid dataType for 'createdBy' | value: uuid | valid: ['number', 'string']
```

#### Usage Examples

**Default (integer user IDs):**

```typescript
import { pgTable, text } from 'drizzle-orm/pg-core';
import { generateIdColumnDefs, generateUserAuditColumnDefs } from '@venizia/ignis';

export const myTable = pgTable('MyTable', {
  ...generateIdColumnDefs(),
  ...generateUserAuditColumnDefs(),
  name: text('name').notNull(),
});

// Generates:
// createdBy: integer('created_by')
// modifiedBy: integer('modified_by')
```

**String user IDs (UUID):**

```typescript
export const myTable = pgTable('MyTable', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  ...generateUserAuditColumnDefs({
    created: { dataType: 'string', columnName: 'created_by' },
    modified: { dataType: 'string', columnName: 'modified_by' },
  }),
  name: text('name').notNull(),
});

// Generates:
// createdBy: text('created_by')
// modifiedBy: text('modified_by')
```

**Custom column names:**

```typescript
export const myTable = pgTable('MyTable', {
  ...generateIdColumnDefs(),
  ...generateUserAuditColumnDefs({
    created: { dataType: 'number', columnName: 'author_id' },
    modified: { dataType: 'number', columnName: 'editor_id' },
  }),
  name: text('name').notNull(),
});

// Generates:
// createdBy: integer('author_id')
// modifiedBy: integer('editor_id')
```

**Requiring authenticated user (allowAnonymous: false):**

```typescript
// For sensitive tables that must track the responsible user
export const auditLogTable = pgTable('AuditLog', {
  ...generateIdColumnDefs(),
  ...generateUserAuditColumnDefs({
    created: { dataType: 'number', columnName: 'created_by', allowAnonymous: false },
    modified: { dataType: 'number', columnName: 'modified_by', allowAnonymous: false },
  }),
  action: text('action').notNull(),
  details: text('details'),
});

// If no authenticated user context is available, throws:
// Error: [getCurrentUserId] Invalid request context to identify user | columnName: createdBy | allowAnonymous: false
```

#### Convenience Wrapper: `enrichUserAudit`

```typescript
enrichUserAudit<ColumnDefinitions extends TColumnDefinitions>(
  baseSchema: ColumnDefinitions,
  opts?: TUserAuditEnricherOptions,
): TUserAuditEnricherResult<ColumnDefinitions>
```

Merges user audit columns into an existing column definitions object with proper type inference.


### `generatePrincipalColumnDefs`

Adds polymorphic principal columns for associating a record with different entity types. This is the polymorphic association pattern where a row can belong to different parent types (e.g., a comment can belong to a Post, User, or Product).

**File:** `packages/core/src/connectors/postgres/models/enrichers/principal.enricher.ts`

#### Signature

```typescript
generatePrincipalColumnDefs<
  Discriminator extends string = 'principal',
  IdType extends 'number' | 'string' = 'number',
>(
  opts: TPrincipalEnricherOptions<Discriminator, IdType>,
): TPrincipalColumnDef<Discriminator, IdType>
```

#### Options (`TPrincipalEnricherOptions`)

```typescript
type TPrincipalEnricherOptions<
  Discriminator extends string = string,
  IdType extends 'number' | 'string' = 'number' | 'string',
> = {
  discriminator?: Discriminator;       // Field name prefix (default: 'principal')
  defaultPolymorphic?: string;         // Default value for the type column (default: '')
  polymorphicIdType: IdType;           // Required - type of the principal ID column
};
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `discriminator` | `string` | `'principal'` | Prefix for generated column names |
| `defaultPolymorphic` | `string` | `''` | Default value for the type discriminator column |
| `polymorphicIdType` | `'number' \| 'string'` | (required) | Data type of the ID column |

#### Generated Columns

Given `discriminator = 'principal'` (default):

| Column | DB Column Name | Type | Constraints | Description |
|--------|---------------|------|-------------|-------------|
| `principalId` | `principal_id` | `integer` or `text` | `NOT NULL` | The ID of the associated entity |
| `principalType` | `principal_type` | `text` | `DEFAULT ''` | The type discriminator (e.g., `'User'`, `'Post'`) |

With a custom discriminator (e.g., `discriminator: 'owner'`):

| Column | DB Column Name | Type |
|--------|---------------|------|
| `ownerId` | `owner_id` | `integer` or `text` |
| `ownerType` | `owner_type` | `text` |

#### Usage Examples

**Default (polymorphic principal with numeric ID):**

```typescript
import { pgTable, text } from 'drizzle-orm/pg-core';
import { generateIdColumnDefs, generatePrincipalColumnDefs } from '@venizia/ignis';

export const commentTable = pgTable('Comment', {
  ...generateIdColumnDefs(),
  ...generatePrincipalColumnDefs({ polymorphicIdType: 'number' }),
  content: text('content').notNull(),
});

// Generates:
// principalId: integer('principal_id').notNull()
// principalType: text('principal_type').default('')
```

**Custom discriminator name:**

```typescript
export const attachmentTable = pgTable('Attachment', {
  ...generateIdColumnDefs(),
  ...generatePrincipalColumnDefs({
    discriminator: 'owner',
    polymorphicIdType: 'string',
    defaultPolymorphic: 'User',
  }),
  filePath: text('file_path').notNull(),
});

// Generates:
// ownerId: text('owner_id').notNull()
// ownerType: text('owner_type').default('User')
```

**Polymorphic association pattern:**

```typescript
// A notification can belong to different entity types
export const notificationTable = pgTable('Notification', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  ...generatePrincipalColumnDefs({
    discriminator: 'target',
    polymorphicIdType: 'string',
  }),
  message: text('message').notNull(),
});

// Usage:
// { targetId: 'user-123', targetType: 'User', message: 'Welcome!' }
// { targetId: 'order-456', targetType: 'Order', message: 'Order shipped' }
```

#### Convenience Wrapper: `enrichPrincipal`

```typescript
enrichPrincipal<ColumnDefinitions extends TColumnDefinitions>(
  baseSchema: ColumnDefinitions,
  opts: TPrincipalEnricherOptions,
): ColumnDefinitions & TPrincipalColumnDef
```

Merges principal columns into an existing column definitions object.


### `generateDataTypeColumnDefs`

Adds polymorphic data storage columns for entities that need to store values of different types in a single table. This is useful for key-value stores, settings tables, or any schema where a row's value type is determined at runtime.

**File:** `packages/core/src/connectors/postgres/models/enrichers/data-type.enricher.ts`

#### Signature

```typescript
generateDataTypeColumnDefs(opts?: TDataTypeEnricherOptions): {
  dataType: PgTextBuilderInitial;
  nValue: PgDoublePrecisionBuilderInitial;
  tValue: PgTextBuilderInitial;
  bValue: PgCustomColumnBuilder<Buffer>;
  jValue: PgJsonbBuilderInitial<Record<string, any>>;
  boValue: PgBooleanBuilderInitial;
}
```

#### Options (`TDataTypeEnricherOptions`)

```typescript
type TDataTypeEnricherOptions = {
  defaultValue: Partial<{
    dataType: string;
    nValue: number;
    tValue: string;
    bValue: Buffer;
    jValue: object;
    boValue: boolean;
  }>;
};
```

#### Generated Columns

| Column | SQL Type | DB Column Name | TypeScript Type | Purpose |
|--------|----------|----------------|-----------------|---------|
| `dataType` | `text` | `data_type` | `string` | Type discriminator (e.g., `'number'`, `'text'`, `'json'`) |
| `nValue` | `double precision` | `n_value` | `number` | Numeric values |
| `tValue` | `text` | `t_value` | `string` | Text values |
| `bValue` | `bytea` | `b_value` | `Buffer` | Binary values |
| `jValue` | `jsonb` | `j_value` | `Record<string, any>` | JSON values |
| `boValue` | `boolean` | `bo_value` | `boolean` | Boolean values |

All columns are **nullable** by default (no `NOT NULL` constraint), since only one value column is typically populated per row depending on the `dataType` discriminator.

#### Usage Examples

**Basic usage:**

```typescript
import { pgTable } from 'drizzle-orm/pg-core';
import { BaseEntity, model, generateIdColumnDefs, generateDataTypeColumnDefs } from '@venizia/ignis';

@model({ type: 'entity' })
export class Setting extends BaseEntity<typeof Setting.schema> {
  static override schema = pgTable('Setting', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    ...generateDataTypeColumnDefs(),
  });
}
```

**With default values:**

```typescript
export const settingTable = pgTable('Setting', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  ...generateDataTypeColumnDefs({
    defaultValue: { dataType: 'text', tValue: '' },
  }),
});

// Generates columns with SQL defaults:
// data_type text DEFAULT 'text'
// t_value text DEFAULT ''
// nValue, bValue, jValue, boValue - no defaults
```

**Key-value store pattern:**

```typescript
@model({ type: 'entity' })
export class AppConfig extends BaseEntity<typeof AppConfig.schema> {
  static override schema = pgTable('AppConfig', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    ...generateDataTypeColumnDefs(),
    key: text('key').notNull().unique(),
    description: text('description'),
  });
}

// Usage:
// { key: 'max_retries', dataType: 'number', nValue: 3 }
// { key: 'welcome_message', dataType: 'text', tValue: 'Hello!' }
// { key: 'feature_flags', dataType: 'json', jValue: { darkMode: true } }
// { key: 'is_maintenance', dataType: 'boolean', boValue: false }
```

#### Convenience Wrapper: `enrichDataTypes`

```typescript
enrichDataTypes(
  baseSchema: TColumnDefinitions,
  opts?: TDataTypeEnricherOptions,
): TColumnDefinitions
```

Merges data type columns into an existing column definitions object:

```typescript
import { text } from 'drizzle-orm/pg-core';
import { enrichDataTypes, generateIdColumnDefs } from '@venizia/ignis';

const baseColumns = {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  key: text('key').notNull(),
};

// Merge data type columns into existing column definitions
const allColumns = enrichDataTypes(baseColumns);

export const configTable = pgTable('Config', allColumns);
```


## Schema Utilities

### `idParamsSchema`

Generates a Zod schema for path parameters containing an `id` field, suitable for OpenAPI route definitions.

**File:** `packages/core/src/base/models/common/types.ts`

#### Signature

```typescript
idParamsSchema(opts?: { idType: TIdSchemaType }): z.ZodObject<{ id: z.ZodNumber | z.ZodString }>
```

| `idType` | Default | Zod Type | Examples |
|----------|---------|----------|----------|
| `'number'` | Yes | `z.number()` | `[1, 2, 3]` |
| `'string'` | | `z.string()` | `['4651e634-...', 'some_unique_id']` |

Throws an error for invalid `idType` values.

### `jsonContent`

Creates an OpenAPI JSON content specification:

```typescript
jsonContent<T extends z.ZodType>(opts: {
  schema: T;
  description: string;
  required?: boolean;
}): { description, content: { 'application/json': { schema } }, required? }
```

### `jsonResponse`

Creates a complete OpenAPI response specification with success and error responses:

```typescript
jsonResponse<ContentSchema, HeaderSchema>(opts: {
  schema: ContentSchema;
  description?: string;  // Default: 'Success Response'
  required?: boolean;
  headers?: HeaderSchema;
}): {
  200: { description, content, headers? },
  '4xx | 5xx': { description: 'Error Response', content: ErrorSchema }
}
```

### `snakeToCamel`

Converts a Zod schema from snake_case to camelCase, transforming both the schema shape and runtime data.

**File:** `packages/core/src/base/models/common/types.ts`

#### Signature

```typescript
snakeToCamel<T extends z.ZodRawShape>(shape: T): z.ZodEffects<...>
```

#### Purpose

This utility is useful when working with databases that use snake_case column names but you want to work with camelCase in your TypeScript code. It creates a Zod schema that:

1. Accepts snake_case input (validates against original schema)
2. Transforms the data to camelCase at runtime
3. Validates the transformed data against a camelCase schema

#### Usage Example

```typescript
import { z } from 'zod';
import { snakeToCamel } from '@venizia/ignis';

// Define schema with snake_case fields
const userSnakeSchema = {
  user_id: z.number(),
  first_name: z.string(),
  last_name: z.string(),
  created_at: z.date(),
  is_active: z.boolean(),
};

// Convert to camelCase schema
const userCamelSchema = snakeToCamel(userSnakeSchema);

// Input data from database (snake_case)
const dbData = {
  user_id: 123,
  first_name: 'John',
  last_name: 'Doe',
  created_at: new Date(),
  is_active: true,
};

// Parse and transform to camelCase
const result = userCamelSchema.parse(dbData);

// Result is automatically camelCase:
console.log(result);
// {
//   userId: 123,
//   firstName: 'John',
//   lastName: 'Doe',
//   createdAt: Date,
//   isActive: true
// }
```

#### Real-world Example

**Use case:** API endpoint that accepts snake_case but works with camelCase internally

```typescript
import { BaseRestController, controller, snakeToCamel } from '@venizia/ignis';
import { HTTP } from '@venizia/ignis-helpers';
import { z } from '@hono/zod-openapi';

const createUserSchema = snakeToCamel({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email_address: z.string().email(),
  phone_number: z.string().optional(),
});

@controller({ path: '/users' })
export class UserController extends BaseRestController {
  override binding() {
    this.bindRoute({
      configs: {
        path: '/',
        method: 'post',
        request: {
          body: {
            content: {
              'application/json': { schema: createUserSchema },
            },
          },
        },
      },
    }).to({
      handler: async (ctx) => {
        // Request body is automatically camelCase
        const data = ctx.req.valid('json');

        // data = {
        //   firstName: string,
        //   lastName: string,
        //   emailAddress: string,
        //   phoneNumber?: string
        // }

        // Work with camelCase data
        console.log(data.firstName);  // TypeScript knows this exists
        console.log(data.first_name);  // TypeScript error

        return ctx.json({ success: true }, HTTP.ResultCodes.RS_2.Ok);
      },
    });
  }
}
```

#### Type Transformation

The utility includes sophisticated TypeScript type transformation:

```typescript
type TSnakeToCamelCase<S extends string> =
  S extends `${infer T}_${infer U}`
    ? `${T}${Capitalize<TSnakeToCamelCase<U>>}`
    : S;

type TCamelCaseKeys<T extends z.ZodRawShape> = {
  [K in keyof T as K extends string ? TSnakeToCamelCase<K> : K]:
    T[K] extends z.ZodType<infer U> ? z.ZodType<U> : T[K];
};
```

This ensures full type safety: TypeScript will know that `first_name` becomes `firstName`, `created_at` becomes `createdAt`, etc.

#### Validation

The schema validates twice for safety:

1. **First validation:** Checks that input matches snake_case schema
2. **Transformation:** Converts keys from snake_case to camelCase
3. **Second validation:** Validates transformed data against camelCase schema

```typescript
// If validation fails at any step, you get clear error messages
const invalidData = {
  user_id: 'not-a-number',  // Fails first validation
  first_name: 'John',
  last_name: 'Doe',
};

try {
  userCamelSchema.parse(invalidData);
} catch (error) {
  // ZodError with clear message about user_id expecting number
}
```

#### Notes

- Built on top of `keysToCamel()` and `toCamel()` utilities from `@venizia/ignis-helpers`
- Recursively handles nested objects
- Preserves array structures
- Works seamlessly with Zod's other features (refinements, transforms, etc.)

### `getIdType`

There are two distinct `getIdType`s in the framework - don't confuse them:

| | Neutral instance method | PostgreSQL utility function |
|---|---|---|
| **Location** | `AbstractEntity.getIdType()` (`packages/core/src/base/models/base.ts`) | `getIdType()` (`packages/core/src/connectors/postgres/models/common/types.ts`) |
| **Signature** | `getIdType(): TIdSchemaType` | `getIdType<T extends TTableSchemaWithId>(opts: { entity: T }): string` |
| **Purpose** | Neutral capability every engine's entity implements - returns `'string'` \| `'number'` at the entity level. Used by `idParamsSchema` to build the right Zod schema for path parameters. | PostgreSQL-specific: inspects a Drizzle table schema's `id` column and returns its `dataType` (e.g., `'number'`, `'string'`), or `'unknown'` if not determinable |

```typescript
// Neutral - instance method every AbstractEntity subclass exposes (default 'string', BasePostgresEntity overrides based on the column)
const entity = new User();
entity.getIdType(); // 'string' | 'number'

// PostgreSQL connector - standalone utility inspecting a raw Drizzle schema
import { getIdType } from '@venizia/ignis/postgres';
getIdType({ entity: User.schema }); // 'string' | 'number' | 'unknown'
```

## See Also

- **Related Concepts:**
  - [Models Guide](/guides/core-concepts/persistent/models) - Creating models tutorial
  - [Repositories](/guides/core-concepts/persistent/repositories) - Using models in repositories
  - [DataSources](/guides/core-concepts/persistent/datasources) - Database connections

- **References:**
  - [Repositories API](/references/base/repositories/) - Data access layer
  - [Relations](/references/base/repositories/relations) - Model relationships
  - [Filter System](/references/base/filter-system/) - Querying models

- **External Resources:**
  - [Drizzle ORM Documentation](https://orm.drizzle.team/) - Schema definition guide
  - [PostgreSQL Data Types](https://www.postgresql.org/docs/current/datatype.html) - Column types

- **Best Practices:**
  - [Data Modeling](/best-practices/data-modeling) - Schema design patterns

- **Tutorials:**
  - [Building a CRUD API](/guides/tutorials/building-a-crud-api) - Model examples
  - [E-commerce API](/guides/tutorials/ecommerce-api) - Models with relations
