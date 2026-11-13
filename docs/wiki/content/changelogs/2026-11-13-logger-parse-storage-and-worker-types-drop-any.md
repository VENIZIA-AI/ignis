---
title: Logger arguments, parse inputs, storage and worker-thread types are unknown or typed, not any
description: "ILogger and its classes take unknown arguments, ParseUtility takes unknown inputs and answers a record, MemoryStorageHelper defaults to a record, and the worker-thread buses are typed never, so nothing is trusted as any."
packages: ['@venizia/ignis-helpers']
migration:
  - id: logger-arguments-unknown
    symbols: [ILogger, AbstractLogger, BaseLogger, ConsoleLogger, HfLogger, LoggerFactory]
    upgrade:
      before: |
        class AuditLogger extends BaseLogger {
          info(message: string, ...args: any[]) {
            this.write({ level: 'info', message, args });
          }
        }
      after: |
        // the arguments are unknown[]: an override that narrows them no longer fits
        class AuditLogger extends BaseLogger {
          info(message: string, ...args: unknown[]) {
            this.write({ level: 'info', message, args });
          }
        }
    downgrade:
      steps:
        - "Type the arguments of your override as any[] again; the older methods took any[]. Callers need no change either way."
  - id: parse-inputs-unknown
    symbols: [ParseUtility.isInt, ParseUtility.isFloat, ParseUtility.toInt, ParseUtility.toFloat, ParseUtility.toBoolean]
    upgrade:
      steps:
        - "Nothing to change. The inputs were any and are unknown now, so every call that compiled still compiles. A BigInt input to isInt or isFloat answers as Number(input) does."
    downgrade:
      steps:
        - "Nothing to undo."
  - id: keys-to-camel-answers-a-record
    symbols: [ParseUtility.keysToCamel]
    upgrade:
      before: |
        const row = ParseUtility.keysToCamel({ source: raw });
        const id: string = row.userId.value; // any
      after: |
        const row = ParseUtility.keysToCamel({ source: raw });
        // a Record<string, unknown>: narrow what you read
        const userId = row['userId'];
        const id = typeof userId === 'string' ? userId : undefined;
    downgrade:
      steps:
        - "Read the keys of the result without a narrow again; the older result was any."
  - id: memory-storage-default-record
    symbols: [MemoryStorageHelper]
    upgrade:
      before: |
        const storage = MemoryStorageHelper.newInstance();
        const owner: string = storage.get('owner').name; // the default values were any
      after: |
        // the default shape is Record<string, unknown>; name your shape
        const storage = MemoryStorageHelper.newInstance<{ owner: { name: string } }>();
        const owner: string | undefined = storage.get('owner')?.name;
    downgrade:
      steps:
        - "Drop the type argument; the older default was AnyObject."
  - id: worker-buses-never
    symbols: [IWorkerThread, IWorkerBus, AbstractWorkerThreadHelper]
    upgrade:
      before: |
        const bus = thread.buses['jobs']; // IWorkerBus<any, any>
        bus.postMessage({ message: { id: 1 }, transferList: undefined });
      after: |
        // buses holds buses of different payloads, so a read is IWorkerBus<never, never>:
        // keep the bus you bound under its own type, and send through that one
        const jobs: IWorkerBus<IJob, IJobResult> = { port, handler, postMessage };
        thread.bindWorkerBus({ key: 'jobs', bus: jobs });
        jobs.postMessage({ message: { id: 1 }, transferList: undefined });
    downgrade:
      steps:
        - "Read thread.buses[key] and send through it directly again; the older buses were IWorkerBus<any, any>."
  - id: module-utility-default-unknown
    symbols: [ModuleUtility.load, ModuleUtility.loadSync]
    upgrade:
      before: |
        const lib = await ModuleUtility.load({ module: 'some-peer' }); // any
        lib.connect();
      after: |
        // name what you load
        const lib = await ModuleUtility.load<typeof import('some-peer')>({ module: 'some-peer' });
        lib.connect();
    downgrade:
      steps:
        - "Drop the type argument; the older default was any."
---

# Changelog - 2026-11-13

## Logger arguments, parse inputs, storage and worker-thread types are unknown or typed, not any

<Badge type="warning" text="Breaking Change" />

**In one line.** A few helpers no longer say `any`: you name or narrow what you read, and nothing changes at runtime.

## What changed

- **Logger.** `ILogger` and its classes take `...args: unknown[]`.
- **Parse.** `ParseUtility.isInt`, `isFloat`, `toInt`, `toFloat` and `toBoolean` take an `unknown` input; `keysToCamel` answers a `Record<string, unknown>`.
- **Storage.** `MemoryStorageHelper` and `newInstance` default to `Record<string, unknown>`.
- **Worker thread.** `IWorkerThread.buses` holds `IWorkerBus<never, never>`.
- **Modules.** `ModuleUtility.load` and `loadSync` default to `unknown`.

## Who is affected

- **Code that overrides a logger method with typed arguments, or reads `keysToCamel`, `MemoryStorageHelper` values, `thread.buses` entries or an untyped `ModuleUtility.load` result without a narrow.** See the migration below.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> These are type-level breaks: behaviour is unchanged. The typecheck names each line.

**Before:**

```typescript
const row = ParseUtility.keysToCamel({ source: raw });
const lib = await ModuleUtility.load({ module: 'some-peer' });
```

**After:**

```typescript
const row = ParseUtility.keysToCamel({ source: raw });
const userId = row['userId'];
const lib = await ModuleUtility.load<typeof import('some-peer')>({ module: 'some-peer' });
```
