# Troubleshooting

### Worker pool registration silently skipped

**Symptom:** `register()` returns without error but the worker is not in the pool.

**Cause:** Either the pool has already reached `os.cpus().length` workers, or a worker with the same key is already registered.

**Fix:** Check pool capacity with `size()` and key existence with `has({ key })` before registering. If you genuinely need more workers than CPU cores, instantiate `WorkerPoolHelper` directly with `{ ignoreMaxWarning: true }` instead of using the singleton.

```typescript
// Check before registering
if (!workerPool.has({ key: 'my-worker' })) {
  workerPool.register({ key: 'my-worker', worker: myWorker });
}
```

### "Cannot start worker in MAIN_THREAD" error

**Symptom:** `BaseWorkerThreadHelper` throws immediately on construction.

**Cause:** `BaseWorkerThreadHelper` is designed to run exclusively inside a worker thread. It checks `isMainThread` from `node:worker_threads` and throws if `true`.

**Fix:** Only instantiate `BaseWorkerThreadHelper` in files that are loaded as worker scripts (passed as the `path` option to `BaseWorkerHelper`). Use `BaseWorkerHelper` and `WorkerPoolHelper` on the main thread side.

### postMessage fails with "Invalid parentPort"

**Symptom:** `BaseWorkerBusHelper.postMessage()` logs an error about an invalid parentPort and the message is never sent.

**Cause:** The `port` passed to `BaseWorkerBusHelper` was `undefined` or `null`, or the port was already closed.

**Fix:** Ensure the `MessagePort` is transferred correctly via `transferList` and that the port has not been closed before calling `postMessage`.

```typescript
// Main thread: transfer port2 to the worker
const worker = new BaseWorkerHelper({
  identifier: 'my-worker',
  path: './worker.ts',
  options: {
    workerData: { port: port2 },
    transferList: [port2],  // Required: transfer ownership
  },
});
```
