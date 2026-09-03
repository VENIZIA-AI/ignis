---
title: Models - Full Reference
description: Complete reference for model architecture, the @model decorator, entity members, and schema enrichers
difficulty: intermediate
---

# Models - Full Reference

Exhaustive reference for the `@model` decorator, the entity class hierarchy, and every schema enricher. For a readable introduction and the common tasks, start with the [Models overview](/references/base/models).

**Files:**

- [`packages/core-server/src/base/models/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/base/models/base.ts) - neutral `AbstractEntity`
- [`packages/core-server/src/connectors/postgres/models/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/connectors/postgres/models/base.ts) - PostgreSQL entity (`BaseRelationalEntity`, aliases `BaseEntity`/`BasePostgresEntity`)
- [`packages/core-server/src/base/metadata/persistents.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/base/metadata/persistents.ts) - `@model` decorator
- [`packages/core-server/src/connectors/postgres/models/enrichers`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/connectors/postgres/models/enrichers) - schema enrichers

## `AbstractEntity` (neutral) vs. `BaseEntity` (connector)

IGNIS separates the engine-neutral entity root from the connector-specific implementation.

- **Engine-neutral root.** `AbstractEntity` has no Drizzle, no `pgTable`, and no `drizzle-zod`.
- **Minimal surface.** It carries only a `name`, an abstract `getSchema()`, a `getIdType(): TIdSchemaType` method (default `'string'`), and `toObject()`/`toJSON()`.
- **Everything else is connector-owned.** The Drizzle-backed entity, `drizzle-zod` schema generation, and all schema enrichers belong to the PostgreSQL connector, not the neutral base. See [Connectors](/references/base/connectors) for the full base-vs-connector architecture.

`Source ->` [`packages/core-server/src/base/models/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/base/models/base.ts)

```typescript
export abstract class AbstractEntity<Schema = unknown> extends BaseHelper {
  name: string;

  constructor(opts: { name: string }) {
    super({ scope: opts.name });
    this.name = opts.name;
  }

  abstract getSchema<T = Schema>(opts: { type: TSchemaType }): T;

  getIdType(): TIdSchemaType {
    return 'string';
  }

  toObject() {
    return { ...this };
  }

  toJSON() {
    return this.toObject();
  }
}
```

> [!TIP] Naming
> The canonical PostgreSQL class is `BaseRelationalEntity`. `BaseEntity` and `BasePostgresEntity` are compatibility aliases re-exporting the same class from `connectors/postgres/models/index.ts` - all three resolve to identical runtime behavior. Code samples use `BaseEntity`, the most common import today.

## The `@model` Decorator

Marks a class as a database entity and configures its behavior.

`Source ->` [`packages/core-server/src/base/metadata/persistents.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/base/metadata/persistents.ts)

```typescript
@model({
  type: 'entity' | 'view',
  tableName?: string,
  skipMigrate?: boolean,
  settings?: {
    hiddenProperties?: string[],
    defaultFilter?: TFilter,
    defaultLimit?: number,
    authorize?: {
      principal: string,
      [extra: string | symbol]: any,
    },
  },
})
```

### Options

| Option | Type | Description |
|--------|------|-------------|
| `type` | `'entity' \| 'view'` | Entity type - `'entity'` for tables, `'view'` for database views |
| `tableName` | `string` | Optional custom table name. Resolution order: `tableName` > static `TABLE_NAME` > class name |
| `skipMigrate` | `boolean` | Skip this model during schema migrations |
| `settings.hiddenProperties` | `string[]` | Property names excluded from all repository query results (at SQL level) |
| `settings.defaultFilter` | `TFilter` | Filter automatically applied to all repository queries (see [Default Filter](/references/base/filter-system/default-filter)) |
| `settings.defaultLimit` | `number` | Default row limit applied when a query omits `limit`. Must be a positive integer (validated at decoration time). Falls back to the global `DEFAULT_LIMIT` (10). See [Pagination](/references/base/filter-system/fields-order-pagination#default-limit) |
| `settings.authorize` | `IModelAuthorizeSettings` | Authorization settings - declares the model's authorization principal (see [Authorization](/extensions/components/authorization/usage#model-based-resource-references)) |
| `settings.authorize.principal` | `string` | The authorization subject name for this model. Auto-populates the static `AUTHORIZATION_SUBJECT` property |

### Behavior

When the `@model` decorator is applied:

1. If `settings.defaultLimit` is provided, it is validated to be a positive integer - otherwise the decorator throws at decoration (boot) time.
2. If `settings.authorize.principal` is provided and `AUTHORIZATION_SUBJECT` is not already an own property of the class, it auto-populates `AUTHORIZATION_SUBJECT` with the principal value.
3. The model is registered in the `MetadataRegistry` model registry, keyed by table name (resolved as `metadata.tableName` > static `TABLE_NAME` > class name).
4. The static `relations` property is stored as a resolver (not immediately resolved) to avoid circular dependency issues between models.

## `BaseEntity` (`BaseRelationalEntity`)

PostgreSQL connector entity class, wrapping a Drizzle ORM schema. Extends the neutral `AbstractEntity`.

`Source ->` [`packages/core-server/src/connectors/postgres/models/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/connectors/postgres/models/base.ts)

