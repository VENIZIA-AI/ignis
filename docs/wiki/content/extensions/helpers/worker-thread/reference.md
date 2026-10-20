---
title: Worker Thread - Full Reference
description: Complete reference for WorkerPoolHelper, BaseWorkerHelper, BaseWorkerThreadHelper, BaseWorkerBusHelper, and every constructor option and error message
difficulty: intermediate
---

# Worker Thread - Full Reference

Exhaustive reference for the worker-thread classes, every constructor option, event-handler default, and troubleshooting case. For a readable introduction and the common tasks, start with the [Worker Thread overview](/extensions/helpers/worker-thread/).

**Files:**

- [`packages/helpers/src/modules/worker-thread/worker/abstract.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/worker-thread/worker/abstract.ts) - `AbstractWorkerHelper`
- [`packages/helpers/src/modules/worker-thread/worker/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/worker-thread/worker/base.ts) - `BaseWorkerHelper`
- [`packages/helpers/src/modules/worker-thread/thread/abstract.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/worker-thread/thread/abstract.ts) - `AbstractWorkerThreadHelper`
- [`packages/helpers/src/modules/worker-thread/thread/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/worker-thread/thread/base.ts) - `BaseWorkerThreadHelper`
- [`packages/helpers/src/modules/worker-thread/bus/abstract.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/worker-thread/bus/abstract.ts) - `AbstractWorkerBusHelper`
- [`packages/helpers/src/modules/worker-thread/bus/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/worker-thread/bus/base.ts) - `BaseWorkerBusHelper`
- [`packages/helpers/src/modules/worker-thread/bus/handler/abstract.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/worker-thread/bus/handler/abstract.ts) - `AbstractWorkerMessageBusHandlerHelper`
- [`packages/helpers/src/modules/worker-thread/bus/handler/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/worker-thread/bus/handler/base.ts) - `BaseWorkerMessageBusHandlerHelper`
- [`packages/helpers/src/modules/worker-thread/worker-pool.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/worker-thread/worker-pool.ts) - `WorkerPoolHelper`
- [`packages/helpers/src/modules/worker-thread/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/worker-thread/common/types.ts) - `IWorker`, `IWorkerThread`, `IWorkerBus`, `IWorkerMessageBusHandler`
- [`packages/helpers/src/modules/worker-thread/index.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/worker-thread/index.ts) - barrel

## Quick Reference

| Class | Extends | Use case |
|-------|---------|----------|
| [`WorkerPoolHelper`](#workerpoolhelper) | `BaseHelper` | Singleton registry that tracks and limits active worker instances |
| [`BaseWorkerHelper<MessageType>`](#baseworkerhelper-main-thread-worker-wrapper) | `AbstractWorkerHelper<MessageType>` | Wraps a `Worker` with event lifecycle hooks - online, exit, error, message |
| [`BaseWorkerThreadHelper`](#baseworkerthreadhelper-inside-a-worker-thread) | `AbstractWorkerThreadHelper` | Runs inside a worker thread. Manages named `WorkerBus` channels |
| [`BaseWorkerBusHelper<IConsumePayload, IPublishPayload>`](#baseworkerbushelper-messageport-communication) | `AbstractWorkerBusHelper<IConsumePayload, IPublishPayload>` | Bidirectional `MessagePort` communication with pre/post hooks |
| [`BaseWorkerMessageBusHandlerHelper<IConsumePayload>`](#baseworkermessagebushandlerhelper) | `AbstractWorkerMessageBusHandlerHelper<IConsumePayload>` | Defines event handlers for a worker bus - message, close, error, exit |

| Item | Value |
|------|-------|
| **Package** | `@venizia/ignis-helpers` |
| **Peer Dependency** | None (uses built-in `node:worker_threads`) |
| **Runtimes** | Node.js (uses `node:worker_threads` and `node:os`) |

### Import paths

```typescript
import {
  WorkerPoolHelper,
  BaseWorkerHelper,
  BaseWorkerThreadHelper,
  BaseWorkerBusHelper,
  BaseWorkerMessageBusHandlerHelper,
  AbstractWorkerHelper,
  AbstractWorkerThreadHelper,
  AbstractWorkerBusHelper,
  AbstractWorkerMessageBusHandlerHelper,
} from '@venizia/ignis-helpers';

import type {
  IWorker,
  IWorkerThread,
  IWorkerBus,
  IWorkerMessageBusHandler,
} from '@venizia/ignis-helpers';
```

## WorkerPoolHelper

`Source ->` [`worker-pool.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/worker-thread/worker-pool.ts)

Singleton registry for active workers. Limits the pool size to the number of CPU cores by default.

```typescript
import { WorkerPoolHelper } from '@venizia/ignis-helpers';

// Get the singleton instance
const pool = WorkerPoolHelper.getInstance();

// Or construct a custom instance directly
const customPool = new WorkerPoolHelper({ ignoreMaxWarning: true });
```

