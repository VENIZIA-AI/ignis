# Deep Dive: Models and Enrichers

Technical reference for model architecture and schema enrichers in Ignis.

**Files:**
- `packages/core/src/base/models/base.ts`
- `packages/core/src/base/models/enrichers/*.ts`

## Quick Reference

| Component | Purpose | Key Features |
|-----------|---------|--------------|
| **BaseEntity** | Wraps Drizzle schema | Schema encapsulation, Zod generation, `toObject()`/`toJSON()` |
| **Schema Enrichers** | Add common columns to tables | `generateIdColumnDefs()`, `generateTzColumnDefs()`, etc. |

## `BaseEntity` Class

Fundamental building block wrapping a Drizzle ORM schema.

**File:** `packages/core/src/base/models/base.ts`

### Purpose

| Feature | Description |
|---------|-------------|
| **Schema Encapsulation** | Holds Drizzle `pgTable` schema for consistent repository access |
| **Metadata** | Works with `@model` decorator to mark database entities |
| **Schema Generation** | Uses `drizzle-zod` to generate Zod schemas (`SELECT`, `CREATE`, `UPDATE`) |
| **Static Properties** | Supports static `schema`, `relations`, and `TABLE_NAME` for cleaner syntax |
| **Convenience** | Includes `toObject()` and `toJSON()` methods |

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
| `relations` | `TValueOrResolver<Array<TRelationConfig>>` | Relation definitions (can be a function for lazy loading) |
| `TABLE_NAME` | `string \| undefined` | Optional table name (defaults to class name if not set) |

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
| `getSchema({ type })` | Get Zod schema for validation (`SELECT`, `CREATE`, `UPDATE`) |
| `toObject()` | Convert to plain object |
| `toJSON()` | Convert to JSON string |

### Class Definition

```typescript
export class BaseEntity<Schema extends TTableSchemaWithId = TTableSchemaWithId>
  extends BaseHelper
  implements IEntity<Schema>
{
  // Instance properties
  name: string;
  schema: Schema;

  // Static properties - override in subclass
  static schema: TTableSchemaWithId;
  static relations?: TValueOrResolver<Array<TRelationConfig>>;
  static TABLE_NAME?: string;  // Optional, defaults to class name

  // Static singleton for schemaFactory - shared across all instances
  // Performance optimization: avoids creating new factory per entity
  private static _schemaFactory?: ReturnType<typeof createSchemaFactory>;
  protected static get schemaFactory(): ReturnType<typeof createSchemaFactory> {
    return (BaseEntity._schemaFactory ??= createSchemaFactory());
  }

  // Constructor supports both patterns
  constructor(opts?: { name?: string; schema?: Schema }) {
    const ctor = new.target as typeof BaseEntity;
    // Use explicit TABLE_NAME if defined, otherwise fall back to class name
    const name = opts?.name ?? ctor.TABLE_NAME ?? ctor.name;

    super({ scope: name });

    this.name = name;
    this.schema = opts?.schema || (ctor.schema as Schema);
  }

  getSchema(opts: { type: TSchemaType }) {
    const factory = BaseEntity.schemaFactory;  // Uses static singleton
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

  toObject() {
    return { ...this };
  }

  toJSON() {
    return this.toObject();
  }
}
```

**Performance Note:** The `schemaFactory` is implemented as a static lazy singleton, meaning it's created once and shared across all `BaseEntity` instances. This avoids the overhead of creating a new `drizzle-zod` schema factory for every entity instantiation.

## Schema Enrichers

Enrichers are helper functions located in `packages/core/src/base/models/enrichers/` that return an object of Drizzle ORM column definitions. They are designed to be spread into a `pgTable` definition to quickly add common, standardized fields to your models.

### Available Enrichers

