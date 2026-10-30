---
title: Repository Enhancements
description: Models can hide properties from every repository query, field selection accepts arrays, and results can be ordered by a path inside a JSON column.
packages: ['@venizia/ignis']
---

# Changelog - 2025-12-30

## Repository Enhancements

**In one line.** You can keep sensitive columns out of repository results, select fields with a plain array, and order by nested JSON fields.

## What changed

- **Hidden properties.** List them in `@model` settings under `hiddenProperties`. They are excluded at the SQL level, and also from included relations.
- **Array fields.** `fields: ['id', 'email', 'name']` works the same as `fields: { id: true, email: true, name: true }`.
- **JSON path ordering.** Order by a field inside a JSON/JSONB column with dot notation and array indices.

```typescript
@model({
  type: 'entity',
  settings: {
    hiddenProperties: ['password', 'secret'],
  },
})
export class User extends BaseEntity<typeof User.schema> {
  static override schema = pgTable('User', {...});
}

order: ['metadata.priority DESC']
order: ['settings.display.theme ASC']
order: ['tags[0] ASC']
order: ['data.items[2].name DESC']
```

## Who is affected

- **Everyone.** No action needed. All changes are additive.

## Details

- Hidden properties are excluded from `find()`, `findOne()`, `findById()` results and from the RETURNING of create, update and delete operations.
- You can still filter by hidden fields in `where`, `count()` and `existsWith()`.
- A direct connector query bypasses the repository and **includes** hidden fields: `userRepo.connector.select().from(User.schema)`.
- JSON path components are validated to prevent SQL injection.
