---
title: Planned - Transaction Support
description: Implementation plan for Loopback 4-style explicit transaction objects
---

# Planned: Transaction Support

**Status:** Planned (Not Yet Implemented)
**Priority:** Future Enhancement

## Goal

Implement Loopback 4-style explicit transaction objects, allowing transactions to be passed through multiple services/repositories instead of using Drizzle's callback-based approach.

## Target API

```typescript
// Default isolation level (READ COMMITTED)
const tx = await userRepo.beginTransaction();

// Or with specific isolation level
const tx = await userRepo.beginTransaction({
  isolationLevel: 'SERIALIZABLE'
});

try {
  await userRepo.create({ data, options: { transaction: tx } });
  await profileRepo.create({ data, options: { transaction: tx } });
  await tx.commit();
} catch (err) {
  await tx.rollback();
  throw err;
}
```

### Isolation Levels

| Level | Description | Use Case |
|-------|-------------|----------|
| `READ COMMITTED` | Default. Sees only committed data at query start | General use, most common |
| `REPEATABLE READ` | Sees snapshot from transaction start | Reports, consistent reads |
| `SERIALIZABLE` | Strictest. Full isolation, may throw serialization errors | Financial transactions, critical data |

---

## Implementation Steps

### Step 1: Define Transaction Types

**File:** `packages/core/src/base/datasources/types.ts`

```typescript
/** PostgreSQL transaction isolation levels */
export type TIsolationLevel = 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';

/** Options for starting a transaction */
export interface ITransactionOptions {
  isolationLevel?: TIsolationLevel;
}

/** Transaction object returned by beginTransaction() */
export interface ITransaction<Connector = TNodePostgresConnector> {
  /** Isolated Drizzle instance bound to this transaction */
  connector: Connector;

  /** Commit the transaction */
  commit(): Promise<void>;

  /** Rollback the transaction */
  rollback(): Promise<void>;

  /** Check if transaction is still active */
  isActive: boolean;

  /** The isolation level used for this transaction */
  isolationLevel: TIsolationLevel;
}
```

### Step 2: Add `beginTransaction()` to DataSource

**File:** `packages/core/src/base/datasources/base.ts`

```typescript
async beginTransaction(
  opts?: ITransactionOptions
): Promise<ITransaction<Connector>> {
  // 1. Get raw client from pool
  const pool = this.connector.client as Pool;
  const client = await pool.connect();

  // 2. Determine isolation level (default: READ COMMITTED)
  const isolationLevel: TIsolationLevel = opts?.isolationLevel ?? 'READ COMMITTED';

  // 3. Execute BEGIN with isolation level
  await client.query(`BEGIN TRANSACTION ISOLATION LEVEL ${isolationLevel}`);

  // 4. Create isolated Drizzle instance with this client
  const txConnector = drizzle({ client, schema: this.schema });

  // 5. Return transaction object
  let isActive = true;

  return {
    connector: txConnector as Connector,
    isActive,
    isolationLevel,

    async commit() {
      if (!isActive) throw new Error('Transaction already ended');
      try {
        await client.query('COMMIT');
      } finally {
        isActive = false;
        client.release();
      }
    },

    async rollback() {
      if (!isActive) throw new Error('Transaction already ended');
      try {
        await client.query('ROLLBACK');
      } finally {
        isActive = false;
        client.release();
      }
    },
  };
}
```

### Step 3: Update Repository Base

**File:** `packages/core/src/base/repositories/core/base.ts`

```typescript
// Add method to start transaction (delegates to DataSource)
async beginTransaction(opts?: ITransactionOptions): Promise<ITransaction> {
  return this.dataSource.beginTransaction(opts);
}

// Replace this.connector with getConnector(opts)
protected getConnector(opts?: { transaction?: ITransaction }) {
  if (opts?.transaction) {
    if (!opts.transaction.isActive) {
      throw getError({ message: 'Transaction is no longer active' });
    }
    return opts.transaction.connector;
  }
  return this.dataSource.connector;
}
```

### Step 4: Update CRUD Options Types

**File:** `packages/core/src/base/repositories/common/types.ts`

```typescript
export type TTransactionOption = {
  transaction?: ITransaction;
};

// Add to existing option types
export type TCreateOptions = TTransactionOption & {
  shouldReturn?: boolean;
  log?: TRepositoryLogOptions;
};
```

### Step 5: Update CRUD Methods

**Files:** `readable.ts`, `persistable.ts`

Change all methods from:
```typescript
this.connector.insert(...)
```

To:
```typescript
this.getConnector(opts.options).insert(...)
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `packages/core/src/base/datasources/types.ts` | Add `TIsolationLevel`, `ITransactionOptions`, `ITransaction` |
| `packages/core/src/base/datasources/base.ts` | Add `beginTransaction(opts?)` method |
| `packages/core/src/base/repositories/common/types.ts` | Add `TTransactionOption` |
| `packages/core/src/base/repositories/core/base.ts` | Add `beginTransaction(opts?)`, `getConnector(opts)` |
| `packages/core/src/base/repositories/core/readable.ts` | Use `getConnector(opts)` in all methods |
| `packages/core/src/base/repositories/core/persistable.ts` | Use `getConnector(opts)` in all methods |

---

## Breaking Changes

1. **`this.connector`** → `this.getConnector(opts)`
   - Backward compatible when called without args

2. **Options parameter** - Now includes optional `transaction` field
   - Non-breaking: transaction is optional

---

## Benefits

| Aspect | Current (Drizzle Callback) | After (Pass-through) |
|--------|---------------------------|----------------------|
| Service composition | Hard - all in one callback | Easy - pass tx anywhere |
| Separation of concerns | Services must know each other | Services stay independent |
| Testing | Complex mocking | Easy to mock tx object |
| Code organization | Nested callbacks | Flat, sequential flow |
