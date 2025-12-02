# Deep Dive: Models and Enrichers

This document provides a technical overview of Ignis's base model architecture, focusing on the `BaseEntity` class and the various "enricher" functions used for schema definition with Drizzle ORM.

## `BaseEntity` Class

The `BaseEntity` class is a fundamental building block in the framework's data layer. It is an abstract class that serves as a wrapper around a Drizzle ORM schema.

-   **File:** `packages/core/src/base/models/base.ts`

### Purpose

-   **Schema Encapsulation**: It holds a reference to a Drizzle `pgTable` schema, providing a consistent object structure that repositories can work with.
-   **Metadata**: When used with the `@model` decorator, it provides metadata to the framework, indicating that the class represents a database entity.
-   **Convenience**: It includes basic methods like `toObject()` and `toJSON()`.

### Class Definition

```typescript
export class BaseEntity<Schema extends TTableSchemaWithId = any> extends BaseHelper {
  name: string;
  schema: Schema;

  constructor(opts: { name: string; schema: Schema }) {
    super({ scope: opts.name });
    this.name = opts.name;
    this.schema = opts.schema;
  }
  // ...
}
```

When you define a model in your application, you extend `BaseEntity`, passing your Drizzle table schema to the `super` constructor.

## Schema Enrichers

Enrichers are helper functions that return an object of Drizzle ORM column definitions. They are designed to be spread into a `pgTable` definition to quickly add common, standardized fields to your models.

-   **Location:** `packages/core/src/base/models/enrichers/`

### `generateIdColumnDefs`

-   **File:** `id.enricher.ts`
-   **Purpose**: Adds a primary key `id` column.
-   **Options**:
    -   `dataType`: Can be `'string'` (defaults to a `uuid` with `uuid_generate_v4()` default) or `'number'` (defaults to `serial`).

```typescript
// Example: String (UUID) ID
...generateIdColumnDefs({ id: { dataType: 'string' } })

// Example: Numeric (Serial) ID
...generateIdColumnDefs({ id: { dataType: 'number' } })
```

### `generateTzColumnDefs`

-   **File:** `tz.enricher.ts`
-   **Purpose**: Adds `createdAt` and `modifiedAt` timestamp columns with timezone support.
-   **Details**:
    -   `createdAt`: Defaults to `now()` and is not nullable.
    -   `modifiedAt`: Defaults to `now()` and automatically updates when the record is updated using Drizzle's `$onUpdate()` feature.

### `generateUserAuditColumnDefs`

-   **File:** `user-audit.enricher.ts`
-   **Purpose**: Adds `createdBy` and `modifiedBy` columns to track which user created or modified a record.
-   **Options**:
    -   `dataType`: Can be `'string'` or `'number'` to match the data type of your user ID.
    -   `columnName`: Allows you to override the default column names (`created_by`, `modified_by`).

```typescript
// Example: User IDs are strings (UUIDs)
...generateUserAuditColumnDefs({
  created: { dataType: 'string', columnName: 'created_by' },
  modified: { dataType: 'string', columnName: 'modified_by' },
})
```

### `generateDataTypeColumnDefs`

-   **File:** `data-type.enricher.ts`
-   **Purpose**: Adds a set of columns (`dataType`, `nValue`, `tValue`, `bValue`, `jValue`, `boValue`) designed to store flexible, dynamic data of different types (number, text, byte array, JSON, boolean).

### `extraUserColumns`

-   **File:** `packages/core/src/components/auth/models/entities/user.model.ts`
-   **Purpose**: Adds common fields for a user model, such as `realm`, `status`, `type`, `activatedAt`, `lastLoginAt`, and `parentId`.
