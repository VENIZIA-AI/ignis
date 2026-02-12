# Worker Thread

Manage Node.js `worker_threads` for concurrent CPU-bound task execution with pooling, lifecycle management, and two-way communication via `MessagePort`.

## Quick Reference

| Class | Extends | Use Case |
|-------|---------|----------|
| `WorkerPoolHelper` | `BaseHelper` | Singleton registry that tracks and limits active worker instances |
| `BaseWorkerHelper<MessageType>` | `AbstractWorkerHelper<MessageType>` | Wraps a `Worker` with event lifecycle hooks (online, exit, error, message) |
| `BaseWorkerThreadHelper` | `AbstractWorkerThreadHelper` | Runs inside a worker thread; manages named `WorkerBus` channels |
| `BaseWorkerBusHelper<IC, IP>` | `AbstractWorkerBusHelper<IC, IP>` | Bidirectional `MessagePort` communication with pre/post hooks |
| `BaseWorkerMessageBusHandlerHelper<IC>` | `AbstractWorkerMessageBusHandlerHelper<IC>` | Defines event handlers for a worker bus (message, close, error, exit) |

| Item | Value |
|------|-------|
| **Package** | `@venizia/ignis-helpers` |
| **Peer Dependency** | None (uses built-in `node:worker_threads`) |
| **Runtimes** | Node.js (uses `node:worker_threads` and `node:os`) |

#### Import Paths

```typescript
import {
  WorkerPoolHelper,
  BaseWorkerHelper,
  BaseWorkerThreadHelper,
  BaseWorkerBusHelper,
  BaseWorkerMessageBusHandlerHelper,
} from '@venizia/ignis-helpers';

import type {
  IWorker,
  IWorkerThread,
  IWorkerBus,
  IWorkerMessageBusHandler,
} from '@venizia/ignis-helpers';
```

## Creating an Instance

### WorkerPoolHelper (Singleton)

`WorkerPoolHelper` is a singleton registry for active workers. It limits the pool size to the number of CPU cores by default.

```typescript
import { WorkerPoolHelper } from '@venizia/ignis-helpers';

// Get the singleton instance
const pool = WorkerPoolHelper.getInstance();
```

You can also construct a custom instance directly:

```typescript
const pool = new WorkerPoolHelper({ ignoreMaxWarning: true });
```

#### WorkerPoolHelper Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ignoreMaxWarning` | `boolean` | `false` | When `true`, allows registering workers beyond the CPU core count. When `false`, registration is skipped once the pool reaches the CPU core limit. |

> [!NOTE]
> `WorkerPoolHelper.getInstance()` always creates the singleton with `ignoreMaxWarning: false`. To override this behavior, construct a new instance manually.

### BaseWorkerHelper (Main Thread Worker Wrapper)

`BaseWorkerHelper` creates a `Worker` from a file path and automatically binds all lifecycle events.

```typescript
import { BaseWorkerHelper } from '@venizia/ignis-helpers';

const worker = new BaseWorkerHelper<MyMessageType>({
  identifier: 'data-processor',
  path: './workers/data-processor.js',
  options: { workerData: { batchSize: 100 } },
  eventHandlers: {
    onMessage: (opts) => {
      console.log('Received:', opts.message);
    },
    onError: (opts) => {
      console.error('Worker error:', opts.error);
    },
  },
});
```

#### BaseWorkerHelper Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `identifier` | `string` | -- | A unique name for this worker instance, used in log output. Required. |
| `path` | `string \| URL` | -- | Path to the worker script file. Required. |
| `options` | `WorkerOptions` | -- | Node.js `WorkerOptions` passed directly to `new Worker()`. Required. Supports `workerData`, `transferList`, `env`, etc. |
| `scope` | `string` | `'BaseWorkerHelper'` | Logger scope prefix. |
| `eventHandlers` | `Partial<Pick<IWorker<MessageType>, ...>>` | `undefined` | Optional overrides for lifecycle event callbacks. Any handler not provided falls back to default logging behavior. |

#### Event Handler Overrides

| Handler | Signature | Default Behavior |
|---------|-----------|-----------------|
| `onOnline` | `() => ValueOrPromise<void>` | Logs `"Worker ONLINE"` at info level |
| `onExit` | `(opts: { code: string \| number }) => ValueOrPromise<void>` | Logs `"Worker EXIT"` with exit code at warn level |
| `onError` | `(opts: { error: Error }) => ValueOrPromise<void>` | Logs `"Worker ERROR"` with error at error level |
| `onMessage` | `(opts: { message: MessageType }) => ValueOrPromise<void>` | Logs `"Worker MESSAGE"` with message at error level |
| `onMessageError` | `(opts: { error: Error }) => ValueOrPromise<void>` | Logs `"Worker MESSAGE_ERROR"` with error at error level |