### Purpose

| Feature | Description |
|---------|-------------|
| Schema encapsulation | Holds the Drizzle `pgTable` schema for consistent repository access |
| Metadata | Works with the `@model` decorator to mark database entities |
| Schema generation | Uses `drizzle-zod` to generate Zod schemas (`select`, `create`, `update`) |
| Static properties | Supports static `schema`, `relations`, `TABLE_NAME`, and `AUTHORIZATION_SUBJECT` |
| Convenience | Inherits `toObject()` and `toJSON()` from `AbstractEntity` |

### Static properties

| Property | Type | Description |
|----------|------|-------------|
| `schema` | `TTableSchemaWithId` | Drizzle table schema defined with `pgTable()` |
| `relations` | `TValueOrResolver<Array<TRelationConfig>>` | Relation definitions (can be a function for lazy loading to avoid circular deps) |
| `TABLE_NAME` | `string \| undefined` | Optional table name (defaults to class name if not set) |
| `AUTHORIZATION_SUBJECT` | `string \| undefined` | Authorization principal name. Auto-populated from `@model` `settings.authorize.principal` |

### Instance members

| Member | Description |
|--------|-------------|
| `schema` | Instance copy of the Drizzle schema (`opts.schema` > static `schema`) |
| `getSchema({ type })` | Get a Zod schema for validation (`'select'`, `'create'`, `'update'`) |
| `getIdType()` | Maps the id column's Drizzle `dataType` to `'number'` (serial/integer) or `'string'` (everything else) |
| `toObject()` | Convert to a plain object (shallow spread of `this`) |
| `toJSON()` | Delegates to `toObject()` (used by `JSON.stringify`) |

### `IEntity` interface

Models implementing static properties conform to `IEntity`:

```typescript
interface IEntity<Schema extends TTableSchemaWithId = TTableSchemaWithId> {
  TABLE_NAME?: string;
  schema: Schema;
  relations?: TValueOrResolver<Array<TRelationConfig>>;
}
```

### `getSchema` method

Generates a Zod validation schema from the Drizzle table schema using `drizzle-zod`.

```typescript
getSchema(opts: { type: TSchemaType }): ZodSchema
```

The `type` parameter accepts lowercase string values defined in the `SchemaTypes` class:

| Type | Value | Zod schema generated | Description |
|------|-------|---------------------|-------------|
| `SchemaTypes.SELECT` | `'select'` | `createSelectSchema(schema)` | Schema for query results |
| `SchemaTypes.CREATE` | `'create'` | `createInsertSchema(schema)` | Schema for insert operations |
| `SchemaTypes.UPDATE` | `'update'` | `createUpdateSchema(schema)` | Schema for update operations |

```typescript
const user = new User();
const createSchema = user.getSchema({ type: 'create' });
const selectSchema = user.getSchema({ type: 'select' });
const updateSchema = user.getSchema({ type: 'update' });
```

An invalid `type` throws. The `schemaFactory` is a static lazy singleton created via `drizzle-zod`'s `createSchemaFactory()`, shared across all entity instances to avoid per-entity overhead.

