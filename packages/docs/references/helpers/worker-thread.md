# Worker Thread Helper

The Worker Thread helper provides a comprehensive framework for managing Node.js `worker_threads`, facilitating concurrent execution of CPU-bound tasks.

## Overview

This helper provides abstractions for:
-   **`WorkerPoolHelper`**: A singleton for managing a pool of worker threads, ideally matching the number of available CPU cores.
-   **`BaseWorkerHelper`**: A class for creating and managing the lifecycle of a single worker thread from the main thread.
-   **`BaseWorkerBusHelper`**: A class for establishing a communication channel (`MessagePort`) between the main thread and a worker thread.

## `WorkerPoolHelper`

The `WorkerPoolHelper` is a singleton that manages the creation, registration, and termination of worker threads.

### Usage

```typescript
import { WorkerPoolHelper, BaseWorkerHelper } from '@vez/ignis';

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
import { BaseWorkerHelper } from '@vez/ignis';
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
import { BaseWorkerBusHelper, ... } from '@vez/ignis';

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
import { BaseWorkerBusHelper, ... } from '@vez/ignis';

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
