# Changelog - 2025-12-18

## Repository Validation & Security Improvements

This update adds strict validation to the `@repository` decorator and fixes several security vulnerabilities in the filter operators.

## Overview

- **@repository Decorator**: Now requires both `model` AND `dataSource` for schema auto-discovery
- **Constructor Validation**: First parameter must extend `AbstractDataSource` (enforced via reflection)
- **DataSource Auto-Discovery**: Schema is automatically built from `@repository` bindings - no manual merging needed!
- **Filter Security**: Fixed empty IN array bypass, invalid column handling, BETWEEN validation
- **PostgreSQL Compatibility**: REGEXP now uses PostgreSQL POSIX operators
- **UUID Generation**: Now uses native PostgreSQL `uuid` type with `gen_random_uuid()`

## Breaking Changes

### 1. Repository Constructor Signature Changed

**This is a major breaking change.** The constructor signature for all repository classes has changed.

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

**Key changes:**
- DataSource is now the first parameter (auto-injected from `@repository` decorator)
- `relations` parameter removed - now auto-resolved from entity's static `relations` property
- Both parameters are optional when using `@repository` decorator with `model` and `dataSource`

**Migration:**
```typescript
// Before
@repository({})
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {
  constructor(
    @inject({ key: 'datasources.PostgresDataSource' }) ds: PostgresDataSource,
  ) {
    super({
      entityClass: User,
      relations: userRelations.definitions,
      dataSource: ds,
    });
  }
}

// After - Zero boilerplate
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {
  // No constructor needed!
}

// After - With explicit constructor
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {
  constructor(
    @inject({ key: 'datasources.PostgresDataSource' }) ds: PostgresDataSource,
  ) {
    super(ds); // Just pass dataSource, entity and relations auto-resolved
  }
}
```

### 2. @repository Decorator Requires Both `model` AND `dataSource`

**Before (would silently fail to register model):**
```typescript
// ❌ This would not register User for schema auto-discovery
@repository({ model: User })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {}
```

**After (throws error):**
```typescript
// Error: [@repository][UserRepository] Invalid metadata | Missing 'dataSource'
@repository({ model: User })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {}

// ✅ Correct usage
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {}
```

### 2. Constructor First Parameter Must Be DataSource Type

When using explicit `@inject` in constructor, the first parameter **must** extend `AbstractDataSource`:

**Before (would work with wrong type):**
```typescript
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends ReadableRepository<typeof User.schema> {
  constructor(
    @inject({ key: 'datasources.PostgresDataSource' })
    dataSource: any, // ❌ This would compile but is wrong
  ) {
    super(dataSource);
  }
}
```

**After (enforced at decorator time):**
```typescript
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends ReadableRepository<typeof User.schema> {
  constructor(
    @inject({ key: 'datasources.PostgresDataSource' })
    dataSource: PostgresDataSource, // ✅ Must be concrete DataSource type
  ) {
    super(dataSource);
  }
}
```

### 3. Filter Column Validation

Invalid column names now throw errors instead of being silently ignored:

**Before:**
```typescript
// Would silently ignore 'invalidColumn'
await repo.find({ filter: { where: { invalidColumn: 'value' } } });
```

**After:**
```typescript
// Error: [toWhere] Table: User | Column NOT FOUND | key: 'invalidColumn'
await repo.find({ filter: { where: { invalidColumn: 'value' } } });
```

## Security Fixes

### Empty IN Array Bypass (CVE-like)

**Vulnerability:** Empty `IN` arrays would return `true`, bypassing security filters.

**Fix:** Empty `IN` arrays now return `sql\`false\``, correctly matching no records.

```typescript
// Before: WHERE id IN () => true (security bypass!)
// After: WHERE false => no records (correct)
await repo.find({ filter: { where: { id: { IN: [] } } } });
```

### BETWEEN Validation

**Vulnerability:** Invalid `BETWEEN` values could cause unexpected behavior.

**Fix:** BETWEEN now validates input is array of exactly 2 elements.

```typescript
// Throws: [BETWEEN] Invalid value: expected array of 2 elements
await repo.find({ filter: { where: { age: { BETWEEN: [10] } } } });
```