### Class definition

```typescript
export class BaseRelationalEntity<Schema extends TTableSchemaWithId = TTableSchemaWithId>
  extends AbstractEntity
  implements IEntity<Schema>
{
  schema: Schema;

  static schema: TTableSchemaWithId;
  static relations?: TValueOrResolver<Array<TRelationConfig>>;
  static TABLE_NAME?: string;
  static AUTHORIZATION_SUBJECT?: string;

  private static _schemaFactory?: ReturnType<typeof createSchemaFactory>;
  protected static get schemaFactory(): ReturnType<typeof createSchemaFactory> {
    return (BaseRelationalEntity._schemaFactory ??= createSchemaFactory());
  }

  constructor(opts?: { name?: string; schema?: Schema }) {
    const ctor = new.target as typeof BaseRelationalEntity;
    const name = opts?.name ?? ctor.TABLE_NAME ?? ctor.name;
    super({ name });
    this.schema = opts?.schema ?? (ctor.schema as Schema);
  }

  override getIdType(): TIdSchemaType {
    return getIdType({ entity: this.schema }) === 'number' ? 'number' : 'string';
  }

  getSchema<T = unknown>(opts: { type: TSchemaType }): T {
    const factory = BaseRelationalEntity.schemaFactory;
    switch (opts.type) {
      case SchemaTypes.CREATE:
        return factory.createInsertSchema(this.schema) as T;
      case SchemaTypes.UPDATE:
        return factory.createUpdateSchema(this.schema) as T;
      case SchemaTypes.SELECT:
        return factory.createSelectSchema(this.schema) as T;
      default:
        throw getError({ message: `[getSchema] Invalid schema type | type: ${opts.type}` });
    }
  }
}
```

## Definition patterns

`BaseEntity` supports two patterns for defining models.

### Static properties (recommended)

Define schema and relations as static properties. Repositories auto-resolve them.

```typescript
import { pgTable, text } from 'drizzle-orm/pg-core';
import { BaseEntity, model, generateIdColumnDefs, RelationTypes } from '@venizia/ignis';
import type { TRelationConfig } from '@venizia/ignis/postgres';
import { Comment } from './comment.model';

export const userTable = pgTable('User', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  name: text('name').notNull(),
  email: text('email').notNull(),
});

@model({ type: 'entity' })
export class User extends BaseEntity<typeof User.schema> {
  static override schema = userTable;
  static override TABLE_NAME = 'User';

  // A resolver returning a plain array of relation configs (lazy - avoids circular imports).
  static override relations = (): TRelationConfig[] => [
    {
      name: 'comments',
      type: RelationTypes.MANY,
      schema: Comment.schema,
      metadata: { relationName: 'author' },
    },
  ];
}
```

- **Auto-resolved.** Schema and relations are auto-resolved by repositories.
- **Less ceremony.** No need to pass `relations` in a repository constructor.
- **Declarative.** Cleaner than wiring dependencies through a constructor.

### Constructor-based (legacy)

Pass schema in the constructor.

```typescript
@model({ type: 'entity' })
export class User extends BaseEntity<typeof userTable> {
  constructor() {
    super({ name: 'User', schema: userTable });
  }
}
```

## Hidden properties

Hidden properties are excluded at the SQL level - they are never fetched from the database when querying through repositories.

- **Security.** Sensitive data like passwords is never accidentally exposed.
- **Performance.** Less data is transferred.
- **Consistency.** Exclusion applies across all repository operations.

```typescript
import { pgTable, text } from 'drizzle-orm/pg-core';
import { BaseEntity, model, generateIdColumnDefs } from '@venizia/ignis';

@model({
  type: 'entity',
  settings: { hiddenProperties: ['password', 'secret'] },
})
export class User extends BaseEntity<typeof User.schema> {
  static override schema = pgTable('User', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    email: text('email').notNull(),
    password: text('password'),
    secret: text('secret'),
  });
}
```

### Behavior matrix

