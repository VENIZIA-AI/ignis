---
title: "@venizia/ignis-helpers/bullmq"
description: "Every export of @venizia/ignis-helpers/bullmq, from the built declarations (generated)."
---

# `@venizia/ignis-helpers/bullmq`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

3 exports, 3 with TSDoc.

## `BullMQHelper`

*class*

Wraps a BullMQ `Queue` or `Worker` (per `role`) on one Redis connection.
Worker concurrency is `numberOfWorker`; `lockDuration` is in milliseconds.

```ts
export declare class BullMQHelper<TQueueElement = unknown, TQueueResult = unknown, TMetadata extends object = Record<string, unknown>> extends BaseHelper {
    protected queueName: string;
    protected role: TBullQueueRole;
    protected redisConnection: IRedisHelper;
    queue: Queue<TQueueElement, TQueueResult>;
    worker: Worker<TQueueElement, TQueueResult>;
    protected numberOfWorker: number;
    protected lockDuration: number;
    protected queueOptions?: Omit<QueueOptions, 'connection'>;
    protected workerOptions?: Omit<WorkerOptions, 'connection' | 'concurrency' | 'lockDuration'>;
    protected prefix?: string;
    protected metadata?: () => ValueOrPromise<TMetadata>;
    protected onWorkerData?: (job: Job<TQueueElement, TQueueResult>, context: IBullMQJobContext<TMetadata>) => Promise<TQueueResult>;
    protected onWorkerDataCompleted?: (job: Job<TQueueElement, TQueueResult>, result: TQueueResult) => Promise<void>;
    protected onWorkerDataFail?: (job: Job<TQueueElement, TQueueResult> | undefined, error: Error) => Promise<void>;
    private readonly bullmqModule?;
    private isClosing;
    /** Every duplicate this helper handed to BullMQ: BullMQ never quits a client it is given, so `close()` does. */
    private readonly duplicates;
    constructor(options: IBullMQOptions<TQueueElement, TQueueResult, TMetadata>);
    /** BullMQ never reconnects a client: once ioredis stops reconnecting (`maxRetry` attempts used up) it is `end` for good, no job moves, and nothing else says so. */
    protected reportClientEnded(): void;
    static newInstance<T = unknown, R = unknown, M extends object = Record<string, unknown>>(opts: IBullMQOptions<T, R, M>): BullMQHelper<T, R, M>;
    /** `prefix` as the helper keeps it: a non-empty string with no whitespace and no brace (a brace would move the cluster hash tag), the same on the Queue and the Worker; unset stays unset (BullMQ's `bull`). */
    private static resolvePrefix;
    /** The metadata a producer's helper stamped on `job`, or `undefined` for a job added without one (a raw `queue.add`, another producer). Not part of `job.data`. Returned as stored: its fields are not validated against `TMetadata`. */
    static readMetadata<TMetadata extends object = Record<string, unknown>>(opts: {
        job: Pick<Job, 'opts'> | undefined;
    }): TMetadata | undefined;
    /**
     * Adds a job, stamped by the `metadata` option: the stamp goes to `opts.metadata`, and `data` is exactly what you pass (any shape). A direct
     * `queue.add` is available and unstamped. Refuses `opts.metadata` from the caller (the stamp is the one source) and a stamp that is not an object.
     */
    add(opts: {
        name: Parameters<TQueueAdd<TQueueElement, TQueueResult>>[0];
        data: Parameters<TQueueAdd<TQueueElement, TQueueResult>>[1];
        opts?: JobsOptions;
    }): ReturnType<TQueueAdd<TQueueElement, TQueueResult>>;
    /** Structural, never `instanceof`: ioredis is an optional peer, and a second copy fails `instanceof` anyway. */
    protected isClusterClient(): boolean;
    protected resolveQueueName(): string;
    configureQueue(): void;
    /** Full `Queue` options: framework defaults, then `this.queueOptions`, then the connection the helper owns - in that precedence order. */
    protected queueOptionsFor(opts: {
        queueName: string;
    }): QueueOptions;
    /**
     * The connection BullMQ owns: a duplicate of the helper's client, so the queue or worker connects it by itself
     * whatever state the shared client is in. BullMQ treats a client it is handed as shared and never quits it, so the
     * helper keeps the duplicate and quits it in `close()`.
     */
    protected createConnection(): TRedisClient;
    /** Full `Worker` options: `this.workerOptions`, then the connection/concurrency/lock fields the helper owns - in that precedence order. */
    protected workerOptionsFor(opts: {
        queueName: string;
        processor: Processor<TQueueElement, TQueueResult>;
    }): WorkerOptions;
    /** `bullmq` is an optional peer: loaded when a queue or worker is built, not when this module is. */
    private loadBullMQ;
    /** Client factory seam - overridden in tests to run the helper without Redis. */
    protected buildQueue(opts: {
        queueName: string;
    }): Queue<TQueueElement, TQueueResult>;
    /** Client factory seam - overridden in tests to run the helper without Redis. */
    protected buildWorker(opts: {
        queueName: string;
        processor: Processor<TQueueElement, TQueueResult>;
    }): Worker<TQueueElement, TQueueResult>;
    configureWorker(): void;
    configure(): void;
    /** `quit()` waits for the replies in flight; a client BullMQ already closed is left alone. */
    private static release;
    close(): Promise<void>;
}

/** `Queue.add` for this helper's element and result types: BullMQ resolves its name and data types through conditional types, so they are read off the method. */
type TQueueAdd<TElement, TResult> = Queue<TElement, TResult>['add'];
```

