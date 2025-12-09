# Performance Optimization

Optimize your Ignis application for speed and scalability.

## 1. Measure Performance

Identify bottlenecks before optimizing:

```typescript
import { executeWithPerformanceMeasure } from '@vez/ignis';

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

> **Deep Dive:** See [Performance Utility](../../references/utilities/performance.md) for advanced profiling.

## 2. Offload CPU-Intensive Tasks

Prevent blocking the event loop with Worker Threads:

**Use Worker Threads for:**
- Complex calculations or crypto operations
- Large file/data processing
- Any synchronous task > 5ms

> **Deep Dive:** See [Worker Thread Helper](../../references/helpers/worker-thread.md) for implementation guide.

## 3. Optimize Database Queries

| Technique | Example | Impact |
|-----------|---------|--------|
| **Select specific fields** | `fields: { id: true, name: true }` | Reduce data transfer |
| **Use indexes** | Create indexes on WHERE/JOIN columns | 10-100x faster queries |
| **Paginate results** | `limit: 20, offset: 0` | Prevent memory overflow |
| **Eager load relations** | `include: [{ relation: 'creator' }]` | Solve N+1 problem |

**Example:**
```typescript
await userRepository.find({
  filter: {
    fields: { id: true, name: true, email: true },  // ✅ Specific fields
    where: { status: 'ACTIVE' },
    limit: 20,                                       // ✅ Pagination
    include: [{ relation: 'profile' }],             // ✅ Eager load
  },
});
```

## 4. Implement Caching

Reduce database load with caching:

| Cache Type | Use Case | Implementation |
|-----------|----------|----------------|
| **Redis** | Distributed cache, session storage | [Redis Helper](../../references/helpers/redis.md) |
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