| Operation | Hidden properties |
|-----------|-------------------|
| `find()`, `findOne()`, `findById()` | Excluded from SELECT |
| `create()`, `createAll()` | Excluded from RETURNING |
| `updateById()`, `updateAll()` | Excluded from RETURNING |
| `deleteById()`, `deleteAll()` | Excluded from RETURNING |
| `count()`, `existsWith()` | Can filter by hidden fields |
| Direct connector query | Included (bypasses repository) |

Notes:

- Hidden properties can still be used in `where` clauses for filtering.
- Data is still stored in the database - only excluded from query results.
- Use a direct connector query when you need to access hidden data:

```typescript
// Repository query - password/secret NOT included
const user = await userRepository.findById({ id: '123' });
// user = { id: '123', email: 'john@example.com' }

// Direct connector query - ALL fields included
const connector = userRepository.connector;
const [fullUser] = await connector
  .select()
  .from(User.schema)
  .where(eq(User.schema.id, '123'));
// fullUser = { id: '123', email: '...', password: 'hashed...', secret: '...' }
```

## Default filter

Default filters are automatically applied to all repository queries for a model. Useful for soft delete, multi-tenancy, active-record filtering, and query limits.

```typescript
import { model, BaseEntity } from '@venizia/ignis';
import { postTable } from '@/schemas';

@model({
  type: 'entity',
  settings: {
    defaultFilter: {
      where: { isDeleted: false },
      limit: 100,
    },
  },
})
export class Post extends BaseEntity<typeof Post.schema> {
  static override schema = postTable;
}
```

### Behavior matrix

| Operation | Default filter |
|-----------|----------------|
| `find()`, `findOne()`, `findById()` | Applied to WHERE clause |
| `count()`, `existsWith()` | Applied to WHERE clause |
| `updateById()`, `updateAll()` | Applied to WHERE clause |
| `deleteById()`, `deleteAll()` | Applied to WHERE clause |
| `create()`, `createAll()` | Not applied |

### Bypassing

Use `shouldSkipDefaultFilter: true` to bypass it:

```typescript
// Normal query - includes default filter
await postRepository.find({ filter: {} });
// WHERE isDeleted = false LIMIT 100

// Admin query - bypass default filter
await postRepository.find({
  filter: {},
  options: { shouldSkipDefaultFilter: true },
});
// No default WHERE clause (includes deleted)
```

> [!TIP]
> See [Default Filter](/references/base/filter-system/default-filter) for full documentation including merge strategies and common patterns.

## Schema enrichers

- **What they are.** Helper functions in the PostgreSQL connector that return an object of Drizzle ORM column definitions.
- **How to use them.** Spread a `generate*` result into a `pgTable` definition to add common, standardized fields.
- **Convenience wrappers.** Each `enrich*` wrapper accepts an existing column definitions object as its first argument and merges the generated columns into it.

| Enricher function | Convenience wrapper | Purpose |
| :--- | :--- | :--- |
| `generateIdColumnDefs` | `enrichId` | Adds a primary key `id` column (string, integer, or big integer) |
| `generateTzColumnDefs` | `enrichTz` | Adds `createdAt`, `modifiedAt`, and optional `deletedAt` timestamp columns |
| `generateUserAuditColumnDefs` | `enrichUserAudit` | Adds `createdBy` and `modifiedBy` columns tracking user audit info |
| `generatePrincipalColumnDefs` | `enrichPrincipal` | Adds polymorphic principal columns (`{discriminator}Id` and `{discriminator}Type`) |
| `generateDataTypeColumnDefs` | `enrichDataTypes` | Adds generic value columns (`dataType`, `nValue`, `tValue`, `bValue`, `jValue`, `boValue`) |

### Combined example

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

### `generateIdColumnDefs`

Adds a primary key `id` column with full TypeScript type inference.