### PostgreSQL REGEXP Compatibility

**Issue:** MySQL-style REGEXP operator doesn't work in PostgreSQL.

**Fix:** Now uses PostgreSQL POSIX regex operators:
- `REGEXP` → `~` (case-sensitive)
- `IREGEXP` → `~*` (case-insensitive, new!)

```typescript
// PostgreSQL-compatible regex
await repo.find({ filter: { where: { name: { REGEXP: '^John' } } } });
await repo.find({ filter: { where: { name: { IREGEXP: '^john' } } } }); // Case-insensitive
```

## New Features

### DataSource Schema Auto-Discovery

DataSources can now automatically discover their schema from registered `@repository` decorators:

```typescript
// Before: Manual schema merging required
@datasource({ driver: 'node-postgres' })
export class PostgresDataSource extends BaseDataSource<...> {
  constructor() {
    super({
      name: PostgresDataSource.name,
      config: { /* ... */ },
      schema: Object.assign({}, // Manual merge!
        { [User.TABLE_NAME]: userTable },
        userRelations.relations,
      ),
    });
  }
}

// After: Auto-discovery - no schema needed!
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

When repositories are defined with `@repository({ model: User, dataSource: PostgresDataSource })`, the framework automatically builds the schema.

### Schema Key Mismatch Validation

Added helpful error when entity name doesn't match schema keys:

```typescript
// Error: [UserRepository] Schema key mismatch | Entity name 'User' not found in connector.query | Available keys: [Configuration, Post]
```

### UUID Type Improvement

Changed from `text` type with JS-generated UUID to native PostgreSQL `uuid`:

```typescript
// Before: text('id').primaryKey().$defaultFn(() => crypto.randomUUID())
// After: uuid('id').defaultRandom().primaryKey()
```

Benefits:
- Native PostgreSQL UUID type (16 bytes vs 36 bytes)
- Uses `gen_random_uuid()` - no extension required
- Better indexing performance

### Case-Insensitive REGEXP (IREGEXP)

Added new `IREGEXP` operator for case-insensitive regex matching:

```typescript
// Case-sensitive (existing)
await repo.find({ filter: { where: { name: { REGEXP: '^John' } } } });

// Case-insensitive (new!)
await repo.find({ filter: { where: { name: { IREGEXP: '^john' } } } });
```

### BaseEntity Static Schema & Relations

Models can now define schema and relations as static properties, enabling cleaner syntax:

```typescript
// Before - Constructor-based schema
@model({ type: 'entity' })
export class User extends BaseEntity<typeof userTable> {
  constructor() {
    super({ name: 'User', schema: userTable });
  }
}

// After - Static schema (recommended)
@model({ type: 'entity' })
export class User extends BaseEntity<typeof User.schema> {
  static override schema = userTable;
  static override relations = () => userRelations.definitions;
  static override TABLE_NAME = 'User';
}
```

Relations are now auto-resolved from the entity's static `relations` property - no need to pass them in repository constructor.

### Repository Log Option

All CRUD operations now support a `log` option for debugging:

```typescript
// Enable logging for a specific operation
await repo.create({
  data: { name: 'John' },
  options: {
    log: { use: true, level: 'debug' }
  }
});

// Log output: [_create] Executing with opts: { data: [...], options: {...} }
```

**Available on:** `create`, `createAll`, `updateById`, `updateAll`, `deleteById`, `deleteAll`

### Improved TypeScript Return Types

Repository methods now have better type inference based on `shouldReturn`:

```typescript
// When shouldReturn: false - returns null
const result1 = await repo.create({
  data: { name: 'John' },
  options: { shouldReturn: false }
});
// Type: Promise<TCount & { data: null }>

// When shouldReturn: true (default) - returns the entity
const result2 = await repo.create({
  data: { name: 'John' },
  options: { shouldReturn: true }
});
// Type: Promise<TCount & { data: User }>

