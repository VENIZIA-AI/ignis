---
title: "@venizia/dev-configs/testing"
description: "Every export of @venizia/dev-configs/testing, from the built declarations (generated)."
---

# `@venizia/dev-configs/testing`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

5 exports, 5 with TSDoc.

## `RejectionHelper`

*class*

Test helpers for asserting that a promise rejects, without the typing and un-awaited-assertion pitfalls of `expect(task).rejects`.

```ts
export declare class RejectionHelper {
    /**
     * Awaits a task that must reject and returns what it rejected with; throws when the task resolves.
     *
     * bun types the async matchers (`expect(task).rejects` / `.resolves`) as `void`, so
     * `await expect(task).rejects.toThrow()` is refused by `await-thenable` - and left un-awaited the
     * assertion never runs. Awaiting the task itself needs no matcher and no cast:
     * `RejectionHelper.expectRejection({ task, message })` or
     * `expect(await RejectionHelper.rejectionOf({ task })).toBeInstanceOf(Error)`,
     * and for a resolution `expect(await task).toMatchObject(...)`.
     */
    static rejectionOf(opts: {
        task: Promise<unknown>;
    }): Promise<unknown>;
    /**
     * The task rejects with an Error whose message contains `message` (a string) or matches it (a
     * RegExp). The message is compared as a string on purpose: bun 1.4.2 `toMatchObject` with an
     * asymmetric matcher overwrites the matched property on the object it checks, so a later read of
     * `error.message` gets the matcher back.
     */
    static expectRejection(opts: {
        task: Promise<unknown>;
        message: string | RegExp;
    }): Promise<void>;
}
```

Source: `packages/dev-configs/src/testing/rejection.helper.ts`

## `REPO_TMP_DIRECTORY`

*const*

The folder under the repository root that holds a test run's temp folders.

```ts
export declare const REPO_TMP_DIRECTORY: string;
```

Source: `packages/dev-configs/src/testing/repo-tmp.ts`

## `RepoTmp`

*class*

Routes test temp folders into the repository: `apply` sets `TMPDIR` and `GIT_CEILING_DIRECTORIES` and makes `Bun.spawn` children inherit them.

```ts
export declare class RepoTmp {
    /** The nearest ancestor of `start` that holds a `.git` (folder or file); `start` itself when there is none. */
    static findRoot(opts?: {
        start?: string;
    }): string;
    /**
     * `Bun.spawn` and `Bun.spawnSync` hand a child the environment the process started with, not the one
     * it has now, so a TMPDIR set here would never reach it. Wrapped to default to the current one; an
     * `env` a caller passes wins. `spawn(cmd, options)` and `spawn({ cmd, ...options })` are both handled.
     */
    private static withCurrentEnv;
    /**
     * Points TMPDIR at the repository's test folder unless it is already inside it (make's value, or a
     * private folder a caller made there), and returns the folder now in force. Idempotent.
     */
    static apply(opts?: {
        root?: string;
    }): string;
}
```

Source: `packages/dev-configs/src/testing/repo-tmp.ts`

## `SPAWN_TIMEOUT_MS`

*const*

Long enough for a cold `bun build` under a loaded parallel run; it bounds a stall, not a slow run.

```ts
export declare const SPAWN_TIMEOUT_MS = 120000;
```

Source: `packages/dev-configs/src/testing/spawn.helper.ts`

## `SpawnHelper`

*class*

Bounded wrappers around `Bun.spawn*` for tests, so a stuck child cannot stall a suite.

```ts
export declare class SpawnHelper {
    /**
     * `Bun.spawnSync`, bounded. A sync spawn blocks the worker thread, so bun's own test timeout cannot
     * fire while it waits: the `timeout` option is the only bound. Its default signal, SIGTERM, can be
     * outlived by a stuck child - one such child once stalled a whole suite for 770s - so this kills with
     * SIGKILL, and throws naming the command instead of returning a half-finished result.
     */
    static spawnSyncBounded<const In extends Bun.SpawnOptions.Writable = 'ignore', const Out extends Bun.SpawnOptions.Readable = 'pipe', const Err extends Bun.SpawnOptions.Readable = 'pipe'>(opts: Bun.SpawnOptions.SpawnSyncOptions<In, Out, Err> & {
        cmd: string[];
        onExit?: undefined;
    }): Bun.SyncSubprocess<Out, Err>;
}
```

Source: `packages/dev-configs/src/testing/spawn.helper.ts`
