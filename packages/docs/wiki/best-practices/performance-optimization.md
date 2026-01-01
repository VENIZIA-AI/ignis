# Performance Optimization

Optimize your Ignis application for speed and scalability.

## 1. Measure Performance

Identify bottlenecks before optimizing:

```typescript
import { executeWithPerformanceMeasure } from '@venizia/ignis';

await executeWithPerformanceMeasure({
  logger: this.logger,
  scope: 'DataProcessing',
  description: 'Process large dataset',
  task: async () => {
    await processLargeDataset();
  },
});
```

Logs execution time automatically.

> **Deep Dive:** See [Performance Utility](../references/utilities/performance.md) for advanced profiling.

## 2. Offload CPU-Intensive Tasks

Prevent blocking the event loop with Worker Threads:

**Use Worker Threads for:**
- Complex calculations or crypto operations
- Large file/data processing
- Any synchronous task > 5ms

> **Deep Dive:** See [Worker Thread Helper](../references/helpers/worker-thread.md) for implementation guide.

## 3. Optimize Database Queries

| Technique | Example | Impact |
|-----------|---------|--------|
| **Select specific fields** | `fields: { id: true, name: true }` | Reduce data transfer |
| **Use indexes** | Create indexes on WHERE/JOIN columns | 10-100x faster queries |
| **Mandatory Limit** | `limit: 20` | Prevent fetching massive datasets |
| **Paginate results** | `limit: 20, offset: 0` | Prevent memory overflow |
| **Eager load relations** | `include: [{ relation: 'creator' }]` | Solve N+1 problem |

### Query Operators Reference

Ignis supports extensive query operators for filtering:

| Operator | Description | Example |
|----------|-------------|---------|
| `eq` | Equal (handles null) | `{ status: { eq: 'ACTIVE' } }` |
| `ne`, `neq` | Not equal | `{ status: { ne: 'DELETED' } }` |
| `gt`, `gte` | Greater than (or equal) | `{ age: { gte: 18 } }` |
| `lt`, `lte` | Less than (or equal) | `{ price: { lt: 100 } }` |
| `like` | SQL LIKE (case-sensitive) | `{ name: { like: '%john%' } }` |
| `ilike` | Case-insensitive LIKE | `{ email: { ilike: '%@gmail%' } }` |
| `nlike`, `nilike` | NOT LIKE variants | `{ name: { nlike: '%test%' } }` |
| `regexp` | PostgreSQL regex (`~`) | `{ code: { regexp: '^[A-Z]+$' } }` |
| `iregexp` | Case-insensitive regex (`~*`) | `{ name: { iregexp: '^john' } }` |
| `in`, `inq` | Value in array | `{ status: { in: ['A', 'B'] } }` |
| `nin` | Value NOT in array | `{ role: { nin: ['guest'] } }` |
| `between` | Range (inclusive) | `{ age: { between: [18, 65] } }` |
| `is`, `isn` | IS NULL / IS NOT NULL | `{ deletedAt: { is: null } }` |
| `and`, `or` | Logical operators | `{ or: [{ a: 1 }, { b: 2 }] }` |

**Complex Filter Example:**

```typescript
await repo.find({
  filter: {
    where: {
      and: [
        { status: { in: ['ACTIVE', 'PENDING'] } },
        { createdAt: { gte: new Date('2024-01-01') } },
        { or: [
          { role: 'admin' },
          { permissions: { ilike: '%manage%' } }
        ]}
      ]
    },
    limit: 50,
  },
});
```

### JSON Path Filtering

Filter by nested JSON/JSONB fields using PostgreSQL's `#>` operator:

```typescript
// Order by nested JSON path
await repo.find({
  filter: {
    order: ['metadata.nested[0].field ASC'],
  },
});

// The framework uses PostgreSQL #> operator for path extraction
// metadata #> '{nested,0,field}'
```

> [!TIP]
> **Avoid Deep Nesting:** While Ignis supports deeply nested `include` filters, each level adds significant overhead to query construction and result mapping. We strongly recommend a **maximum of 2 levels** (e.g., `User -> Orders -> Items`). For more complex data fetching, consider separate queries.

**Example:**
```typescript
await userRepository.find({
  filter: {
    fields: { id: true, name: true, email: true },  // ✅ Specific fields
    where: { status: 'ACTIVE' },
    limit: 20,                                       // ✅ Mandatory limit
    include: [{ 
      relation: 'orders',
      scope: {
        include: [{ relation: 'items' }]             // ✅ Level 2 (Recommended limit)
      }
    }],
  },
});
```

## 4. Implement Caching

Reduce database load with caching:

| Cache Type | Use Case | Implementation |
|-----------|----------|----------------|
| **Redis** | Distributed cache, session storage | [Redis Helper](../references/helpers/redis.md) |
| **In-Memory** | Single-process cache | `MemoryStorageHelper` |

**Example:**
```typescript
// Cache expensive query results
const cached = await redis.get('users:active');
if (!cached) {
  const users = await userRepository.find({ where: { active: true } });
  await redis.set('users:active', users, 300); // 5 min TTL
}
```

## 5. Production Settings

| Setting | Value | Why |
|---------|-------|-----|
| `NODE_ENV` | `production` | Enables library optimizations |
| Process Manager | PM2, systemd, Docker | Auto-restart, cluster mode |
| Cluster Mode | CPU cores | Utilize all CPUs |

**PM2 Cluster Mode:**
```bash
pm2 start dist/index.js -i max  # Use all CPU cores
```

## 6. Transaction Support

Use transactions to ensure atomicity across multiple database operations:

```typescript
// Start a transaction
const tx = await userRepository.beginTransaction({
  isolationLevel: 'READ COMMITTED', // or 'REPEATABLE READ' | 'SERIALIZABLE'
});

try {
  // Pass transaction to all operations
  const user = await userRepository.create({
    data: { name: 'John', email: 'john@example.com' },
    options: { transaction: tx },
  });

  await orderRepository.create({
    data: { userId: user.data.id, total: 100 },
    options: { transaction: tx },
  });

  // Commit if all operations succeed
  await tx.commit();
} catch (error) {
  // Rollback on any failure
  await tx.rollback();
  throw error;
}
```

**Transaction Isolation Levels:**

| Level | Description | Use Case |
|-------|-------------|----------|
| `READ COMMITTED` | See committed data only (default) | Most CRUD operations |
| `REPEATABLE READ` | Consistent reads within transaction | Reports, aggregations |
| `SERIALIZABLE` | Full isolation, may retry | Financial transactions |

> [!WARNING]
> Higher isolation levels reduce concurrency. Use `READ COMMITTED` unless you have specific consistency requirements.
