import { type ValueOrPromise } from '@/common';
import { HTTP } from '@/common/constants/http';
import { getError } from '@/modules/error';
import type { ILogger } from '@/modules/logger';
import { LoggerFactory } from '@/modules/logger/factory';
import type { IExecutionFrame, IExecutionRunner, TExecutionRunOptions } from './common/types';

/** An async task as `Execution.withLimit` takes it. */
export type TTask<T> = (...args: never[]) => Promise<T>;

/** Check if a value is a promise. */
export const isPromiseLike = <T>(value: T | PromiseLike<T>): value is PromiseLike<T> => {
  return (
    !!value &&
    (typeof value === 'object' || typeof value === 'function') &&
    'then' in value &&
    typeof value.then === 'function'
  );
};

/** Running work: who it runs for (`run`, `current`), waiting, a time limit, bounded concurrency and fire-and-forget. `fireAndForget` is not a `BaseHelper` member: TS cannot emit protected members on an exported ANONYMOUS class (TS4094), which is what factory-built controllers return; a static on a separate class has no such limit. */
export class Execution {
  /** The longest delay a timer takes (a signed 32-bit integer of milliseconds); a larger one fires after 1 ms. */
  private static readonly MAX_TIMER_MS = 2_147_483_647;

  /**
   * Installs what holds the current frame. The first install wins, so that two copies of the server layer share one
   * store; a later call changes nothing.
   */
  static setRunner(opts: { runner: IExecutionRunner }): void {
    globalThis.ignisExecutionRunner ??= opts.runner;
  }

  /** The frame the caller runs in, or `undefined` outside every frame. */
  static current(): IExecutionFrame | undefined {
    return globalThis.ignisExecutionRunner?.read();
  }

  /**
   * Runs `task` in a new frame and resolves with its result. The innermost frame wins: it takes its mode from this
   * call alone, and inherits the request, the user and the values of the frame around it unless `isRoot` is set.
   * `values` and `userId` are claims of the caller: never copy them from a request without checking them.
   */
  static async run<Result>(opts: TExecutionRunOptions<Result>): Promise<Result> {
    const runner = globalThis.ignisExecutionRunner;

    if (!runner) {
      throw getError({ message: '[Execution] no runner | call ExecutionRunner.install()' });
    }

    return runner.run(opts);
  }

  static sleep(opts: { ms: number }): Promise<void> {
    // eslint-disable-next-line @venizia/prefer-execution-sleep -- this is the implementation the rule points at
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

    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > Execution.MAX_TIMER_MS) {
      throw getError({
        message: `[withTimeout] timeoutMs must be positive and at most ${Execution.MAX_TIMER_MS} | received: ${timeoutMs}`,
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
  static async withLimit<T>(opts: {
    tasks: Array<TTask<T>>;
    limit: number;
    onTaskDone?: <R>(opts: { result: R }) => ValueOrPromise<void>;
  }) {
    const { tasks, limit, onTaskDone } = opts;

    if (!Number.isInteger(limit) || limit < 1) {
      throw getError({
        message: `[withLimit] limit must be a positive integer | received: ${limit}`,
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

  /** Fire-and-forget: routes rejection to `logger` (or the framework logger of `scope`), passes sync results through untouched. */
  static fireAndForget(opts: {
    logger?: ILogger;
    scope: string;
    execution: ValueOrPromise<unknown>;
  }): void {
    const { logger, scope, execution } = opts;

    if (!isPromiseLike(execution)) {
      return;
    }

    Promise.resolve(execution).catch((error: unknown) => {
      // `%s` leaves out an error's own fields. The server providers print its stack with it, the console logger its message.
      const target = logger ? logger.for(scope) : LoggerFactory.getLogger([scope]);

      target.error('Unhandled error in fire-and-forget execution | Error: %s', error);
    });
  }
}