### BaseWorkerThreadHelper (Inside Worker Thread)

`BaseWorkerThreadHelper` is used inside a worker script to manage named communication buses. It must be instantiated from within a worker thread -- constructing it on the main thread throws an error.

```typescript
// Inside worker-script.js
import { BaseWorkerThreadHelper } from '@venizia/ignis-helpers';

const thread = new BaseWorkerThreadHelper({ scope: 'DataProcessor' });
```

#### BaseWorkerThreadHelper Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `scope` | `string` | -- | Logger scope and identifier for this worker thread. Required. |

### BaseWorkerBusHelper (MessagePort Communication)

`BaseWorkerBusHelper` wraps a `MessagePort` to provide structured bidirectional messaging with lifecycle event handlers.

```typescript
import { BaseWorkerBusHelper, BaseWorkerMessageBusHandlerHelper } from '@venizia/ignis-helpers';
import { parentPort } from 'node:worker_threads';

const handler = new BaseWorkerMessageBusHandlerHelper<IncomingMessage>({
  scope: 'MyBusHandler',
  onMessage: (opts) => {
    console.log('Received:', opts.message);
  },
});

const bus = new BaseWorkerBusHelper<IncomingMessage, OutgoingMessage>({
  scope: 'MyBus',
  port: parentPort!,
  busHandler: handler,
});
```

#### BaseWorkerBusHelper Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `scope` | `string` | -- | Logger scope and identifier. Required. |
| `port` | `MessagePort` | -- | The `MessagePort` to bind for communication. Required. |
| `busHandler` | `IWorkerMessageBusHandler<IConsumePayload>` | -- | Handler that receives incoming messages and lifecycle events. Required. |

### BaseWorkerMessageBusHandlerHelper

Defines the event callbacks for a worker bus.

```typescript
const handler = new BaseWorkerMessageBusHandlerHelper<MyPayload>({
  scope: 'ProcessorHandler',
  onMessage: (opts) => {
    console.log('Processing:', opts.message);
  },
  onError: (opts) => {
    console.error('Bus error:', opts.error);
  },
});
```

#### BaseWorkerMessageBusHandlerHelper Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `scope` | `string` | -- | Logger scope and identifier. Required. |
| `onMessage` | `(opts: { message: IConsumePayload }) => ValueOrPromise<void>` | -- | Handler called when a message is received on the port. Required. |
| `onClose` | `() => ValueOrPromise<void>` | No-op `() => {}` | Handler called when the port is closed. |
| `onError` | `(opts: { error: Error }) => ValueOrPromise<void>` | Logs error at error level | Handler called on port errors and message deserialization errors. |
| `onExit` | `(opts: { exitCode: number \| string }) => ValueOrPromise<void>` | Logs exit code at warn level | Handler called when the port exits. |

## Usage

### Registering Workers in the Pool

Use `WorkerPoolHelper` to track active workers. The pool prevents over-allocation by limiting registrations to the number of CPU cores.

```typescript
const pool = WorkerPoolHelper.getInstance();

const worker = new BaseWorkerHelper<string>({
  identifier: 'image-resizer',
  path: './workers/image-resizer.js',
  options: { workerData: { quality: 80 } },
});

// Register the worker in the pool
pool.register({ key: 'image-resizer', worker });

// Check pool state
pool.has({ key: 'image-resizer' }); // true
pool.size();                         // 1
```

> [!WARNING]
> When the pool reaches the CPU core limit and `ignoreMaxWarning` is `false`, further `register()` calls are silently skipped with a warning log. No error is thrown.

### Retrieving and Unregistering Workers

```typescript
const pool = WorkerPoolHelper.getInstance();

// Retrieve a registered worker
const worker = pool.get<string>({ key: 'image-resizer' });
if (worker) {
  worker.worker.postMessage('start');
}

// Unregister terminates the worker and removes it from the pool
await pool.unregister({ key: 'image-resizer' });
```

`unregister()` calls `worker.terminate()` before removing the entry from the registry.

### Managing Worker Buses from Inside a Worker Thread

`BaseWorkerThreadHelper` manages named communication channels (buses) within a worker script. Each bus is keyed by a string and wraps a `MessagePort`.

