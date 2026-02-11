# Creating an Instance

## `WorkerPoolHelper`

The `WorkerPoolHelper` is a singleton that manages the creation, registration, and termination of worker threads. It caps the pool size at `os.cpus().length` by default.

```typescript
import { WorkerPoolHelper } from '@venizia/ignis-helpers';

const workerPool = WorkerPoolHelper.getInstance();
```

> [!WARNING]
> When the pool reaches the maximum number of CPU cores and `ignoreMaxWarning` is `false` (the default), `register()` silently skips the registration and logs a warning. Duplicate keys are also skipped.

## `BaseWorkerHelper`

Creates and manages a single worker thread from the main thread.

```typescript
import { BaseWorkerHelper } from '@venizia/ignis-helpers';
import path from 'node:path';

const worker = new BaseWorkerHelper({
  identifier: 'my-worker',
  path: path.resolve(__dirname, './worker.ts'),
  options: {
    workerData: { message: 'Hello from main thread!' },
  },
});
```

::: details BaseWorkerHelper Constructor Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `identifier` | `string` | Yes | Unique identifier used in scoped logging |
| `path` | `string \| URL` | Yes | Path to the worker script file |
| `options` | `WorkerOptions` | Yes | Node.js `WorkerOptions` (e.g. `workerData`, `transferList`) |
| `scope` | `string` | No | Logger scope override (defaults to `BaseWorkerHelper`) |
| `eventHandlers` | `object` | No | Partial map of lifecycle callbacks (see below) |

**Event Handlers:**

| Handler | Signature | Default Behavior |
|---------|-----------|------------------|
| `onOnline` | `() => void` | Logs `Worker ONLINE` |
| `onMessage` | `({ message }) => void` | Logs message as JSON |
| `onError` | `({ error }) => void` | Logs error |
| `onExit` | `({ code }) => void` | Logs exit code |
| `onMessageError` | `({ error }) => void` | Logs serialization error |

:::

## `BaseWorkerThreadHelper`

Used inside a worker script to manage multiple `WorkerBus` instances. Automatically validates that it is running inside a worker thread (throws if called from the main thread).

```typescript
import { BaseWorkerThreadHelper } from '@venizia/ignis-helpers';

const thread = new BaseWorkerThreadHelper({ scope: 'my-worker-thread' });
```

## `BaseWorkerBusHelper`

Two-way communication over a `MessagePort`. Requires a `BaseWorkerMessageBusHandlerHelper` for handling incoming events.

```typescript
import { BaseWorkerBusHelper, BaseWorkerMessageBusHandlerHelper } from '@venizia/ignis-helpers';

const bus = new BaseWorkerBusHelper({
  scope: 'task-bus',
  port: someMessagePort,
  busHandler: new BaseWorkerMessageBusHandlerHelper({
    scope: 'task-bus-handler',
    onMessage: ({ message }) => {
      console.log('Received:', message);
    },
  }),
});
```

::: details BaseWorkerBusHelper Constructor Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `scope` | `string` | Yes | Logger scope identifier |
| `port` | `MessagePort` | Yes | The `MessagePort` to communicate over |
| `busHandler` | `IWorkerMessageBusHandler` | Yes | Handler for incoming messages and lifecycle events |

:::

::: details BaseWorkerMessageBusHandlerHelper Constructor Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `scope` | `string` | Yes | Logger scope identifier |
| `onMessage` | `({ message }) => void` | Yes | Handler for incoming messages |
| `onClose` | `() => void` | No | Port closed handler (defaults to no-op) |
| `onError` | `({ error }) => void` | No | Error handler (defaults to logging the error) |
| `onExit` | `({ exitCode }) => void` | No | Exit handler (defaults to logging the exit code) |

:::
