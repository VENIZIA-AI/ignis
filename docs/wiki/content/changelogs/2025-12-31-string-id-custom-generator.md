---
title: String ID with Custom Generator
description: String IDs now use a text column with an optional custom generator instead of the PostgreSQL uuid type.
packages: ['@venizia/ignis']
---

# Changelog - 2025-12-31

## String ID with Custom Generator

**In one line.** String IDs are stored in a `text` column, and you can plug in any ID format (UUID, nanoid, cuid) with a `generator` function.

## What changed

- **Text column.** String IDs use `text` instead of the PostgreSQL `uuid` type.
- **Custom generator.** `generateIdColumnDefs` accepts `generator` for `dataType: 'string'`. The default is `crypto.randomUUID()`.
- **Renames.** `visibleColumns` is now `visibleProperties`, to match `hiddenProperties`.
- **Principal enricher.** The `'uuid'` id type is removed; only `'number' | 'string'` remain.

```typescript
import { nanoid } from 'nanoid';

generateIdColumnDefs({
  id: {
    dataType: 'string',
    generator: () => nanoid(),
  },
})
```

## Who is affected

- **Code using `generateIdColumnDefs({ id: { dataType: 'string' } })`.** It keeps working; only the column type changes from `uuid` to `text`.
- **Existing `uuid` columns.** See the database step below.
- **Code using the old names or the `'uuid'` id type.** Rename them (below).

## Breaking changes

> [!WARNING]
> Affects code that uses the renamed members or the removed `'uuid'` id type.

**Before:**
```typescript
type IdType = 'number' | 'string' | 'uuid';
// _visibleColumns, getVisibleColumns(), visibleColumns getter/setter
```

**After:**
```typescript
type IdType = 'number' | 'string';
// _visibleProperties, getVisibleProperties(), visibleProps getter/setter
```

To move an existing `uuid` column to `text`, alter the column type (data is preserved), or keep the `uuid` type, which still works with the text-based code:

```sql
ALTER TABLE "your_table" ALTER COLUMN "id" TYPE TEXT;
```