| Enricher Function | Purpose |
| :--- | :--- |
| **`generateIdColumnDefs`** | Adds a primary key `id` column (string UUID or numeric serial). |
| **`generateTzColumnDefs`** | Adds `createdAt`, `modifiedAt`, and `deletedAt` timestamp columns with timezone support. |
| **`generateUserAuditColumnDefs`** | Adds `createdBy` and `modifiedBy` columns to track user audit information. |
| **`generateDataTypeColumnDefs`** | Adds generic data type columns (`dataType`, `nValue`, `tValue`, `bValue`, `jValue`, `boValue`) for flexible data storage. |
| **`generatePrincipalColumnDefs`** | Adds polymorphic fields for associating with different principal types. |
| **`extraUserColumns`** (from `components/auth/models/entities/user.model.ts`) | Adds common fields for a user model, such as `realm`, `status`, `type`, `activatedAt`, `lastLoginAt`, and `parentId`. |

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
  ...generateUserAuditColumnDefs({ created: { dataType: 'string' }, modified: { dataType: 'string' } }),
  name: text('name').notNull(),
});
```

---

## Detailed Enricher Reference

### `generateIdColumnDefs`

Adds a primary key `id` column with support for string UUID, integer, or big integer types with full TypeScript type inference.

**File:** `packages/core/src/base/models/enrichers/id.enricher.ts`

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
    | { dataType: 'string' }
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
| `'string'` | `uuid` | Primary Key, Default: `gen_random_uuid()` | Native PostgreSQL UUID (no extension required) |
| `'number'` | `integer` | Primary Key, `GENERATED ALWAYS AS IDENTITY` | Auto-incrementing integer |
| `'big-number'` | `bigint` | Primary Key, `GENERATED ALWAYS AS IDENTITY` | Auto-incrementing big integer (mode: 'number' or 'bigint') |

#### Type Inference

The function provides **full TypeScript type inference** based on the configuration options:

```typescript
type TIdColumnDef<Opts extends TIdEnricherOptions | undefined> =
  Opts extends { id: infer IdOpts }
    ? IdOpts extends { dataType: 'string' }
      ? { id: IsPrimaryKey<NotNull<HasDefault<PgUUIDBuilderInitial<'id'>>>> }
      : IdOpts extends { dataType: 'number' }
        ? { id: IsIdentity<IsPrimaryKey<NotNull<PgIntegerBuilderInitial<'id'>>>, 'always'> }
        : IdOpts extends { dataType: 'big-number' }
          ? IdOpts extends { numberMode: 'number' }
            ? { id: IsIdentity<IsPrimaryKey<NotNull<PgBigInt53BuilderInitial<'id'>>>, 'always'> }
            : { id: IsIdentity<IsPrimaryKey<NotNull<PgBigInt64BuilderInitial<'id'>>>, 'always'> }
          : { id: IsIdentity<IsPrimaryKey<NotNull<PgIntegerBuilderInitial<'id'>>>, 'always'> }
    : { id: IsIdentity<IsPrimaryKey<NotNull<PgIntegerBuilderInitial<'id'>>>, 'always'> };
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

**UUID-based string ID:**

```typescript
export const myTable = pgTable('MyTable', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  name: text('name').notNull(),
});

// Generates: id uuid PRIMARY KEY DEFAULT gen_random_uuid()
// No extension required - built into PostgreSQL 13+
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

- **UUID Type:** When using `dataType: 'string'`, the native PostgreSQL `uuid` type is used with `gen_random_uuid()` - no extension required (built into PostgreSQL 13+). This is more efficient than `text` type (16 bytes vs 36 bytes) and provides better indexing performance.
- **Type Safety:** The return type is fully inferred based on your options, providing better autocomplete and type checking
- **Big Number Mode:** For `dataType: 'big-number'`, the `numberMode` field is required to specify whether to use JavaScript `number` (up to 2^53-1) or `bigint` (for larger values)
- **Sequence Options:** Available for `number` and `big-number` types to customize identity generation behavior

---

### `generateTzColumnDefs`

Adds timestamp columns for tracking entity creation, modification, and soft deletion.

**File:** `packages/core/src/base/models/enrichers/tz.enricher.ts`

#### Signature

```typescript
generateTzColumnDefs(opts?: TTzEnricherOptions): TTzEnricherResult
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
| `modifiedAt` | `timestamp` | `NOT NULL` | `now()` | When the record was last modified (optional, enabled by default) |
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

The enricher provides proper TypeScript type inference:

```typescript
type TTzEnricherResult<ColumnDefinitions extends TColumnDefinitions = TColumnDefinitions> = {
  createdAt: PgTimestampBuilderInitial<string> & NotNull & HasDefault;
  modifiedAt?: PgTimestampBuilderInitial<string> & NotNull & HasDefault;
  deletedAt?: PgTimestampBuilderInitial<string>;
};
```

---

### `generateUserAuditColumnDefs`

Adds `createdBy` and `modifiedBy` columns to track which user created or modified a record.

**File:** `packages/core/src/base/models/enrichers/user-audit.enricher.ts`

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
};

type TUserAuditEnricherOptions = {
  created?: TUserAuditColumnOpts;
  modified?: TUserAuditColumnOpts;
};
```

**Default values:**
- `created`: `{ dataType: 'number', columnName: 'created_by' }`
- `modified`: `{ dataType: 'number', columnName: 'modified_by' }`

#### Generated Columns

| Column | Data Type | Column Name | Description |
|--------|-----------|-------------|-------------|
| `createdBy` | `integer` or `text` | `created_by` | User ID who created the record |
| `modifiedBy` | `integer` or `text` | `modified_by` | User ID who last modified the record |

#### Validation

The enricher validates the `dataType` option and throws an error for invalid values:

```typescript
// ✅ Valid
generateUserAuditColumnDefs({ created: { dataType: 'number', columnName: 'created_by' } });
generateUserAuditColumnDefs({ created: { dataType: 'string', columnName: 'created_by' } });

// ❌ Invalid - throws error
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

---

## Schema Utilities

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
import { BaseController, controller, snakeToCamel, HTTP } from '@venizia/ignis';
import { z } from '@hono/zod-openapi';

const createUserSchema = snakeToCamel({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email_address: z.string().email(),
  phone_number: z.string().optional(),
});

@controller({ path: '/users' })
export class UserController extends BaseController {
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
        console.log(data.firstName);  // ✅ TypeScript knows this exists
        console.log(data.first_name);  // ❌ TypeScript error
        
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
  user_id: 'not-a-number',  // ❌ Fails first validation
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
