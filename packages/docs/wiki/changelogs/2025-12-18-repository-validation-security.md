---
title: Repository Validation & Security
description: Strict validation for @repository decorator and security fixes for filter operators
---

# Changelog - 2025-12-18

## Repository Validation & Security Improvements

This update adds strict validation to the `@repository` decorator and fixes several security vulnerabilities in the filter operators.

## Overview

- **@repository Decorator**: Now requires both `model` AND `dataSource` for schema auto-discovery.
- **Constructor Validation**: First parameter must extend `AbstractDataSource` (enforced via reflection).
- **DataSource Auto-Discovery**: Schema is automatically built from `@repository` bindings.
- **Filter Security**: Fixed empty IN array bypass, invalid column handling, BETWEEN validation.
- **PostgreSQL Compatibility**: REGEXP now uses PostgreSQL POSIX operators.
- **String ID Generation**: Uses `text` column with customizable ID generator (default: `crypto.randomUUID()`).

## Breaking Changes

> [!WARNING]
> This section contains changes that require migration or manual updates to existing code.

### 1. Repository Constructor Signature

**Before:**
```typescript
constructor(opts: {
  entityClass: TClass<BaseEntity<EntitySchema>>;
  relations: { [relationName: string]: TRelationConfig };
  dataSource: IDataSource;
})
```

**After:**
```typescript
constructor(ds?: IDataSource, opts?: { entityClass?: TClass<BaseEntity<EntitySchema>> })
```

### 2. @repository Decorator Requirements

**Before:**
```typescript
// Would silently fail to register model
@repository({ model: User })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {}
```

**After:**
```typescript
// Throws Error: Invalid metadata | Missing 'dataSource'
@repository({ model: User })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {}

// Correct
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {}
```

### 3. Constructor Parameter Type

**Before:**
```typescript
constructor(
  @inject({ key: 'datasources.PostgresDataSource' })
  dataSource: any, // Would compile but is wrong
)
```

**After:**
```typescript
constructor(
  @inject({ key: 'datasources.PostgresDataSource' })
  dataSource: PostgresDataSource, // Must be concrete DataSource type
)
```

### 4. Filter Column Validation

**Before:**
```typescript
// Silently ignored 'invalidColumn'
await repo.find({ filter: { where: { invalidColumn: 'value' } } });
```

**After:**
```typescript
// Error: [toWhere] Table: User | Column NOT FOUND | key: 'invalidColumn'
await repo.find({ filter: { where: { invalidColumn: 'value' } } });
```

## New Features

### DataSource Schema Auto-Discovery

**File:** `packages/core/src/base/datasources/base.ts`

**Problem:** Manual schema merging was error-prone and verbose.

**Solution:** DataSources automatically discover their schema from `@repository` bindings.

```typescript
@datasource({ driver: 'node-postgres' })
export class PostgresDataSource extends BaseDataSource<...> {
  constructor() {
    super({
      name: PostgresDataSource.name,
      config: { /* ... */ },
      // Schema auto-discovered from @repository decorators!
    });
  }
}
```

### String ID with Custom Generator

**File:** `packages/core/src/base/models/enrichers/id.enricher.ts`

**Problem:** Need flexible ID generation with maximum database compatibility.

**Solution:** Uses `text` column with customizable ID generator (default: `crypto.randomUUID()`).

```typescript
// Default: text('id').primaryKey().$defaultFn(() => crypto.randomUUID())
// Custom: text('id').primaryKey().$defaultFn(() => nanoid())
```

**Benefits:**
- Maximum database compatibility with `text` column type
- Customizable ID generation (UUID, nanoid, cuid, etc.)
- Application-level ID generation via `$defaultFn()`

### Case-Insensitive REGEXP (IREGEXP)

**File:** `packages/core/src/base/repositories/operators/query.ts`

**Problem:** PostgreSQL regex matching is case-sensitive by default.

**Solution:** Added `IREGEXP` operator for case-insensitive matching (`~*`).

```typescript
await repo.find({ filter: { where: { name: { IREGEXP: '^john' } } } });
```

### Repository Log Option

**File:** `packages/core/src/base/repositories/core/persistable.ts`

**Problem:** Debugging repository operations was difficult without logging.

**Solution:** Added `log` option to all CRUD operations.

```typescript
await repo.create({
  data: { name: 'John' },
  options: {
    log: { use: true, level: 'debug' }
  }
});
```

## Security Fixes

### Empty IN Array Bypass

**Vulnerability:** Empty `IN` arrays would return `true`, bypassing security filters.

**Fix:** Empty `IN` arrays now return `sql\`false\``. 

```typescript
// Before: WHERE id IN () => true (bypass)
// After: WHERE false => no records
await repo.find({ filter: { where: { id: { IN: [] } } } });
```

### BETWEEN Validation

**Vulnerability:** Invalid `BETWEEN` values could cause unexpected behavior.

**Fix:** `BETWEEN` now validates input is an array of exactly 2 elements.

```typescript
// Throws: [BETWEEN] Invalid value: expected array of 2 elements
await repo.find({ filter: { where: { age: { BETWEEN: [10] } } } });
```

## Files Changed

### Core Package (`packages/core`)

| File | Changes |
|------|---------|
| `src/base/models/base.ts` | Static schema/relations support, IEntity interface |
| `src/base/models/common/types.ts` | IEntity interface definition |
| `src/base/models/enrichers/id.enricher.ts` | Text column with customizable ID generator |
| `src/base/repositories/core/base.ts` | Constructor signature change, relations auto-resolution |
| `src/base/repositories/core/readable.ts` | Constructor change, getQueryInterface validation |
| `src/base/repositories/core/persistable.ts` | Constructor change, log option, TypeScript overloads |
| `src/base/repositories/operators/filter.ts` | Column validation, error throwing |
| `src/base/repositories/operators/query.ts` | REGEXP/IREGEXP fix, BETWEEN validation, IN empty array fix |
| `src/base/datasources/base.ts` | Schema auto-discovery feature |
| `src/base/metadata/persistents.ts` | Repository decorator validation, constructor type validation |

### Examples (`examples/vert`)

| File | Changes |
|------|---------|
| `src/repositories/user.repository.ts` | Updated to proper types |
| `src/repositories/configuration.repository.ts` | Updated patterns |
| `src/datasources/postgres.datasource.ts` | Using auto-discovery |

## Migration Guide

> [!NOTE]
> Follow these steps if you're upgrading from a previous version.

### Step 1: Update Repository Constructors

The repository constructor signature has changed. Update all repository classes.

```typescript
// Option A: Zero boilerplate (recommended)
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {
  // No constructor needed!
}

// Option B: With explicit constructor
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {
  constructor(
    @inject({ key: 'datasources.PostgresDataSource' }) ds: PostgresDataSource,
  ) {
    super(ds); // Just pass dataSource
  }
}
```

### Step 2: Update @repository Decorators

Ensure all `@repository` decorators have both `model` and `dataSource`.

```typescript
@repository({ model: YourModel, dataSource: YourDataSource })
```

### Step 3: REGEXP Migration (PostgreSQL Users)

Replace MySQL-style REGEXP with PostgreSQL syntax:
- `REGEXP` → uses `~` (case-sensitive)
- `IREGEXP` → uses `~*` (case-insensitive)

```
