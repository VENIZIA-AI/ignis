import { type ValueOrPromise } from '@/common';
import { getError } from '@/modules/error';
import type { ILogger } from '@/modules/logger';

export type TTask<T> = (...args: any[]) => Promise<T>;

/** Check if a value is a promise. */
export const isPromiseLike = <T>(value: T | PromiseLike<T>): value is PromiseLike<T> => {
  return (
    !!value &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as PromiseLike<T>).then === 'function'
  );
};

/** Waiting, bounded concurrency and fire-and-forget. `voidExecution` is not a `BaseHelper` member: TS cannot emit protected members on an exported ANONYMOUS class (TS4094), which is what factory-built controllers return; a static on a separate class has no such limit. */
export class PromiseUtility {
  static sleep(opts: { ms: number }): Promise<unknown> {
    return new Promise((resolve) => setTimeout(resolve, opts.ms));
  }

  /** Execute async tasks with bounded concurrency. */
  static async executeWithLimit<T>(opts: {
    tasks: Array<TTask<T>>;
    limit: number;
    onTaskDone?: <R>(opts: { result: R }) => ValueOrPromise<void>;
  }) {
    const { tasks, limit, onTaskDone } = opts;

    if (!Number.isInteger(limit) || limit < 1) {
      throw getError({
        message: `[executePromiseWithLimit] limit must be a positive integer | received: ${limit}`,
      });
    }

    const results: Promise<T>[] = [];
    const executing = new Set();

    for (const task of tasks) {
      const promise = task().then((result) => {
        executing.delete(promise);
        return result;
      });

      executing.add(promise);
      results.push(promise);

      if (executing.size >= limit) {
        const done = await Promise.race(executing);
        await onTaskDone?.({ result: done });
      }
    }

    await Promise.all(executing);
    return Promise.all(results);
  }

  /** Fire-and-forget: routes rejection to `logger` (or console.error), passes sync results through untouched. */
  static voidExecution(opts: {
    logger?: ILogger;
    scope: string;
    execution: ValueOrPromise<unknown>;
  }): void {
    const { logger, scope, execution } = opts;

    if (!isPromiseLike(execution)) {
      return;
    }

    Promise.resolve(execution).catch((error: unknown) => {
      if (logger) {
        logger.for(scope).error('Unhandled error in fire-and-forget execution | Error: %s', error);
        return;
      }

      console.error('[%s] Unhandled error in fire-and-forget execution', scope, error);
    });
  }
}

/** @deprecated Use PromiseUtility.executeWithLimit({ tasks, limit, onTaskDone }). Removed in 0.5. */
export const executePromiseWithLimit = <T>(opts: {
  tasks: Array<TTask<T>>;
  limit: number;
  onTaskDone?: <R>(opts: { result: R }) => ValueOrPromise<void>;
}) => PromiseUtility.executeWithLimit<T>(opts);

/** @deprecated Use PromiseUtility.voidExecution({ logger, scope, execution }). Removed in 0.5. */
export const voidExecution = (opts: {
  logger?: ILogger;
  scope: string;
  execution: ValueOrPromise<unknown>;
}): void => PromiseUtility.voidExecution(opts);
