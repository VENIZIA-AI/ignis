---
title: "@venizia/ignis-helpers/bullmq"
description: "Every export of @venizia/ignis-helpers/bullmq, from the built declarations (generated)."
---

# `@venizia/ignis-helpers/bullmq`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

2 exports, 2 with TSDoc.

## `BullMQHelper`

*class*

Wraps a BullMQ `Queue` or `Worker` (per `role`) on one Redis connection.
Worker concurrency is `numberOfWorker`; `lockDuration` is in milliseconds.

```ts
export declare class BullMQHelper<TQueueElement = any, TQueueResult = any> extends BaseHelper {
    protected queueName: string;
    protected role: TBullQueueRole;
    protected redisConnection: IRedisHelper;
    queue: Queue<TQueueElement, TQueueResult>;
    worker: Worker<TQueueElement, TQueueResult>;
    protected numberOfWorker: number;
    protected lockDuration: number;
    protected queueOptions?: Omit<QueueOptions, 'connection'>;
    protected workerOptions?: Omit<WorkerOptions, 'connection' | 'concurrency' | 'lockDuration'>;
    protected onWorkerData?: (job: Job<TQueueElement, TQueueResult>) => Promise<any>;
    protected onWorkerDataCompleted?: (job: Job<TQueueElement, TQueueResult>, result: any) => Promise<void>;
    protected onWorkerDataFail?: (job: Job<TQueueElement, TQueueResult> | undefined, error: Error) => Promise<void>;
    private readonly bullmqModule?;
    constructor(options: IBullMQOptions<TQueueElement, TQueueResult>);
    static newInstance<T = any, R = any>(opts: IBullMQOptions<T, R>): BullMQHelper<T, R>;
    /** Structural, never `instanceof`: ioredis is an optional peer, and a second copy fails `instanceof` anyway. */
    protected isClusterClient(): boolean;
    protected resolveQueueName(): string;
    configureQueue(): void;
    /** Full `Queue` options: framework defaults, then `this.queueOptions`, then the connection the helper owns - in that precedence order. */
    protected queueOptionsFor(opts: {
        queueName: string;
    }): QueueOptions;
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
    close(): Promise<void>;
}
```

Source: `packages/helpers/src/modules/queue/bullmq/helper.ts`

## `IBullMQOptions`

*interface*

Options for {@link BullMQHelper}. `role` decides whether a `Queue` or a `Worker` is built.

```ts
export interface IBullMQOptions<TQueueElement = any, TQueueResult = any> {
    queueName: string;
    identifier: string;
    role: TBullQueueRole;
    redisConnection: IRedisHelper;
    /** `bullmq` itself, for a `bun build --compile` binary that has no `node_modules` to load it from. Omitted, it is loaded when a queue or worker is built. */
    module?: typeof import('bullmq');
    /**
     * Worker concurrency.
     * @default 1
     */
    numberOfWorker?: number;
    /**
     * How long a worker holds a job's lock, in milliseconds.
     * @default 90 * 60 * 1000
     */
    lockDuration?: number;
    /** Merged over the framework defaults, under the fields the helper owns (`connection`) - see `queueOptionsFor`. */
    queueOptions?: Omit<QueueOptions, 'connection'>;
    /** Merged under the fields the helper owns (`connection`, `concurrency`, `lockDuration`) - see `workerOptionsFor`. */
    workerOptions?: Omit<WorkerOptions, 'connection' | 'concurrency' | 'lockDuration'>;
    onWorkerData?: (job: Job<TQueueElement, TQueueResult>) => Promise<any>;
    onWorkerDataCompleted?: (job: Job<TQueueElement, TQueueResult>, result: any) => Promise<void>;
    onWorkerDataFail?: (job: Job<TQueueElement, TQueueResult> | undefined, error: Error) => Promise<void>;
}
```

Source: `packages/helpers/src/modules/queue/bullmq/helper.ts`
