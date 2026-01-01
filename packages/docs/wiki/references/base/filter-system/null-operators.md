# Null Check Operators

Operators for checking null and non-null values.


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
