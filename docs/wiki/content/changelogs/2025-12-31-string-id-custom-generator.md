---
title: String ID with Custom Generator
description: Text column with customizable ID generator for maximum database compatibility
---

# Changelog - 2025-12-31

## String ID with Custom Generator

This release changes the string ID implementation from PostgreSQL `uuid` type to `text` column with a customizable ID generator for maximum database compatibility.

## Overview

- **Text Column**: String IDs now use `text` column type instead of PostgreSQL `uuid`
- **Custom Generator**: Optional `generator` function to use any ID format (UUID, nanoid, cuid, etc.)
- **Default UUID**: Uses `crypto.randomUUID()` by default for backwards compatibility
- **Consistent Naming**: Renamed `visibleColumns` to `visibleProperties` for consistency with `hiddenProperties`
- **Removed 'uuid' Option**: Principal enricher now only supports `'number' | 'string'`


## String ID Changes

### Before

```typescript
// Used PostgreSQL uuid type
uuid('id').defaultRandom().primaryKey()
// Column type: uuid
```

### After

```typescript
// Uses text column with $defaultFn
text('id').primaryKey().$defaultFn(() => crypto.randomUUID())
// Column type: text
```

### Custom Generator Option

```typescript
import { nanoid } from 'nanoid';

generateIdColumnDefs({
  id: {
    dataType: 'string',
    generator: () => nanoid(),  // Custom generator
  },
})
```

### Type Definition

```typescript
type TIdEnricherOptions = {
  id?: { columnName?: string } & (
    | { dataType: 'string'; generator?: () => string }  // NEW: optional generator
    | { dataType: 'number'; sequenceOptions?: PgSequenceOptions }
    | { dataType: 'big-number'; numberMode: 'number' | 'bigint'; sequenceOptions?: PgSequenceOptions }
  );
};
```


## Naming Consistency

Renamed internal properties for consistency:

| Before | After |
|--------|-------|
| `_visibleColumns` | `_visibleProperties` |
| `getVisibleColumns()` | `getVisibleProperties()` |
| `visibleColumns` getter/setter | `visibleProps` getter/setter |


## Principal Enricher Simplification

Removed 'uuid' option since it's now identical to 'string':

```typescript
// Before
type IdType = 'number' | 'string' | 'uuid';

// After
type IdType = 'number' | 'string';
```


## Files Changed

### Core Package (`packages/core`)

| File | Changes |
|------|---------|
| `src/base/models/enrichers/id.enricher.ts` | Text column with custom generator, type aliases |
| `src/base/models/enrichers/principal.enricher.ts` | Removed 'uuid' option, uses text for string IDs |
| `src/base/repositories/core/base.ts` | Renamed visibleColumns to visibleProperties |
| `src/base/repositories/core/readable.ts` | Updated to use getVisibleProperties() |
| `src/base/repositories/core/persistable.ts` | Updated to use getVisibleProperties() |
| `src/components/static-asset/models/base.model.ts` | uuid() to text() |
| `src/components/auth/models/entities/*.ts` | uuid() to text() for all auth models |


## Migration Guide

### No Breaking Changes for Most Users

If you're using `generateIdColumnDefs({ id: { dataType: 'string' } })`, your code continues to work. The only difference is the underlying column type changes from `uuid` to `text`.

### Database Migration

If you have existing `uuid` columns and want to migrate to `text`:

```sql
-- Option 1: Alter column type (data preserved)
ALTER TABLE "your_table" ALTER COLUMN "id" TYPE TEXT;

-- Option 2: Keep uuid type (still works with text-based code)
-- No migration needed - uuid values are compatible with text operations
```

### Custom ID Generator

To use a custom generator:

```typescript
import { nanoid } from 'nanoid';
// or
import { createId } from '@paralleldrive/cuid2';

generateIdColumnDefs({
  id: {
    dataType: 'string',
    generator: () => nanoid(),  // or createId
  },
})
```
