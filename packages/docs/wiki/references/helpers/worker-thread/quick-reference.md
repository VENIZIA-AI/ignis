# Quick Reference

| Class | Extends | Purpose |
|-------|---------|---------|
| **WorkerPoolHelper** | `BaseHelper` | Singleton managing pool of workers (capped at CPU core count) |
| **BaseWorkerHelper** | `AbstractWorkerHelper` | Create and manage a single worker thread lifecycle |
| **BaseWorkerThreadHelper** | `AbstractWorkerThreadHelper` | Run inside a worker thread; manages `WorkerBus` instances |
| **BaseWorkerMessageBusHandlerHelper** | `AbstractWorkerMessageBusHandlerHelper` | Handle incoming messages, errors, and lifecycle events on a `MessagePort` |
| **BaseWorkerBusHelper** | `AbstractWorkerBusHelper` | Two-way communication over a `MessagePort` with pre/post hooks |

> [!NOTE]
> All concrete classes extend `BaseHelper`, giving you scoped logging via `this.logger.for(methodName)` out of the box.

### Use Cases

- CPU-intensive calculations
- Large data processing
- Parallel computations
- Video/image processing

### Worker Communication

| Pattern | Complexity | Use When |
|---------|------------|----------|
| **Simple (parentPort)** | Low | One-way or basic messaging |
| **WorkerBus (MessageChannel)** | High | Complex two-way communication with lifecycle hooks |

### WorkerPoolHelper Methods

| Method | Purpose |
|--------|---------|
| `getInstance()` | Get singleton instance |
| `register({ key, worker })` | Add worker to pool |
| `unregister({ key })` | Remove and terminate worker |
| `get({ key })` | Retrieve a registered worker by key |
| `has({ key })` | Check whether a worker key exists in the pool |
| `size()` | Return current number of workers in the pool |

::: details Import Paths

```typescript
import {
  WorkerPoolHelper,
  BaseWorkerHelper,
  BaseWorkerThreadHelper,
  BaseWorkerBusHelper,
  BaseWorkerMessageBusHandlerHelper,
} from '@venizia/ignis-helpers';
```

:::
