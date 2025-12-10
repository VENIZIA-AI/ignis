# Worker Thread Helper

Manage Node.js `worker_threads` for concurrent CPU-bound task execution.

## Quick Reference

| Helper | Purpose |
|--------|---------|
| **WorkerPoolHelper** | Singleton managing pool of workers (matches CPU cores) |
| **BaseWorkerHelper** | Create and manage single worker thread lifecycle |
| **BaseWorkerBusHelper** | Two-way communication via `MessagePort` |

### Use Cases

- CPU-intensive calculations
- Large data processing
- Parallel computations
- Video/image processing

### Worker Communication

| Pattern | Complexity | Use When |
|---------|------------|----------|
| **Simple (parentPort)** | Low | One-way or basic messaging |
| **WorkerBus (MessageChannel)** | High | Complex two-way communication |

### WorkerPoolHelper Methods

| Method | Purpose |
|--------|---------|
| `getInstance()` | Get singleton instance |
| `register({ key, worker })` | Add worker to pool |
| `unregister({ key })` | Remove and terminate worker |

## `WorkerPoolHelper`

The `WorkerPoolHelper` is a singleton that manages the creation, registration, and termination of worker threads.

### Usage

```typescript
import { WorkerPoolHelper, BaseWorkerHelper } from '@venizia/ignis';

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

// Later, to terminate the worker
workerPool.unregister({ key: 'my-worker-1' });
```

## Creating a Worker

You can create a worker from the main thread that executes a separate script file.

### Main Thread (`main.ts`)

```typescript
import { BaseWorkerHelper } from '@venizia/ignis';
import path from 'node:path';

const worker = new BaseWorkerHelper({
  identifier: 'my-worker',
  path: path.resolve(__dirname, './worker.ts'), // Path to the worker script
  options: {
    workerData: { message: 'Hello from main thread!' },
  },
  eventHandlers: {
    onMessage: ({ message }) => {
      console.log('Received message from worker:', message);
    },
    onError: ({ error }) => {
      console.error('Worker error:', error);
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

## `WorkerBus` for Two-Way Communication

For more complex scenarios requiring two-way communication, you can use the `WorkerBus` helpers.

### Main Thread (`main.ts`)

```typescript
// ... (in main thread)
import { MessageChannel } from 'node:worker_threads';
import { BaseWorkerBusHelper, ... } from '@venizia/ignis';

const { port1, port2 } = new MessageChannel();

const worker = new BaseWorkerHelper({
  // ...
  options: {
    workerData: { port: port2 }, // Pass one port to the worker
    transferList: [port2],      // Transfer ownership of the port
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

mainThreadBus.postMessage({ message: { command: 'start-work' } });
```

### Worker Thread (`worker.ts`)

```typescript
// ... (in worker thread)
import { workerData } from 'node:worker_threads';
import { BaseWorkerBusHelper, ... } from '@venizia/ignis';

const { port } = workerData;

const workerBus = new BaseWorkerBusHelper({
  scope: 'worker-bus',
  port: port,
  busHandler: new BaseWorkerMessageBusHandlerHelper({
    scope: 'worker-bus-handler',
    onMessage: ({ message }) => {
      console.log('Worker received:', message);
      if (message.command === 'start-work') {
        workerBus.postMessage({ message: { status: 'work-done' } });
      }
    },
  }),
});
```