// TypeScript now correctly infers the return type!
```

### IEntity Interface

New interface for model classes with static schema and relations:

```typescript
interface IEntity<Schema extends TTableSchemaWithId = TTableSchemaWithId> {
  TABLE_NAME?: string;
  schema: Schema;
  relations?: TValueOrResolver<Array<TRelationConfig>>;
}
```

## Files Changed

### Core Package - Models
- `packages/core/src/base/models/base.ts` - Static schema/relations support, IEntity interface
- `packages/core/src/base/models/common/types.ts` - IEntity interface definition
- `packages/core/src/base/models/enrichers/id.enricher.ts` - Native PostgreSQL UUID type
- `packages/core/src/base/models/enrichers/tz.enricher.ts` - Type naming fix

### Core Package - Repositories
- `packages/core/src/base/repositories/core/base.ts` - Constructor signature change, relations auto-resolution
- `packages/core/src/base/repositories/core/readable.ts` - Constructor change, getQueryInterface validation
- `packages/core/src/base/repositories/core/persistable.ts` - Constructor change, log option, TypeScript overloads
- `packages/core/src/base/repositories/core/default-crud.ts` - Documentation update
- `packages/core/src/base/repositories/common/types.ts` - TRepositoryLogOptions, TypeScript overloads
- `packages/core/src/base/repositories/operators/filter.ts` - Column validation, error throwing
- `packages/core/src/base/repositories/operators/query.ts` - REGEXP/IREGEXP fix, BETWEEN validation, IN empty array fix

### Core Package - DataSources & Metadata
- `packages/core/src/base/datasources/base.ts` - Schema auto-discovery feature
- `packages/core/src/base/metadata/persistents.ts` - Repository decorator validation, constructor type validation

### Examples
- `examples/vert/src/repositories/user.repository.ts` - Updated to proper types
- `examples/vert/src/repositories/configuration.repository.ts` - Updated patterns
- `examples/vert/src/datasources/postgres.datasource.ts` - Using auto-discovery
- `examples/vert/src/models/entities/user.model.ts` - Static schema pattern
- `examples/vert/src/models/entities/configuration.model.ts` - Static schema pattern

## Migration Guide

### Step 1: Update Repository Constructors (BREAKING)

The repository constructor signature has changed:

```typescript
// Before
@repository({})
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {
  constructor(
    @inject({ key: 'datasources.PostgresDataSource' }) ds: PostgresDataSource,
  ) {
    super({
      entityClass: User,
      relations: userRelations.definitions,
      dataSource: ds,
    });
  }
}

// After - Option A: Zero boilerplate (recommended)
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {
  // No constructor needed!
}

// After - Option B: With explicit constructor
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {
  constructor(
    @inject({ key: 'datasources.PostgresDataSource' }) ds: PostgresDataSource,
  ) {
    super(ds); // Just pass dataSource
  }
}
```

### Step 2: Update Model Definitions (Optional but Recommended)

Add static properties to your models for relations auto-resolution:

```typescript
// Before
@model({ type: 'entity' })
export class User extends BaseEntity<typeof userTable> {
  constructor() {
    super({ name: 'User', schema: userTable });
  }
}

// After - Static properties
@model({ type: 'entity' })
export class User extends BaseEntity<typeof User.schema> {
  static override schema = userTable;
  static override relations = () => userRelations.definitions;
  static override TABLE_NAME = 'User';
}
```

### Step 3: Update @repository Decorators

Ensure all `@repository` decorators have both `model` and `dataSource`:

```typescript
// Find and update all occurrences
@repository({ model: YourModel, dataSource: YourDataSource })
```

### Step 4: Fix Constructor Types

If using explicit `@inject`, ensure first parameter has correct type:

```typescript
constructor(
  @inject({ key: 'datasources.YourDataSource' })
  dataSource: YourDataSource, // Not 'any' or 'object'
) {}
```

### Step 5: Review Filter Queries

Check for any queries using:
- Empty `IN` arrays (now return no results instead of all)
- Invalid column names (now throw errors)
- `BETWEEN` with non-array or wrong-length values

### Step 6: REGEXP Migration (PostgreSQL Users)

Replace MySQL-style REGEXP with PostgreSQL syntax:
- REGEXP already works (uses `~` operator)
- For case-insensitive, use new `IREGEXP` (uses `~*` operator)
