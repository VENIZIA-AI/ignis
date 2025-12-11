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
| **Convenience** | Includes `toObject()` and `toJSON()` methods |

### Class Definition

```typescript
import { createSchemaFactory } from 'drizzle-zod';
import { BaseHelper } from '../helpers';
import { SchemaTypes, TSchemaType, TTableSchemaWithId } from './common';

export class BaseEntity<Schema extends TTableSchemaWithId = TTableSchemaWithId> extends BaseHelper {
  name: string;
  schema: Schema;
  schemaFactory: ReturnType<typeof createSchemaFactory>;

  constructor(opts: { name: string; schema: Schema }) {
    super({ scope: opts.name });
    this.name = opts.name;
    this.schema = opts.schema;
    this.schemaFactory = createSchemaFactory();
  }

  getSchema(opts: { type: TSchemaType }) {
    switch (opts.type) {
      case SchemaTypes.CREATE: {
        return this.schemaFactory.createInsertSchema(this.schema);
      }
      case SchemaTypes.UPDATE: {
        return this.schemaFactory.createUpdateSchema(this.schema);
      }
      case SchemaTypes.SELECT: {
        return this.schemaFactory.createSelectSchema(this.schema);
      }
      default: {
        throw getError({
          message: `[getSchema] Invalid schema type | type: ${opts.type} | valid: ${[SchemaTypes.SELECT, SchemaTypes.UPDATE, SchemaTypes.CREATE]}`,
        });
      }
    }
  }
}
```

When you define a model in your application, you extend `BaseEntity`, passing your Drizzle table schema to the `super` constructor.

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
  modified?: { enable: boolean; columnName: string; withTimezone: boolean };
  deleted?: { enable: boolean; columnName: string; withTimezone: boolean };
};
```

**Default values:**
- `created`: `{ columnName: 'created_at', withTimezone: true }`
- `modified`: `{ enable: true, columnName: 'modified_at', withTimezone: true }`
- `deleted`: `{ enable: true, columnName: 'deleted_at', withTimezone: true }`

#### Generated Columns

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `createdAt` | `timestamp` | `NOT NULL` | `now()` | When the record was created (always included) |
| `modifiedAt` | `timestamp` | `NOT NULL` | `now()` | When the record was last modified (optional, enabled by default) |
| `deletedAt` | `timestamp` | nullable | `null` | When the record was soft-deleted (optional, enabled by default) |

#### Usage Examples

**Basic usage (all columns with defaults):**

```typescript
import { pgTable, text } from 'drizzle-orm/pg-core';
import { generateTzColumnDefs } from '@venizia/ignis';

export const myTable = pgTable('MyTable', {
  ...generateTzColumnDefs(),
  name: text('name').notNull(),
});

// Generates: createdAt, modifiedAt, deletedAt (all with timezone)
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

**Disable soft delete (no deletedAt column):**

```typescript
export const myTable = pgTable('MyTable', {
  ...generateTzColumnDefs({
    deleted: { enable: false },
  }),
  name: text('name').notNull(),
});

// Generates: createdAt, modifiedAt (no deletedAt)
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
import { BaseController, controller, snakeToCamel } from '@venizia/ignis';
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
        
        return ctx.json({ success: true });
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