```typescript
// worker-script.js
import { MessageChannel } from 'node:worker_threads';
import {
  BaseWorkerThreadHelper,
  BaseWorkerBusHelper,
  BaseWorkerMessageBusHandlerHelper,
} from '@venizia/ignis-helpers';

const thread = new BaseWorkerThreadHelper({ scope: 'MyWorker' });

// Create a message channel
const { port1, port2 } = new MessageChannel();

// Create a handler and bus
const handler = new BaseWorkerMessageBusHandlerHelper<{ task: string }>({
  scope: 'TaskHandler',
  onMessage: (opts) => {
    console.log('Task received:', opts.message.task);
  },
});

const bus = new BaseWorkerBusHelper<{ task: string }, { result: string }>({
  scope: 'TaskBus',
  port: port1,
  busHandler: handler,
});

// Bind and retrieve buses
thread.bindWorkerBus({ key: 'tasks', bus });
const taskBus = thread.getWorkerBus<{ task: string }, { result: string }>({
  key: 'tasks',
});
```

### Sending Messages via a Worker Bus

`BaseWorkerBusHelper.postMessage()` sends data through the underlying `MessagePort`. It supports an optional `transferList` for zero-copy transfer of `ArrayBuffer` and similar objects.

```typescript
// Send a simple message
bus.postMessage({
  message: { result: 'processed' },
  transferList: undefined,
});

// Send with transferable objects (zero-copy)
const buffer = new ArrayBuffer(1024);
bus.postMessage({
  message: { result: 'binary-data' },
  transferList: [buffer],
});
```

#### Pre/Post Message Hooks

`BaseWorkerBusHelper` supports optional `onBeforePostMessage` and `onAfterPostMessage` hooks. These are undefined by default but can be assigned after construction.

```typescript
bus.onBeforePostMessage = (opts) => {
  console.log('About to send:', opts.message);
};

bus.onAfterPostMessage = (opts) => {
  console.log('Sent:', opts.message);
};
```

### Unbinding a Worker Bus

Remove a bus from the worker thread and clean up its port listeners:

```typescript
thread.unbindWorkerBus({ key: 'tasks' });
```

This calls `port.removeAllListeners()` on the bus's port before deleting it from the registry.

### Subclassing AbstractWorkerHelper

For full control, extend `AbstractWorkerHelper` and implement all lifecycle methods directly:

```typescript
import { AbstractWorkerHelper } from '@venizia/ignis-helpers';

class CustomWorker extends AbstractWorkerHelper<MyMessage> {
  onOnline() {
    // Custom online handling
  }

  onExit(opts: { code: string | number }) {
    // Custom exit handling, e.g., restart logic
  }

  onError(opts: { error: Error }) {
    // Custom error handling
  }

  onMessage(opts: { message: MyMessage }) {
    // Custom message processing
  }

  onMessageError(opts: { error: Error }) {
    // Custom message error handling
  }
}
```

## API Summary

### WorkerPoolHelper

| Method | Signature | Description |
|--------|-----------|-------------|
| `getInstance` | `static getInstance(): WorkerPoolHelper` | Returns the singleton pool instance (creates one if needed) |
| `register` | `register<MessageType>(opts: { key: string; worker: IWorker<MessageType> }): void` | Adds a worker to the pool. Skipped if key exists or pool is at CPU limit |
| `unregister` | `async unregister(opts: { key: string }): Promise<void>` | Terminates the worker and removes it from the pool |
| `get` | `get<MessageType>(opts: { key: string }): IWorker<MessageType> \| undefined` | Retrieves a registered worker by key |
| `has` | `has(opts: { key: string }): boolean` | Checks if a worker is registered under the given key |
| `size` | `size(): number` | Returns the number of currently registered workers |

### BaseWorkerHelper

| Method | Signature | Description |
|--------|-----------|-------------|
| `onOnline` | `onOnline(): ValueOrPromise<void>` | Called when the worker thread comes online |
| `onExit` | `onExit(opts: { code: string \| number }): ValueOrPromise<void>` | Called when the worker exits |
| `onError` | `onError(opts: { error: Error }): ValueOrPromise<void>` | Called on worker errors |
| `onMessage` | `onMessage(opts: { message: MessageType }): ValueOrPromise<void>` | Called when a message is received from the worker |
| `onMessageError` | `onMessageError(opts: { error: Error }): ValueOrPromise<void>` | Called on message deserialization errors |
| `binding` | `binding(): void` | Binds all event handlers to the internal `Worker` instance. Called automatically by the constructor |

### BaseWorkerThreadHelper

| Method | Signature | Description |
|--------|-----------|-------------|
| `bindWorkerBus` | `bindWorkerBus<IC, IP>(opts: { key: string; bus: IWorkerBus<IC, IP> }): void` | Registers a bus under the given key. Skipped with warning if key already exists |
| `unbindWorkerBus` | `unbindWorkerBus(opts: { key: string }): void` | Removes a bus and calls `port.removeAllListeners()`. Warns if key not found |
| `getWorkerBus` | `getWorkerBus<IC, IP>(opts: { key: string }): IWorkerBus<IC, IP>` | Returns the bus for the given key. Throws if not found |

