---
title: Repository Enhancements
description: Hidden properties, filter improvements, and code quality updates
---

# Changelog - 2025-12-30

## Repository Enhancements

This release introduces hidden properties configuration for models, array-based field selection, JSON path ordering, and several code quality improvements.

## Overview

- **Hidden Properties**: Configure properties that are never returned through repository queries (SQL-level exclusion)
- **Array Fields Format**: Simpler syntax for field selection using arrays
- **JSON Path Ordering**: Order by nested fields within JSON/JSONB columns
- **Code Quality**: Refactored validation logic, improved caching patterns, consistent resolver pattern

---

## Hidden Properties

### Configuration

Configure hidden properties in the `@model` decorator. These properties are excluded at the SQL level, never leaving the database in repository operations.

```typescript
import { pgTable, text } from 'drizzle-orm/pg-core';
import { BaseEntity, model, generateIdColumnDefs } from '@venizia/ignis';

@model({
  type: 'entity',
  settings: {
    hiddenProperties: ['password', 'secret'],
  },
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

### Behavior

| Operation | Behavior |
|-----------|----------|
| `find()`, `findOne()`, `findById()` | Hidden excluded from SELECT |
| `create()`, `createAll()` | Hidden excluded from RETURNING |
| `updateById()`, `updateAll()` | Hidden excluded from RETURNING |
| `deleteById()`, `deleteAll()` | Hidden excluded from RETURNING |
| `count()`, `existsWith()` | Can filter by hidden fields |
| Where clause filtering | Hidden fields usable in filters |
| Direct connector query | Hidden fields **included** (bypasses repository) |

### Accessing Hidden Data

When you need to access hidden properties, use the connector directly:

```typescript
// Repository - excludes hidden
const user = await userRepo.findById({ id: '123' });
// { id: '123', email: 'john@example.com' }

// Connector - includes all fields
const connector = userRepo.getConnector();
const [fullUser] = await connector
  .select()
  .from(User.schema)
  .where(eq(User.schema.id, '123'));
// { id: '123', email: 'john@example.com', password: '...', secret: '...' }
```

### Relations Support

Hidden properties are recursively excluded from included relations:

```typescript
const post = await postRepo.findOne({
  filter: {
    include: [{ relation: 'author' }]
  }
});
// post.author excludes password and secret if User model has them configured
```

---

## Array Fields Format

**Before:** Only object format was supported:
```typescript
fields: { id: true, email: true, name: true }
```

**After:** Array format is now supported (recommended):
```typescript
fields: ['id', 'email', 'name']
```

Both formats produce the same result. The array format is more concise and easier to read.

**Type Definition:**
```typescript
type TFields<T> = Partial<{ [K in keyof T]: boolean }> | Array<keyof T>;
```

---

## JSON Path Ordering

Order by nested fields within JSON/JSONB columns using dot notation and array indices.

```typescript
// Simple nested field
order: ['metadata.priority DESC']
// SQL: ORDER BY "metadata" #> '{priority}' DESC

// Deeply nested field
order: ['settings.display.theme ASC']
// SQL: ORDER BY "settings" #> '{display,theme}' ASC

// Array element
order: ['tags[0] ASC']
// SQL: ORDER BY "tags" #> '{0}' ASC

// Complex path with array
order: ['data.items[2].name DESC']
// SQL: ORDER BY "data" #> '{items,2,name}' DESC
```

**JSONB Sort Order:**

| Type | Sort Order |
|------|------------|
| `null` | First (lowest) |
| `boolean` | `false` < `true` |
| `number` | Numeric order |
| `string` | Lexicographic |
| `array` | Element-wise |
| `object` | Key-value |

**Security:** Built-in SQL injection prevention via regex validation for path components.

---

## Code Quality Improvements

### 1. Consistent Resolver Pattern

Added `THiddenPropertiesResolver` type and renamed method to match `getRelationResolver()` pattern:

```typescript
// Consistent pattern
relationResolver: this.getRelationResolver(),
hiddenPropertiesResolver: this.getHiddenPropertiesResolver(),
```

### 2. Early Return Pattern

Refactored `resolveConnector()` from nested conditionals to early return:

```typescript
// Before
if (transaction) {
  if (!transaction.isActive) { throw... }
  return transaction.connector;
}
return this.dataSource.connector;

// After
if (!transaction) {
  return this.dataSource.connector;
}
if (!transaction.isActive) { throw... }
return transaction.connector;
```

### 3. Extracted Validation Helper

Created shared `validateWhereCondition()` method to eliminate duplicate validation logic.

### 4. Improved Caching Pattern

Fixed caching by initializing `_visibleColumns` to `null` as sentinel for "not computed yet".

### 5. Added Null Check

Added defensive check for `connector.query` in `getQueryInterface()`.

---

## Files Changed

### Core Package (`packages/core`)

| File | Changes |
|------|---------|
| `src/helpers/inversion/common/types.ts` | Added `IModelSettings` with `hiddenProperties` |
| `src/base/repositories/common/types.ts` | Updated `TFields` to support array format |
| `src/base/repositories/core/base.ts` | Added `getHiddenPropertiesResolver()`, caching, refactored `resolveConnector` |
| `src/base/repositories/core/readable.ts` | Added null check in `getQueryInterface` |
| `src/base/repositories/core/persistable.ts` | Added `validateWhereCondition`, updated CRUD methods |
| `src/base/repositories/operators/filter.ts` | Added `THiddenPropertiesResolver`, JSON ordering, array fields |

### Examples (`examples/vert`)

| File | Changes |
|------|---------|
| `src/models/entities/user.model.ts` | Added hiddenProperties config |
| `src/services/repository-test.service.ts` | Added 21 hidden properties test cases |

---

## No Breaking Changes

All changes are additive. Existing code continues to work without modification.