`Source ->` [`packages/core-server/src/connectors/postgres/models/enrichers/id.enricher.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/connectors/postgres/models/enrichers/id.enricher.ts)

```typescript
generateIdColumnDefs<Opts extends TIdEnricherOptions | undefined>(opts?: Opts): TIdColumnDef<Opts>
```

Options (`TIdEnricherOptions`):

```typescript
type TIdEnricherOptions = {
  id?: { columnName?: string } & (
    | { dataType: 'string'; generator?: () => string }
    | { dataType: 'number'; sequenceOptions?: PgSequenceOptions }
    | {
        dataType: 'big-number';
        numberMode: 'number' | 'bigint';
        sequenceOptions?: PgSequenceOptions;
      }
  );
};
```

Default: `id.dataType` defaults to `'number'` (auto-incrementing integer).

Emitted columns:

| Data type | Column type | Constraints | Description |
|-----------|------------|-------------|-------------|
| `'string'` | `text` | Primary key, default `crypto.randomUUID()` | Text column with customizable ID generator |
| `'number'` | `integer` | Primary key, `GENERATED ALWAYS AS IDENTITY` | Auto-incrementing integer |
| `'big-number'` | `bigint` | Primary key, `GENERATED ALWAYS AS IDENTITY` | Auto-incrementing big integer (mode `'number'` or `'bigint'`) |

Notes:

- For `dataType: 'string'`, a `text` column is used for maximum database compatibility. Provide a custom `generator` (nanoid, cuid, etc.); the default is `crypto.randomUUID()`.
- For `dataType: 'big-number'`, `numberMode` is required - `'number'` (values up to 2^53-1, safe for JavaScript numbers) or `'bigint'` (larger values, requires `BigInt`).
- `sequenceOptions` (available for `number` and `big-number`) customizes identity generation, e.g. `{ startWith: 1000, increment: 1 }`.

Convenience wrapper:

```typescript
enrichId(baseColumns: TColumnDefinitions, opts?: TIdEnricherOptions): TColumnDefinitions
```

### `generateTzColumnDefs`

Adds timestamp columns for creation, modification, and soft deletion.

`Source ->` [`packages/core-server/src/connectors/postgres/models/enrichers/tz.enricher.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/connectors/postgres/models/enrichers/tz.enricher.ts)

```typescript
generateTzColumnDefs<Opts extends TTzEnricherOptions | undefined>(opts?: Opts): TTzEnricherResult<Opts>
```

Options (`TTzEnricherOptions`):

```typescript
type TTzEnricherOptions = {
  created?: { columnName: string; withTimezone: boolean };
  modified?: { enable: false } | { enable?: true; columnName: string; withTimezone: boolean };
  deleted?: { enable: false } | { enable?: true; columnName: string; withTimezone: boolean };
};
```

The `modified` and `deleted` options use a discriminated union:

- **`enable: false`.** No other properties are needed.
- **`enable: true` (or omitted).** `columnName` and `withTimezone` are required.

Defaults:

- `created`: `{ columnName: 'created_at', withTimezone: true }`
- `modified`: `{ enable: true, columnName: 'modified_at', withTimezone: true }`
- `deleted`: `{ enable: false }` (disabled by default)

Emitted columns:

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `createdAt` | timestamp | `NOT NULL` | `NOW()` | When the record was created (always included) |
| `modifiedAt` | timestamp | `NOT NULL` | `NOW()`, auto-updates via `$onUpdate(() => new Date().toISOString())` | When the record was last modified (enabled by default) |
| `deletedAt` | timestamp | nullable | none | When the record was soft-deleted (disabled by default) |

**Type inference**

- **`createdAt`.** Always present.
- **`modifiedAt`.** Present unless `modified: { enable: false }`.
- **`deletedAt`.** Absent unless `deleted: { enable: true, ... }`.

Convenience wrapper:

```typescript
enrichTz(baseSchema: TColumnDefinitions, opts?: TTzEnricherOptions): TColumnDefinitions
```

<details>
<summary>Soft delete pattern</summary>

The `deletedAt` column enables soft delete - records are marked deleted rather than physically removed.

```typescript
import { eq, isNull, isNotNull } from 'drizzle-orm';

// Soft delete: set deletedAt timestamp
await db.update(myTable).set({ deletedAt: new Date() }).where(eq(myTable.id, id));

// Query only active (non-deleted) records
const active = await db.select().from(myTable).where(isNull(myTable.deletedAt));

// Query deleted records
const deleted = await db.select().from(myTable).where(isNotNull(myTable.deletedAt));

// Restore a soft-deleted record
await db.update(myTable).set({ deletedAt: null }).where(eq(myTable.id, id));
```

</details>