### BaseWorkerBusHelper

| Method | Signature | Description |
|--------|-----------|-------------|
| `postMessage` | `postMessage(opts: { message: IP; transferList: readonly Transferable[] \| undefined }): ValueOrPromise<void>` | Sends a message through the port, optionally with transferable objects |
| `onBeforePostMessage` | `onBeforePostMessage?(opts: { message: IP }): ValueOrPromise<void>` | Optional hook called before posting a message |
| `onAfterPostMessage` | `onAfterPostMessage?(opts: { message: IP }): ValueOrPromise<void>` | Optional hook called after posting a message |

## Troubleshooting

### "[BaseWorker] Cannot start worker in MAIN_THREAD"

**Cause:** `BaseWorkerThreadHelper` was instantiated on the main thread. This class is designed to run only inside a worker thread (where `isMainThread` from `node:worker_threads` is `false`).

**Fix:** Only create `BaseWorkerThreadHelper` instances inside worker scripts that are spawned via `new Worker(path)`:

```typescript
// worker-script.js (spawned by the main thread)
import { BaseWorkerThreadHelper } from '@venizia/ignis-helpers';

const thread = new BaseWorkerThreadHelper({ scope: 'MyWorker' }); // OK here
```

### "[binding] Invalid worker instance to bind event handlers"

**Cause:** `BaseWorkerHelper.binding()` was called but the internal `Worker` instance is null or undefined. This can occur if the worker script path is invalid and the `Worker` constructor fails.

**Fix:** Ensure the `path` passed to `BaseWorkerHelper` points to a valid, existing JavaScript file:

```typescript
const worker = new BaseWorkerHelper({
  identifier: 'my-worker',
  path: './workers/my-worker.js', // Must exist and be a valid worker script
  options: {},
});
```

### "[register] Invalid worker registry instance"

**Cause:** `WorkerPoolHelper.register()` was called but the internal registry `Map` is null or undefined. This is a defensive check that should not occur under normal usage.

**Fix:** Ensure you are using either `WorkerPoolHelper.getInstance()` or `new WorkerPoolHelper()` which both initialize the registry correctly.

### "[getWorkerBus] Not found worker bus | key: {key}"

**Cause:** `BaseWorkerThreadHelper.getWorkerBus()` was called with a key that has not been registered via `bindWorkerBus()`.

**Fix:** Verify the bus was bound before retrieving it:

```typescript
thread.bindWorkerBus({ key: 'my-bus', bus: myBus });

// Now safe to retrieve
const bus = thread.getWorkerBus({ key: 'my-bus' });
```

### "Failed to post message to main | Invalid parentPort!"

**Cause:** `BaseWorkerBusHelper.postMessage()` was called but the `port` property is null or undefined. This typically means the bus was constructed with an invalid `MessagePort`.

**Fix:** Ensure a valid `MessagePort` (e.g., `parentPort` from `node:worker_threads` or a port from `new MessageChannel()`) is passed to the constructor:

```typescript
import { parentPort } from 'node:worker_threads';

const bus = new BaseWorkerBusHelper({
  scope: 'MyBus',
  port: parentPort!, // Must be a valid MessagePort
  busHandler: handler,
});
```

### Worker pool silently skips registration

**Cause:** The pool has reached the CPU core limit and `ignoreMaxWarning` is `false` (the default for `getInstance()`).

**Fix:** Either unregister unused workers first, or create a pool with `ignoreMaxWarning: true`:

```typescript
// Option 1: Free up pool slots
await pool.unregister({ key: 'old-worker' });
pool.register({ key: 'new-worker', worker: newWorker });

// Option 2: Allow exceeding the limit
const pool = new WorkerPoolHelper({ ignoreMaxWarning: true });
```

## See Also

- **Related Concepts:**
  - [Services](/guides/core-concepts/services) -- Running background workers within services
  - [Application](/guides/core-concepts/application/) -- Spawning workers during application lifecycle

- **Other Helpers:**
  - [Helpers Index](../index) -- All available helpers
  - [Queue Helper](../queue/) -- Message queue processing as an alternative to worker threads

- **External Resources:**
  - [Node.js Worker Threads](https://nodejs.org/api/worker_threads.html) -- Official `worker_threads` documentation
  - [MessagePort API](https://nodejs.org/api/worker_threads.html#class-messageport) -- Underlying port communication
  - [Transferable Objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects) -- Zero-copy data transfer
