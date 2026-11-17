---
title: "@venizia/ignis-helpers/cron"
description: "Every export of @venizia/ignis-helpers/cron, from the built declarations (generated)."
---

# `@venizia/ignis-helpers/cron`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

2 exports, 2 with TSDoc.

## `CronHelper`

*class*

Wraps one cron job. The constructor throws an `ApplicationError` when `cronTime` is empty or not a valid cron expression.

```ts
export declare class CronHelper extends BaseHelper {
    private cronTime;
    private onTick;
    private onCompleted?;
    private autoStart;
    private tz?;
    private errorHandler?;
    instance: CronJob;
    constructor(opts: ICronHelperOptions);
    static newInstance(opts: ICronHelperOptions): CronHelper;
    /** Builds the job. Synchronous, so the constructor still THROWS on a bad cronTime. */
    protected buildInstance(): void;
    /** Async because `CronJob.stop()` resolves only once an in-flight tick finishes; fire-and-forgetting it would let the replacement job start while the old handler is still running. */
    configure(): Promise<void>;
    start(): void;
    stop(): Promise<void>;
    modifyCronTime(opts: {
        cronTime: string;
        shouldFireOnTick?: boolean;
    }): void;
    duplicate(opts: {
        cronTime: string;
    }): CronHelper;
}
```

Source: `packages/helpers/src/modules/cron/helper.ts`

## `ICronHelperOptions`

*interface*

Options for `CronHelper`.

```ts
export interface ICronHelperOptions {
    cronTime: string;
    onTick: () => void | Promise<void>;
    onCompleted?: CronOnCompleteCommand | null;
    /**
     * Starts the job on construction.
     * @default false
     */
    autoStart?: boolean;
    /** The time zone the schedule is read in. */
    tz?: string;
    errorHandler?: (error: unknown) => void | null;
}
```

Source: `packages/helpers/src/modules/cron/helper.ts`