### `generateUserAuditColumnDefs`

Adds `createdBy` and `modifiedBy` columns tracking which user created or modified a record.

`Source ->` [`packages/core-server/src/connectors/postgres/models/enrichers/user-audit.enricher.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/connectors/postgres/models/enrichers/user-audit.enricher.ts)

```typescript
generateUserAuditColumnDefs(opts?: TUserAuditEnricherOptions): {
  createdBy: PgIntegerBuilderInitial | PgTextBuilderInitial;
  modifiedBy: PgIntegerBuilderInitial | PgTextBuilderInitial;
}
```

Options:

```typescript
type TUserAuditColumnOpts = {
  dataType: 'string' | 'number';  // Required - type of user ID
  columnName: string;             // Column name in database
  allowAnonymous?: boolean;       // Allow null user ID (default: true)
};

type TUserAuditEnricherOptions = {
  created?: TUserAuditColumnOpts;
  modified?: TUserAuditColumnOpts;
};
```

Defaults:

- `created`: `{ dataType: 'number', columnName: 'created_by', allowAnonymous: true }`
- `modified`: `{ dataType: 'number', columnName: 'modified_by', allowAnonymous: true }`

**How it works**

- **Retrieval.** The enricher reads the request context from `RequestContextRegistry` at insert/update time, then takes the user ID off the `Authentication.AUDIT_USER_ID` key. An application installs the resolver over that registry when it registers its default middlewares, backed by Hono's `contextStorage`. A host that installs none - a browser Worker - has no request context at all, which is the `allowAnonymous` case below.
- **`createdBy`.** Set via `$default()` - creation only.
- **`modifiedBy`.** Set via both `$default()` and `$onUpdate()` - creation and every modification.

Emitted columns:

| Column | Data type | Default column name | Description |
|--------|-----------|---------------------|-------------|
| `createdBy` | `integer` or `text` | `created_by` | User ID who created the record |
| `modifiedBy` | `integer` or `text` | `modified_by` | User ID who last modified the record |

`allowAnonymous` behavior:

| `allowAnonymous` | No context | No user ID | Has user ID |
|------------------|------------|------------|-------------|
| `true` (default) | Returns `null` | Returns `null` | Returns user ID |
| `false` | Throws error | Throws error | Returns user ID |

- **`allowAnonymous: false`.** Use for sensitive audit trails, tables that forbid anonymous operations, and compliance requirements mandating user attribution.
- **`allowAnonymous: true` (default).** Use for background jobs, migrations, seed scripts, and system-generated records.

The enricher validates `dataType` and throws for invalid values (only `'number'` and `'string'` are valid).

> [!WARNING]
> Fire-and-forget promises may run outside the async context, losing access to `AUDIT_USER_ID`. Ensure audit-critical operations complete within the request lifecycle.

Convenience wrapper:

```typescript
enrichUserAudit<ColumnDefinitions extends TColumnDefinitions>(
  baseSchema: ColumnDefinitions,
  opts?: TUserAuditEnricherOptions,
): TUserAuditEnricherResult<ColumnDefinitions>
```

### `generatePrincipalColumnDefs`

Adds polymorphic principal columns for associating a record with different entity types (a comment can belong to a Post, User, or Product).

`Source ->` [`packages/core-server/src/connectors/postgres/models/enrichers/principal.enricher.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/connectors/postgres/models/enrichers/principal.enricher.ts)

```typescript
generatePrincipalColumnDefs<
  Discriminator extends string = 'principal',
  IdType extends 'number' | 'string' = 'number',
  Nullable extends boolean = false,
>(
  opts: TPrincipalEnricherOptions<Discriminator, IdType, Nullable>,
): TPrincipalColumnDef<Discriminator, IdType, Nullable>
```

Options (`TPrincipalEnricherOptions`):

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `discriminator` | `string` | `'principal'` | Prefix for generated column names |
| `defaultPolymorphic` | `string` | `''` | Default value for the type discriminator column |
| `polymorphicIdType` | `'number' \| 'string'` | (required) | Data type of the ID column |
| `isNullableId` | `boolean` | `false` | When `true`, the ID column is nullable (omits `NOT NULL`) |

