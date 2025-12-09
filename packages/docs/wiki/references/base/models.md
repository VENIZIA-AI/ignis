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
| **`generateTzColumnDefs`** | Adds `createdAt` and `modifiedAt` timestamp columns with timezone support. |
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
} from '@vez/ignis';

export const myTable = pgTable('MyTable', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  ...generateTzColumnDefs(),
  ...generateUserAuditColumnDefs({ created: { dataType: 'string' }, modified: { dataType: 'string' } }),
  name: text('name').notNull(),
});
```