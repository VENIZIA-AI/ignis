---
title: Worker Thread
description: Manage Node.js worker_threads with a pooled registry, lifecycle-event helpers, and two-way MessagePort communication
difficulty: intermediate
---

# Worker Thread

The worker-thread helper wraps Node's `worker_threads`. It adds a pooled registry, lifecycle-event helpers, and a `MessagePort` bus for two-way communication between the main thread and a worker.

## In one example

The smallest real use: spawn a worker and register it in the singleton pool.

```typescript
import { WorkerPoolHelper, BaseWorkerHelper } from '@venizia/ignis-helpers';

const pool = WorkerPoolHelper.getInstance();

const worker = new BaseWorkerHelper<string>({
  identifier: 'image-resizer',
  path: './workers/image-resizer.js',
  options: { workerData: { quality: 80 } },
});

pool.register({ key: 'image-resizer', worker });
```

`WorkerPoolHelper` tracks active workers so the application never spawns more threads than it has CPU cores for.

## How it works

- **Main thread vs worker thread.** Two class families split by side.
  - `BaseWorkerHelper` runs on the main thread and wraps a `Worker` instance.
  - `BaseWorkerThreadHelper` runs inside the spawned worker script. It throws `[BaseWorker] Cannot start worker in MAIN_THREAD` if you construct it on the main thread instead.
- **Pool caps concurrency.** `WorkerPoolHelper` is a lazy singleton (`getInstance()`) that limits registrations to `os.cpus().length`. Past the limit, `register()` returns `false` and logs a warning - it never throws.
- **Lifecycle hooks, not raw events.**
  - `BaseWorkerHelper` binds `online`, `exit`, `error`, `message`, and `messageerror` once in its constructor. Each has a default logging behavior, overridable per instance via `eventHandlers`.
  - A synchronous throw inside a handler is caught and logged, not left to crash the process.
- **Two-way messaging via buses.** Inside a worker script, `BaseWorkerThreadHelper` manages named `BaseWorkerBusHelper` instances, each wrapping one `MessagePort`. A single worker can multiplex several independent channels this way, one per key.

## Common tasks

### Look up and message a registered worker

`get()` and `has()` read the pool by key. `size()` reports how many workers are registered.

```typescript
const worker = pool.get<string>({ key: 'image-resizer' });
if (worker && pool.has({ key: 'image-resizer' })) {
  worker.worker.postMessage('start');
}
```

### Unregister and terminate a worker

`unregister()` calls `worker.terminate()` before removing the pool entry.

```typescript
await pool.unregister({ key: 'image-resizer' });
```

### Override lifecycle handlers

Pass `eventHandlers` to react to worker events instead of the default log lines.

```typescript
const worker = new BaseWorkerHelper<MyMessageType>({
  identifier: 'data-processor',
  path: './workers/data-processor.js',
  options: { workerData: { batchSize: 100 } },
  eventHandlers: {
    onMessage: opts => console.log('Received:', opts.message),
    onError: opts => console.error('Worker error:', opts.error),
  },
});
```

### Bind a MessagePort bus inside a worker script

`BaseWorkerThreadHelper` keys buses by name so a worker can run several channels at once.

```typescript
// worker-script.js
import { MessageChannel } from 'node:worker_threads';
import {
  BaseWorkerThreadHelper,
  BaseWorkerBusHelper,
  BaseWorkerMessageBusHandlerHelper,
} from '@venizia/ignis-helpers';

const thread = new BaseWorkerThreadHelper({ scope: 'MyWorker' });
const { port1 } = new MessageChannel();

const handler = new BaseWorkerMessageBusHandlerHelper<{ task: string }>({
  scope: 'TaskHandler',
  onMessage: opts => console.log('Task received:', opts.message.task),
});

const bus = new BaseWorkerBusHelper<{ task: string }, { result: string }>({
  scope: 'TaskBus',
  port: port1,
  busHandler: handler,
});

thread.bindWorkerBus({ key: 'tasks', bus });
```

### Send a message with a transferable object

`postMessage()` accepts an optional `transferList` for zero-copy transfer of `ArrayBuffer` and similar objects.

```typescript
const buffer = new ArrayBuffer(1024);
bus.postMessage({
  message: { result: 'binary-data' },
  transferList: [buffer],
});
```

Every constructor option, event-handler default, pre/post message hook, and error message is in the [Full reference](/extensions/helpers/worker-thread/reference).

## See also

- [Full reference](/extensions/helpers/worker-thread/reference) - every constructor option, method signature, and troubleshooting case
- [Queue Helper](/extensions/helpers/queue/) - message-queue processing as an alternative to worker threads
- [Services](/guides/core-concepts/services) - running background workers within services
- [Application](/guides/core-concepts/application/) - spawning workers during application lifecycle
- [Node.js Worker Threads](https://nodejs.org/api/worker_threads.html) - underlying Node.js API

**Files:**

- [`packages/helpers/src/modules/worker-thread/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/worker-thread/base.ts) - `AbstractWorkerHelper`, `BaseWorkerHelper`, `AbstractWorkerThreadHelper`, `BaseWorkerThreadHelper`
- [`packages/helpers/src/modules/worker-thread/worker-bus.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/worker-thread/worker-bus.ts) - `AbstractWorkerBusHelper`, `BaseWorkerBusHelper`, `AbstractWorkerMessageBusHandlerHelper`, `BaseWorkerMessageBusHandlerHelper`
- [`packages/helpers/src/modules/worker-thread/worker-pool.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/worker-thread/worker-pool.ts) - `WorkerPoolHelper`
- [`packages/helpers/src/modules/worker-thread/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/worker-thread/types.ts) - `IWorker`, `IWorkerThread`, `IWorkerBus`, `IWorkerMessageBusHandler`