Emitted columns, given `discriminator = 'principal'`:

| Column | DB column name | Type | Constraints | Description |
|--------|---------------|------|-------------|-------------|
| `principalId` | `principal_id` | `integer` or `text` | `NOT NULL` (unless `isNullableId`) | ID of the associated entity |
| `principalType` | `principal_type` | `text` | `DEFAULT ''` (or `defaultPolymorphic`) | Type discriminator (e.g. `'User'`, `'Post'`) |

With a custom discriminator such as `'owner'`, columns become `ownerId` / `owner_id` and `ownerType` / `owner_type`.

```typescript
import { pgTable, text } from 'drizzle-orm/pg-core';
import { generateIdColumnDefs, generatePrincipalColumnDefs } from '@venizia/ignis';

export const commentTable = pgTable('Comment', {
  ...generateIdColumnDefs(),
  ...generatePrincipalColumnDefs({ polymorphicIdType: 'number' }),
  content: text('content').notNull(),
});
// principalId: integer('principal_id').notNull()
// principalType: text('principal_type').default('')
```

Convenience wrapper:

```typescript
enrichPrincipal<ColumnDefinitions extends TColumnDefinitions>(
  baseSchema: ColumnDefinitions,
  opts: TPrincipalEnricherOptions,
): ColumnDefinitions & TPrincipalColumnDef
```

### `generateDataTypeColumnDefs`

Adds polymorphic data storage columns for entities that store values of different types in a single table (key-value stores, settings tables).

`Source ->` [`packages/core-server/src/connectors/postgres/models/enrichers/data-type.enricher.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/connectors/postgres/models/enrichers/data-type.enricher.ts)

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

Options (`TDataTypeEnricherOptions`):

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

Emitted columns:

| Column | SQL type | DB column name | TypeScript type | Purpose |
|--------|----------|----------------|-----------------|---------|
| `dataType` | `text` | `data_type` | `string` | Type discriminator (`'number'`, `'text'`, `'json'`) |
| `nValue` | `double precision` | `n_value` | `number` | Numeric values |
| `tValue` | `text` | `t_value` | `string` | Text values |
| `bValue` | `bytea` | `b_value` | `Buffer` | Binary values |
| `jValue` | `jsonb` | `j_value` | `Record<string, any>` | JSON values |
| `boValue` | `boolean` | `bo_value` | `boolean` | Boolean values |

All columns are nullable by default (no `NOT NULL`), since typically only one value column is populated per row depending on the `dataType` discriminator. Pass `defaultValue` to attach SQL defaults to individual columns.

```typescript
import { pgTable, text } from 'drizzle-orm/pg-core';
import { BaseEntity, model, generateIdColumnDefs, generateDataTypeColumnDefs } from '@venizia/ignis';

@model({ type: 'entity' })
export class AppConfig extends BaseEntity<typeof AppConfig.schema> {
  static override schema = pgTable('AppConfig', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    ...generateDataTypeColumnDefs(),
    key: text('key').notNull().unique(),
  });
}
// { key: 'max_retries', dataType: 'number', nValue: 3 }
// { key: 'feature_flags', dataType: 'json', jValue: { darkMode: true } }
```

Convenience wrapper:

```typescript
enrichDataTypes(baseSchema: TColumnDefinitions, opts?: TDataTypeEnricherOptions): TColumnDefinitions
```

## Key types

`Source ->` [`packages/core-server/src/connectors/postgres/models/common`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/connectors/postgres/models/common)

### `TTableSchemaWithId`

Ensures a Drizzle `PgTable` has an `id` column:

```typescript
type TTableSchemaWithId<TC extends TableConfig = TableConfig> = PgTable<TC> & {
  id: TIdColumn;
};
```

### `TTableObject` / `TTableInsert`

Infer the select (output) and insert (input) types from a table schema:

```typescript
type TTableObject<T extends TTableSchemaWithId> = T['$inferSelect'];
type TTableInsert<T extends TTableSchemaWithId> = T['$inferInsert'];
```

### `TRelationConfig`

Configuration for entity relationships.

`Source ->` [`packages/core-server/src/connectors/postgres/repositories/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/connectors/postgres/repositories/common/types.ts)

