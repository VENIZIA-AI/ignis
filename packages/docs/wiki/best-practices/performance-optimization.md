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

## 7. Database Connection Pooling

Connection pooling significantly improves performance by reusing database connections instead of creating new ones for each request.

**Configure in DataSource:**

```typescript
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

export class PostgresDataSource extends AbstractDataSource {
  override connect(): void {
    const pool = new Pool({
      host: this.settings.host,
      port: this.settings.port,
      user: this.settings.username,
      password: this.settings.password,
      database: this.settings.database,

      // Connection pool settings
      max: 20,                      // Maximum connections in pool
      min: 5,                       // Minimum connections to maintain
      idleTimeoutMillis: 30000,     // Close idle connections after 30s
      connectionTimeoutMillis: 5000, // Fail if can't connect in 5s
      maxUses: 7500,                // Close connection after 7500 queries
    });

    this.connector = drizzle({ client: pool, schema: this.schema });
  }
}
```

**Recommended Pool Sizes:**

| Server RAM | Concurrent Users | Max Pool Size | Min Pool Size |
|------------|------------------|---------------|---------------|
| < 2GB | < 100 | 10 | 2 |
| 2-4GB | 100-500 | 20 | 5 |
| 4-8GB | 500-1000 | 30 | 10 |
| > 8GB | > 1000 | 50+ | 15 |

**Formula:** `max_connections = (number_of_cores * 2) + effective_spindle_count`

For most applications: `max_connections = CPU_cores * 2 + 1`

**Monitoring Pool Health:**

```typescript
// Log pool statistics periodically
const pool = new Pool({ /* ... */ });

setInterval(() => {
  this.logger.info('[pool] Stats | total: %d | idle: %d | waiting: %d',
    pool.totalCount,
    pool.idleCount,
    pool.waitingCount
  );
}, 60000); // Every minute
```

**Warning Signs:**
- `waitingCount > 0` consistently → Increase `max`
- `idleCount === totalCount` always → Decrease `max`
- Connection timeouts → Check network, increase `connectionTimeoutMillis`

## 8. Query Optimization Tips

### Use Indexes Strategically

```typescript
// Create indexes on frequently queried columns
export const User = pgTable('User', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),  // Implicit unique index
  status: text('status').notNull(),
  createdAt: timestamp('created_at').notNull(),
}, (table) => ({
  // Composite index for common query patterns
  statusCreatedIdx: index('idx_user_status_created').on(table.status, table.createdAt),
  // Partial index for active users only
  activeEmailIdx: index('idx_active_email').on(table.email).where(eq(table.status, 'ACTIVE')),
}));
```

### Avoid N+1 Queries

```typescript
// ❌ BAD - N+1 queries
const users = await userRepo.find({ filter: { limit: 100 } });
for (const user of users.data) {
  user.posts = await postRepo.find({ filter: { where: { authorId: user.id } } });
}

// ✅ GOOD - Single query with relations
const users = await userRepo.find({
  filter: {
    limit: 100,
    include: [{ relation: 'posts' }],
  },
});
```

### Batch Operations

```typescript
// ❌ BAD - Many individual inserts
for (const item of items) {
  await repo.create({ data: item });
}

// ✅ GOOD - Batch insert
await repo.createMany({ data: items });
```

## 9. Memory Management

### Stream Large Datasets

```typescript
// ❌ BAD - Load all records into memory
const allUsers = await userRepo.find({ filter: { limit: 100000 } });

// ✅ GOOD - Process in batches
const batchSize = 1000;
let offset = 0;
let hasMore = true;

while (hasMore) {
  const batch = await userRepo.find({
    filter: { limit: batchSize, offset },
  });

  for (const user of batch.data) {
    await processUser(user);
  }

  hasMore = batch.data.length === batchSize;
  offset += batchSize;
}
```

### Avoid Memory Leaks in Long-Running Processes

```typescript
// ❌ BAD - Growing array in long-running process
const processedIds: string[] = [];
// This array grows forever!

// ✅ GOOD - Use Set with cleanup or external storage
const processedIds = new Set<string>();

// Periodically clear or use Redis
setInterval(() => {
  if (processedIds.size > 10000) {
    processedIds.clear();
  }
}, 3600000); // Every hour
```

## Performance Checklist

| Category | Check | Impact |
|----------|-------|--------|
| **Database** | Connection pooling configured | High |
| **Database** | Indexes on WHERE/JOIN columns | High |
| **Database** | Limit on all queries | High |
| **Queries** | Using `fields` to select specific columns | Medium |
| **Queries** | Relations limited to 2 levels | Medium |
| **Queries** | Batch operations for bulk data | High |
| **Memory** | Large datasets processed in batches | High |
| **Caching** | Expensive queries cached | High |
| **Workers** | CPU-intensive tasks offloaded | High |
| **Monitoring** | Performance logging enabled | Low |

## See Also

- [Data Modeling](./data-modeling) - Schema design for performance
- [Deployment Strategies](./deployment-strategies) - Production scaling
- [Common Pitfalls](./common-pitfalls) - Performance mistakes to avoid