Source: `packages/helpers/src/modules/queue/bullmq/helper.ts`

## `IBullMQJobContext`

*interface*

What `onWorkerData` is told beside the job: the metadata the producer's helper stamped, `undefined` for a job added without one.

```ts
export interface IBullMQJobContext<TMetadata extends object = Record<string, unknown>> {
    metadata: TMetadata | undefined;
}
```

Source: `packages/helpers/src/modules/queue/bullmq/helper.ts`

## `IBullMQOptions`

*interface*

Options for {@link BullMQHelper}. `role` decides whether a `Queue` or a `Worker` is built.

```ts
export interface IBullMQOptions<TQueueElement = unknown, TQueueResult = unknown, TMetadata extends object = Record<string, unknown>> {
    queueName: string;
    identifier: string;
    role: TBullQueueRole;
    redisConnection: IRedisHelper;
    /** `bullmq` itself, for a `bun build --compile` binary that has no `node_modules` to load it from. Omitted, it is loaded when a queue or worker is built. */
    module?: typeof import('bullmq');
    /**
     * Worker concurrency.
     * @default BullMQDefaults.NUMBER_OF_WORKER
     */
    numberOfWorker?: number;
    /**
     * How long a worker holds a job's lock, in milliseconds.
     * @default BullMQDefaults.LOCK_DURATION_MS
     */
    lockDuration?: number;
    /**
     * The prefix of every Redis key of the queue, on the Queue AND the Worker so they cannot disagree. Opt-in: unset is BullMQ's own
     * `bull`, so no key moves. A `queueOptions.prefix` or `workerOptions.prefix` that differs is refused. Switching it strands the
     * waiting, failed and repeatable jobs and the job schedulers under the old prefix: see the queue helper's migration notes.
     */
    prefix?: string;
    /**
     * A block stamped on every job added through `add`, run on each add and stored in the job's `opts.metadata`, outside `job.data`.
     * A throw fails the add; the answer must be a plain object. The worker reads it as `context.metadata`.
     */
    metadata?: () => ValueOrPromise<TMetadata>;
    /** Merged over the framework defaults, under the fields the helper owns (`connection`) - see `queueOptionsFor`. */
    queueOptions?: Omit<QueueOptions, 'connection'>;
    /** Merged under the fields the helper owns (`connection`, `concurrency`, `lockDuration`) - see `workerOptionsFor`. */
    workerOptions?: Omit<WorkerOptions, 'connection' | 'concurrency' | 'lockDuration'>;
    onWorkerData?: (job: Job<TQueueElement, TQueueResult>, context: IBullMQJobContext<TMetadata>) => Promise<TQueueResult>;
    onWorkerDataCompleted?: (job: Job<TQueueElement, TQueueResult>, result: TQueueResult) => Promise<void>;
    onWorkerDataFail?: (job: Job<TQueueElement, TQueueResult> | undefined, error: Error) => Promise<void>;
}
```

Source: `packages/helpers/src/modules/queue/bullmq/helper.ts`
