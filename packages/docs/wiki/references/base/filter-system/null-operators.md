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


## Null Check Summary

| Syntax | SQL | Description |
|--------|-----|-------------|
| `{ field: null }` | `IS NULL` | Direct null check |
| `{ field: { eq: null } }` | `IS NULL` | Explicit null equality |
| `{ field: { is: null } }` | `IS NULL` | IS operator with null |
| `{ field: { ne: null } }` | `IS NOT NULL` | Not-equal null check |
| `{ field: { neq: null } }` | `IS NOT NULL` | Alias for ne with null |
| `{ field: { isn: null } }` | `IS NOT NULL` | IS NOT operator with null |

All six syntaxes for IS NULL / IS NOT NULL are equivalent -- use whichever reads best in context.


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
