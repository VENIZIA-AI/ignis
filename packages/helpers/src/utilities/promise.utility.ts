import { type ValueOrPromise } from '@/common';
import { HTTP } from '@/common/constants/http';
import { getError } from '@/modules/error';
import type { ILogger } from '@/modules/logger';

/** An async task as `executeWithLimit` takes it. */
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
  /** The longest delay a timer takes (a signed 32-bit integer of milliseconds); a larger one fires after 1 ms. */
  private static readonly MAX_TIMER_MS = 2_147_483_647;

  static sleep(opts: { ms: number }): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, opts.ms));
  }

  /**
   * Runs `call` and resolves with its result, or rejects with an `ApplicationError` when `timeoutMs` passes first
   * (`message` is the error text; the default names the limit). The timer is cleared on every path - the call wins,
   * the timeout wins, the call throws - so none is left behind. The call's own rejection passes through unchanged.
   * The losing call keeps running: a promise cannot be cancelled. The timeout error carries status 504 (Gateway
   * Timeout). `timeoutMs` must be a positive number no larger than `2_147_483_647` (the most a timer takes: a larger
   * one fires at once), else this rejects without running `call`.
   */
  static async withTimeout<T>(opts: {
    call: () => ValueOrPromise<T>;
    timeoutMs: number;
    message?: string;
  }): Promise<T> {
    const { call, timeoutMs, message } = opts;

    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > PromiseUtility.MAX_TIMER_MS) {
      throw getError({
        message: `[withTimeout] timeoutMs must be positive and at most ${PromiseUtility.MAX_TIMER_MS} | received: ${timeoutMs}`,
      });
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(
          getError({
            statusCode: HTTP.ResultCodes.RS_5.GatewayTimeout,
            message: message ?? `[withTimeout] Timed out after ${timeoutMs}ms`,
          }),
        );
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([new Promise<T>((resolve) => resolve(call())), timeout]);

      return result;
    } finally {
      clearTimeout(timer);
    }
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