```typescript
type TRelationConfig = {
  name: string;
} & (
  | { type: 'one'; schema: TTableSchemaWithId; metadata: /* Drizzle one() params */ }
  | { type: 'many'; schema: TTableSchemaWithId; metadata: /* Drizzle many() params */ }
);
```

Relation types are defined in the `RelationTypes` class: `RelationTypes.ONE` (`'one'`, one-to-one or many-to-one) and `RelationTypes.MANY` (`'many'`, one-to-many). See [Relations](/references/base/repositories/relations).

### `TValueOrResolver`

From `@venizia/ignis-helpers`, enables lazy resolution to avoid circular dependencies:

```typescript
type TValueOrResolver<T> = T | TResolver<T>;  // T or () => T
```

Used for `relations` on `BaseEntity` - store a function that returns the relations array, resolved lazily when `DataSource.buildSchema()` is called.

## Schema utilities

`Source ->` [`packages/core-server/src/base/models/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/base/models/common/types.ts)

### `idParamsSchema`

Generates a Zod schema for path parameters containing an `id` field, suitable for OpenAPI route definitions.

```typescript
idParamsSchema(opts?: { idType: TIdSchemaType }): z.ZodObject<{ id: z.ZodNumber | z.ZodString }>
```

| `idType` | Default | Zod type | Examples |
|----------|---------|----------|----------|
| `'number'` | Yes | `z.number()` | `[1, 2, 3]` |
| `'string'` | | `z.string()` | `['4651e634-...', 'some_unique_id']` |

Throws for invalid `idType` values.

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

Converts a Zod schema from snake_case to camelCase, transforming both the schema shape and runtime data. Useful when a database uses snake_case column names but you work in camelCase.

```typescript
snakeToCamel<T extends z.ZodRawShape>(shape: T): z.ZodEffects<...>
```

The resulting schema, in order:

1. Accepts snake_case input, validated against the original schema.
2. Transforms keys to camelCase at runtime.
3. Validates the transformed data against a camelCase schema.

```typescript
import { z } from 'zod';
import { snakeToCamel } from '@venizia/ignis';

const userCamelSchema = snakeToCamel({
  user_id: z.number(),
  first_name: z.string(),
  created_at: z.date(),
});

const result = userCamelSchema.parse({ user_id: 123, first_name: 'John', created_at: new Date() });
// { userId: 123, firstName: 'John', createdAt: Date }
```

Built on `keysToCamel()` / `toCamel()` from `@venizia/ignis-helpers`; recursively handles nested objects and preserves arrays.

### `getIdType`

There are two distinct `getIdType`s in the framework - do not confuse them.

| | Neutral instance method | PostgreSQL utility function |
|---|---|---|
| Location | `AbstractEntity.getIdType()` ([`base/models/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/base/models/base.ts)) | `getIdType()` ([`connectors/postgres/models/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/connectors/postgres/models/common/types.ts)) |
| Signature | `getIdType(): TIdSchemaType` | `getIdType<T extends TTableSchemaWithId>(opts: { entity: T }): string` |
| Purpose | Neutral capability every engine's entity implements - returns `'string'` \| `'number'` at the entity level. Used by `idParamsSchema` to build the right Zod schema for path parameters. | PostgreSQL-specific - inspects a Drizzle table schema's `id` column and returns its `dataType`, or `'unknown'` if not determinable |

```typescript
// Neutral - instance method (default 'string'; BaseEntity overrides based on the column)
const entity = new User();
entity.getIdType(); // 'string' | 'number'

// PostgreSQL connector - standalone utility inspecting a raw Drizzle schema
import { getIdType } from '@venizia/ignis/postgres';
getIdType({ entity: User.schema }); // 'string' | 'number' | 'unknown'
```

## See also

- [Models overview](/references/base/models) - introduction and common tasks
- [Tutorial](/guides/core-concepts/persistent/models) - creating models step by step
- [Repositories](/references/base/repositories/) - the data access layer
- [Relations](/references/base/repositories/relations) - model relationships
- [Filter System](/references/base/filter-system/) - querying models
- [Connectors](/references/base/connectors) - the base-vs-connector architecture