> [!NOTE]
> `WorkerPoolHelper.getInstance()` always creates the singleton with `ignoreMaxWarning: false`. To override this, construct a new instance manually. The singleton and a manually-constructed instance are independent registries.

### Constructor options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ignoreMaxWarning` | `boolean` | `false` | When `true`, allows registering workers beyond the CPU core count. When `false`, registration is skipped once the pool reaches the CPU core limit. |

### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `getInstance` | `static getInstance(): WorkerPoolHelper` | Returns the singleton pool instance (creates one with `ignoreMaxWarning: false` if needed) |
| `register` | `register<MessageType>(opts: { key: string; worker: IWorker<MessageType> }): boolean` | Adds a worker to the pool. Returns `false` and logs, without registering, if the key exists or the pool is full |
| `unregister` | `async unregister(opts: { key: string }): Promise<void>` | Terminates the worker (`worker.terminate()`) and removes it from the pool. The registry entry is deleted even if termination throws |
| `get` | `get<MessageType>(opts: { key: string }): IWorker<MessageType> \| undefined` | Retrieves a registered worker by key |
| `has` | `has(opts: { key: string }): boolean` | Checks if a worker is registered under the given key |
| `size` | `size(): number` | Returns the number of currently registered workers |

> [!WARNING]
> When the pool reaches the CPU core limit and `ignoreMaxWarning` is `false`, further `register()` calls return `false` and log a warning. No error is thrown.

## BaseWorkerHelper (main thread worker wrapper)

`Source ->` [`worker/abstract.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/worker-thread/worker/abstract.ts), [`worker/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/worker-thread/worker/base.ts)

Creates a `Worker` from a file path and automatically binds all lifecycle events.

```typescript
import { BaseWorkerHelper } from '@venizia/ignis-helpers';

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

### Constructor options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `identifier` | `string` | - | A unique name for this worker instance, used as the `BaseHelper` identifier and in log output. Required. |
| `path` | `string \| URL` | - | Path to the worker script file, passed directly to `new Worker()`. Required. |
| `options` | `WorkerOptions` (Node.js) | - | Passed directly to `new Worker()`. Required. Supports `workerData`, `transferList`, `env`, etc. |
| `scope` | `string` | `'BaseWorkerHelper'` | Accepted but currently ignored - the constructor always sets the logger scope to `BaseWorkerHelper.name`, not `opts.scope`. |
| `eventHandlers` | `Partial<Pick<IWorker<MessageType>, 'onOnline' \| 'onExit' \| 'onError' \| 'onMessage' \| 'onMessageError'>>` | `undefined` | Optional overrides for lifecycle event callbacks. Any handler not provided falls back to default logging behavior. |

### Event handler overrides

| Handler | Signature | Default behavior |
|---------|-----------|-------------------|
| `onOnline` | `() => ValueOrPromise<void>` | Logs `"Worker ONLINE"` at info level |
| `onExit` | `(opts: { code: string \| number }) => ValueOrPromise<void>` | Logs `"Worker EXIT | Code: %s"` at warn level |
| `onError` | `(opts: { error: Error }) => ValueOrPromise<void>` | Logs `"Worker ERROR | Error: %s"` at error level |
| `onMessage` | `(opts: { message: MessageType }) => ValueOrPromise<void>` | Logs `"Worker MESSAGE | message: %j"` at error level |
| `onMessageError` | `(opts: { error: Error }) => ValueOrPromise<void>` | Logs `"Worker MESSAGE_ERROR | Error: %s"` at error level |

### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `binding` | `binding(): void` | Binds all five event handlers to the internal `Worker` instance. Called automatically by the constructor. Throws `[binding] Invalid worker instance to bind event handlers` if `this.worker` is falsy |

Every handler runs through `invokeHook`, which wraps the call in a `try/catch`. A synchronous throw inside a user handler is caught and logged as `"Hook execution FAILED | Error: %s"`, rather than crashing the process. Async rejections are settled the same way, via `voidExecution`.

### AbstractWorkerHelper (subclassing)

For full control, extend `AbstractWorkerHelper` and implement all five lifecycle methods directly instead of passing `eventHandlers`:

```typescript
import { AbstractWorkerHelper } from '@venizia/ignis-helpers';

class CustomWorker extends AbstractWorkerHelper<MyMessage> {
  onOnline() {
    // Custom online handling
  }

