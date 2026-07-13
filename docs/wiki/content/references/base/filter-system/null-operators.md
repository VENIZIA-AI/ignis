---
title: Null Check Operators
description: Operators for checking null and non-null values
difficulty: intermediate
---

# Null Check Operators

Operators for checking null and non-null values.


## Direct Null Assignment

The simplest way to check for NULL:

```typescript
// IS NULL (implicit)
{ where: { deletedAt: null } }
// SQL: WHERE "deleted_at" IS NULL
```


## eq with Null

```typescript
{ where: { deletedAt: { eq: null } } }
// SQL: WHERE "deleted_at" IS NULL

{ where: { status: { eq: 'active' } } }
// SQL: WHERE "status" = 'active'
```


## ne / neq with Null

```typescript
// IS NOT NULL
{ where: { deletedAt: { ne: null } } }
{ where: { deletedAt: { neq: null } } }
// SQL: WHERE "deleted_at" IS NOT NULL

// Not equal to value
{ where: { status: { ne: 'deleted' } } }
// SQL: WHERE "status" != 'deleted'
```


## is - IS NULL / Equality

```typescript
// NULL check
{ where: { deletedAt: { is: null } } }
// SQL: WHERE "deleted_at" IS NULL

// Value check (same as eq)
{ where: { status: { is: 'active' } } }
// SQL: WHERE "status" = 'active'
```


## isn - IS NOT NULL / Not Equality

```typescript
// NOT NULL check
{ where: { verifiedAt: { isn: null } } }
// SQL: WHERE "verified_at" IS NOT NULL

// Value check (same as ne)
{ where: { status: { isn: 'deleted' } } }
// SQL: WHERE "status" != 'deleted'
```


## exists / notExists - Presence Check

`exists` and `notExists` are presence operators - they take a boolean rather than a value, and read more naturally than `is`/`isn` against `null`. They work on the PostgreSQL connector, and `exists` also works over JSON paths there.

```typescript
// Field is present (IS NOT NULL)
{ where: { deletedAt: { exists: false } } }  // no deletedAt -> IS NULL
{ where: { verifiedAt: { exists: true } } }  // has verifiedAt -> IS NOT NULL

// notExists is the inverse
{ where: { verifiedAt: { notExists: true } } }  // IS NULL

// exists over a JSON path (PostgreSQL)
{ where: { 'metadata.score': { exists: true } } }
```

| Syntax | SQL | Description |
|--------|-----|-------------|
| `{ field: { exists: true } }` | `IS NOT NULL` | Field is present |
| `{ field: { exists: false } }` | `IS NULL` | Field is missing/null |
| `{ field: { notExists: true } }` | `IS NULL` | Inverse of exists |
| `{ field: { notExists: false } }` | `IS NOT NULL` | Inverse of exists |


## Null Check Summary

| Syntax | SQL | Description |
|--------|-----|-------------|
| `{ field: null }` | `IS NULL` | Direct null check |
| `{ field: { eq: null } }` | `IS NULL` | Explicit null equality |
| `{ field: { is: null } }` | `IS NULL` | IS operator with null |
| `{ field: { exists: false } }` | `IS NULL` | Presence check (false = missing) |
| `{ field: { ne: null } }` | `IS NOT NULL` | Not-equal null check |
| `{ field: { neq: null } }` | `IS NOT NULL` | Alias for ne with null |
| `{ field: { isn: null } }` | `IS NOT NULL` | IS NOT operator with null |
| `{ field: { exists: true } }` | `IS NOT NULL` | Presence check (true = present) |

All the IS NULL / IS NOT NULL syntaxes above are equivalent -- use whichever reads best in context.

> [!NOTE]
> `ne`/`neq` follow SQL three-valued logic: a row whose field is `NULL` never matches `{ field: { neq: value } }`. This is intentional (`NULL <> value` is UNKNOWN, not TRUE). Reach for `exists`/`notExists` or an explicit `{ field: null }` branch when you want NULL rows included.


## Common Patterns

### Soft Delete Pattern

```typescript
// Find active records (not deleted)
{ where: { deletedAt: { is: null } } }

// Find deleted records only
{ where: { deletedAt: { isn: null } } }
```

### Verified Users

```typescript
// Find verified users
{ where: { emailVerifiedAt: { isn: null } } }

// Find unverified users
{ where: { emailVerifiedAt: { is: null } } }
```
