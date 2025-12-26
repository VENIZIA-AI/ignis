---
title: Transaction Support
description: Explicit transaction support for atomic operations across repositories
---

# Changelog - 2025-12-26

## Transaction Support

Added explicit transaction support to the repository layer, enabling atomic operations across multiple services and repositories.

## Overview

- **Explicit Transactions**: `beginTransaction()` method on repositories.
- **Isolation Levels**: Support for `READ COMMITTED`, `REPEATABLE READ`, and `SERIALIZABLE`.
- **Pass-through Context**: Transaction objects can be passed via `options`.

## New Features

### Repository Transactions

**File:** `packages/core/src/base/repositories/core/base.ts`

**Problem:** Previously, transactions relied on Drizzle's callback API, which made it difficult to share a transaction context across different services or decoupled components.

**Solution:** Introduced explicit `ITransaction` objects managed by the repository/datasource.

```typescript
const tx = await repo.beginTransaction();

try {
  await repo.create({ data: {...}, options: { transaction: tx } });
  await otherRepo.create({ data: {...}, options: { transaction: tx } });
  
  await tx.commit();
} catch (err) {
  await tx.rollback();
}
```

## Files Changed

### Core Package (`packages/core`)

| File | Changes |
|------|---------|
| `src/base/repositories/core/base.ts` | Added `beginTransaction` and transaction handling logic |
| `src/base/repositories/core/readable.ts` | Updated read methods to respect transaction context |
| `src/base/repositories/core/persistable.ts` | Updated write methods to respect transaction context |
| `src/base/datasources/common/types.ts` | Added `ITransaction`, `ITransactionOptions`, and `IsolationLevels` |
| `src/base/datasources/base.ts` | Implemented `beginTransaction` on `BaseDataSource` |

## Migration Guide

### No Breaking Changes

This is an additive feature. Existing code using standard CRUD methods will continue to work without modification (using implicit auto-commit transactions).