  onExit(opts: { code: string | number }) {
    // Custom exit handling - for example, restart logic
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

`AbstractWorkerHelper<MessageType>` declares `worker: Worker`, `options: WorkerOptions`, and the five abstract lifecycle methods above. It does not implement `binding()` itself.

## BaseWorkerThreadHelper (inside a worker thread)

`Source ->` [`thread/abstract.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/worker-thread/thread/abstract.ts), [`thread/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/worker-thread/thread/base.ts)

Used inside a worker script to manage named communication buses. Must be instantiated from within a worker thread. Constructing it on the main thread throws.

```typescript
// Inside worker-script.js
import { BaseWorkerThreadHelper } from '@venizia/ignis-helpers';

const thread = new BaseWorkerThreadHelper({ scope: 'DataProcessor' });
```

### Constructor options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `scope` | `string` | - | Logger scope and `BaseHelper` identifier for this worker thread. Required. |

The constructor checks `isMainThread` (from `node:worker_threads`) and throws `[BaseWorker] Cannot start worker in MAIN_THREAD` if `true`.

### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `bindWorkerBus` | `bindWorkerBus<IC, IP>(opts: { key: string; bus: IWorkerBus<IC, IP> }): void` | Registers a bus under the given key. Logs a warning and returns without overwriting if the key already exists |
| `unbindWorkerBus` | `unbindWorkerBus(opts: { key: string }): void` | Calls `port.removeAllListeners()` on the bus's port, then deletes it from the registry. Logs a warning if the key is not found |
| `getWorkerBus` | `getWorkerBus<IC, IP>(opts: { key: string }): IWorkerBus<IC, IP>` | Returns the bus for the given key. Throws `[getWorkerBus] Not found worker bus | key: {key}` if not found |

`unbindWorkerBus` is defined only on `BaseWorkerThreadHelper`, not on the `AbstractWorkerThreadHelper` interface. `AbstractWorkerThreadHelper` declares `buses`, `bindWorkerBus`, and `getWorkerBus` as abstract members only.

## BaseWorkerMessageBusHandlerHelper

`Source ->` [`bus/handler/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/worker-thread/bus/handler/base.ts)

Defines the event callbacks for a worker bus.

```typescript
const handler = new BaseWorkerMessageBusHandlerHelper<MyPayload>({
  scope: 'ProcessorHandler',
  onMessage: opts => console.log('Processing:', opts.message),
  onError: opts => console.error('Bus error:', opts.error),
});
```

### Constructor options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `scope` | `string` | - | Logger scope and identifier. Required. |
| `onMessage` | `(opts: { message: IConsumePayload }) => ValueOrPromise<void>` | - | Handler called when a message is received on the port. Required. |
| `onClose` | `() => ValueOrPromise<void>` | No-op `() => {}` | Handler called when the port emits `close`. |
| `onError` | `(opts: { error: Error }) => ValueOrPromise<void>` | Logs `"worker error: %s"` at error level | Handler called on port `error` and `messageerror` events. |
| `onExit` | `(opts: { exitCode: number \| string }) => ValueOrPromise<void>` | Logs `"worker EXITED | exitCode: %s"` at warn level | Handler called when the port emits `exit`. |

## BaseWorkerBusHelper (MessagePort communication)

`Source ->` [`bus/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/worker-thread/bus/base.ts)

Wraps a `MessagePort` to provide structured bidirectional messaging with lifecycle event handlers.

```typescript
import { BaseWorkerBusHelper, BaseWorkerMessageBusHandlerHelper } from '@venizia/ignis-helpers';
import { parentPort } from 'node:worker_threads';

const handler = new BaseWorkerMessageBusHandlerHelper<IncomingMessage>({
  scope: 'MyBusHandler',
  onMessage: opts => console.log('Received:', opts.message),
});

const bus = new BaseWorkerBusHelper<IncomingMessage, OutgoingMessage>({
  scope: 'MyBus',
  port: parentPort!,
  busHandler: handler,
});
```

### Constructor options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `scope` | `string` | - | Logger scope and identifier. Required. |
| `port` | `MessagePort` | - | The `MessagePort` to bind for communication. Required. |
| `busHandler` | `IWorkerMessageBusHandler<IConsumePayload>` | - | Handler that receives incoming messages and lifecycle events. Required. |

The constructor binds `message`, `error`, `messageerror`, `exit`, and `close` listeners on `port`. Each routes to the handler's matching callback. `error` and `messageerror` both route to `handler.onError`.

### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `postMessage` | `postMessage(opts: { message: IPublishPayload; transferList: readonly Transferable[] \| undefined }): ValueOrPromise<void>` | Sends a message through the port. Calls `port.postMessage(message, [...transferList])` if `transferList` is set, otherwise `port.postMessage(message)`. Logs and returns, without throwing, if `port` is falsy |

### Pre/post message hooks

`onBeforePostMessage` and `onAfterPostMessage` are optional properties declared on the class. The constructor leaves them `undefined`. Assign them yourself, after construction:

```typescript
bus.onBeforePostMessage = opts => {
  console.log('About to send:', opts.message);
};

bus.onAfterPostMessage = opts => {
  console.log('Sent:', opts.message);
};
```

`postMessage` invokes `onBeforePostMessage` before the port write, if set. It invokes `onAfterPostMessage` after the write, if set. Both hooks run through the same `try/catch`-wrapped `invokeHook` used for the port event listeners.

### Sending transferable objects

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

## Types

`Source ->` [`common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/worker-thread/common/types.ts)

```typescript
interface IWorker<MessageType> {
  worker: Worker;
  options: WorkerOptions;

  onOnline(): ValueOrPromise<void>;
  onExit(opts: { code: string | number }): ValueOrPromise<void>;
  onError(opts: { error: Error }): ValueOrPromise<void>;
  onMessage(opts: { message: MessageType }): ValueOrPromise<void>;
  onMessageError(opts: { error: Error }): ValueOrPromise<void>;
}

interface IWorkerThread {
  buses: { [workerKey: string | symbol]: IWorkerBus<AnyType, AnyType> };
}

interface IWorkerMessageBusHandler<IConsumePayload> {
  onMessage: (opts: { message: IConsumePayload }) => ValueOrPromise<void>;
  onClose: () => ValueOrPromise<void>;
  onError: (opts: { error: Error }) => ValueOrPromise<void>;
  onExit: (opts: { exitCode: number | string }) => ValueOrPromise<void>;
}

interface IWorkerBus<IConsumePayload, IPublishPayload> {
  port: MessagePort;
  handler: IWorkerMessageBusHandler<IConsumePayload>;

  onBeforePostMessage?(opts: { message: IPublishPayload }): ValueOrPromise<void>;
  onAfterPostMessage?(opts: { message: IPublishPayload }): ValueOrPromise<void>;
  postMessage(opts: {
    message: IPublishPayload;
    transferList: readonly Transferable[] | undefined;
  }): ValueOrPromise<void>;
}
```

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

**Cause:** `BaseWorkerHelper.binding()` was called but the internal `Worker` instance is falsy. This can occur if the worker script path is invalid and the `Worker` constructor fails.

**Fix:** Ensure the `path` passed to `BaseWorkerHelper` points to a valid, existing JavaScript file:

```typescript
const worker = new BaseWorkerHelper({
  identifier: 'my-worker',
  path: './workers/my-worker.js', // Must exist and be a valid worker script
  options: {},
});
```

### "[register] Invalid worker registry instance | please init registry before register new worker!"

**Cause:** `WorkerPoolHelper.register()` was called but the internal registry `Map` is falsy. This is a defensive check that should not occur under normal usage.

**Fix:** Ensure you are using either `WorkerPoolHelper.getInstance()` or `new WorkerPoolHelper()`, both of which initialize the registry in the constructor.

### "[getWorkerBus] Not found worker bus | key: {key}"

**Cause:** `BaseWorkerThreadHelper.getWorkerBus()` was called with a key that has not been registered via `bindWorkerBus()`.

**Fix:** Verify the bus was bound before retrieving it:

```typescript
thread.bindWorkerBus({ key: 'my-bus', bus: myBus });

// Now safe to retrieve
const bus = thread.getWorkerBus({ key: 'my-bus' });
```

### "Failed to post message to main | Invalid parentPort!"

**Cause:** `BaseWorkerBusHelper.postMessage()` was called but the `port` property is falsy. This typically means the bus was constructed with an invalid `MessagePort`. This is logged at error level, not thrown. The message is silently dropped.

**Fix:** Ensure a valid `MessagePort` is passed to the constructor - for example `parentPort` from `node:worker_threads`, or a port from `new MessageChannel()`:

```typescript
import { parentPort } from 'node:worker_threads';

const bus = new BaseWorkerBusHelper({
  scope: 'MyBus',
  port: parentPort!, // Must be a valid MessagePort
  busHandler: handler,
});
```

### Worker pool silently skips registration

**Cause:** The pool has reached the CPU core limit and `ignoreMaxWarning` is `false` (the default for `getInstance()`). `register()` returns `false` and logs a warning instead of throwing.

**Fix:** Either free up pool slots first, or create a pool with `ignoreMaxWarning: true`:

```typescript
// Option 1: Free up pool slots
await pool.unregister({ key: 'old-worker' });
pool.register({ key: 'new-worker', worker: newWorker });

// Option 2: Allow exceeding the limit
const pool = new WorkerPoolHelper({ ignoreMaxWarning: true });
```

## See also

- [Worker Thread overview](/extensions/helpers/worker-thread/) - introduction and the most common tasks
- [Queue Helper](/extensions/helpers/queue/) - message-queue processing as an alternative to worker threads
- [Node.js Worker Threads](https://nodejs.org/api/worker_threads.html) - official `worker_threads` documentation
- [MessagePort API](https://nodejs.org/api/worker_threads.html#class-messageport) - underlying port communication
- [Transferable Objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects) - zero-copy data transfer
