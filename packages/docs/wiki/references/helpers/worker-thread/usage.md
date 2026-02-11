# Usage

## Creating Workers

You can create a worker from the main thread that executes a separate script file.

### Main Thread (`main.ts`)

```typescript
import { BaseWorkerHelper } from '@venizia/ignis-helpers';
import path from 'node:path';

const worker = new BaseWorkerHelper({
  identifier: 'my-worker',
  path: path.resolve(__dirname, './worker.ts'),
  options: {
    workerData: { message: 'Hello from main thread!' },
  },
  eventHandlers: {
    onOnline: () => {
      console.log('Worker is online');
    },
    onMessage: ({ message }) => {
      console.log('Received message from worker:', message);
    },
    onError: ({ error }) => {
      console.error('Worker error:', error);
    },
    onExit: ({ code }) => {
      console.log('Worker exited with code:', code);
    },
    onMessageError: ({ error }) => {
      console.error('Worker message serialization error:', error);
    },
  },
});
```

### Worker Thread (`worker.ts`)

Inside the worker script, you can perform CPU-intensive tasks and communicate back to the main thread.

```typescript
import { parentPort, workerData } from 'node:worker_threads';

console.log('Worker started with data:', workerData);

// Perform a CPU-intensive task
const result = performHeavyCalculation();

// Send the result back to the main thread
parentPort?.postMessage({ result });
```

## Communication

### Simple (parentPort)

For basic one-way or request-reply patterns, use `parentPort` directly inside the worker script and the `onMessage` event handler on the main thread side. See the Creating Workers section above for an example.

### WorkerBus (MessageChannel)

For more complex scenarios requiring two-way communication, use `BaseWorkerBusHelper` together with `BaseWorkerMessageBusHandlerHelper` and a `MessageChannel`.

#### Main Thread (`main.ts`)

```typescript
import { MessageChannel } from 'node:worker_threads';
import {
  BaseWorkerHelper,
  BaseWorkerBusHelper,
  BaseWorkerMessageBusHandlerHelper,
} from '@venizia/ignis-helpers';

const { port1, port2 } = new MessageChannel();

const worker = new BaseWorkerHelper({
  identifier: 'bus-worker',
  path: './worker.ts',
  options: {
    workerData: { port: port2 },
    transferList: [port2],
  },
});

const mainThreadBus = new BaseWorkerBusHelper({
  scope: 'main-bus',
  port: port1,
  busHandler: new BaseWorkerMessageBusHandlerHelper({
    scope: 'main-bus-handler',
    onMessage: ({ message }) => {
      console.log('Main thread received:', message);
    },
  }),
});

mainThreadBus.postMessage({
  message: { command: 'start-work' },
  transferList: undefined,
});
```

#### Worker Thread (`worker.ts`)

```typescript
import { workerData } from 'node:worker_threads';
import {
  BaseWorkerBusHelper,
  BaseWorkerMessageBusHandlerHelper,
} from '@venizia/ignis-helpers';

const { port } = workerData;

const workerBus = new BaseWorkerBusHelper({
  scope: 'worker-bus',
  port: port,
  busHandler: new BaseWorkerMessageBusHandlerHelper({
    scope: 'worker-bus-handler',
    onMessage: ({ message }) => {
      console.log('Worker received:', message);
      if (message.command === 'start-work') {
        workerBus.postMessage({
          message: { status: 'work-done' },
          transferList: undefined,
        });
      }
    },
  }),
});
```

::: details BaseWorkerBusHelper Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `postMessage` | `({ message, transferList }) => void` | Send a message through the port. Pass `transferList: undefined` when no transferables are needed |
| `onBeforePostMessage` | `({ message }) => void` | Optional hook called before sending |
| `onAfterPostMessage` | `({ message }) => void` | Optional hook called after sending |

:::

## Worker Pools

Use `WorkerPoolHelper` to manage multiple workers with a capped pool size.

```typescript
import { WorkerPoolHelper, BaseWorkerHelper } from '@venizia/ignis-helpers';

const workerPool = WorkerPoolHelper.getInstance();

// Create a new worker
const myWorker = new BaseWorkerHelper({
  identifier: 'my-cpu-intensive-task',
  path: './path/to/my-worker.js',
  options: {
    workerData: { some: 'data' },
  },
});

// Register the worker with the pool
workerPool.register({ key: 'my-worker-1', worker: myWorker });

// Check pool state
workerPool.has({ key: 'my-worker-1' }); // true
workerPool.size();                       // 1

// Retrieve a registered worker
const worker = workerPool.get({ key: 'my-worker-1' });

// Later, to terminate and remove the worker
await workerPool.unregister({ key: 'my-worker-1' });
```

## Managing Worker Buses

Use `BaseWorkerThreadHelper` inside a worker script to manage multiple `WorkerBus` instances.

```typescript
import { workerData } from 'node:worker_threads';
import { BaseWorkerThreadHelper, BaseWorkerBusHelper, BaseWorkerMessageBusHandlerHelper } from '@venizia/ignis-helpers';

const thread = new BaseWorkerThreadHelper({ scope: 'my-worker-thread' });

const bus = new BaseWorkerBusHelper({
  scope: 'task-bus',
  port: workerData.port,
  busHandler: new BaseWorkerMessageBusHandlerHelper({
    scope: 'task-bus-handler',
    onMessage: ({ message }) => {
      console.log('Received:', message);
    },
  }),
});

// Register the bus
thread.bindWorkerBus({ key: 'task', bus });

// Retrieve later
const taskBus = thread.getWorkerBus({ key: 'task' });

// Cleanup
thread.unbindWorkerBus({ key: 'task' });
```

::: details BaseWorkerThreadHelper Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `bindWorkerBus` | `({ key: string, bus: IWorkerBus }) => void` | Register a bus. Warns and skips if the key already exists |
| `unbindWorkerBus` | `({ key: string }) => void` | Remove a bus and call `port.removeAllListeners()`. Warns if key not found |
| `getWorkerBus` | `({ key: string }) => IWorkerBus` | Retrieve a bus by key. Throws if not found |

:::

::: details Interfaces (types.ts)

```typescript
// Core worker interface
interface IWorker<MessageType> {
  worker: Worker;
  options: WorkerOptions;
  onOnline(): ValueOrPromise<void>;
  onExit(opts: { code: string | number }): ValueOrPromise<void>;
  onError(opts: { error: Error }): ValueOrPromise<void>;
  onMessage(opts: { message: MessageType }): ValueOrPromise<void>;
  onMessageError(opts: { error: Error }): ValueOrPromise<void>;
}

// Worker thread with bus management
interface IWorkerThread {
  buses: { [workerKey: string | symbol]: IWorkerBus<any, any> };
}

// Message bus handler
interface IWorkerMessageBusHandler<IConsumePayload> {
  onMessage: (opts: { message: IConsumePayload }) => ValueOrPromise<void>;
  onClose: () => ValueOrPromise<void>;
  onError: (opts: { error: Error }) => ValueOrPromise<void>;
  onExit: (opts: { exitCode: number | string }) => ValueOrPromise<void>;
}

// Worker bus for two-way communication
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

:::
