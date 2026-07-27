import { ValueOrPromise } from '@/common';
import { getError } from '@/modules/error';
import type { ILogger } from '@/modules/logger';

export type TTask<T> = (...args: any[]) => Promise<T>;

/** Execute async tasks with bounded concurrency. */
export const executePromiseWithLimit = async <T>(opts: {
  tasks: Array<TTask<T>>;
  limit: number;
  onTaskDone?: <R>(opts: { result: R }) => ValueOrPromise<void>;
}) => {
  const { tasks, limit, onTaskDone } = opts;

  if (!Number.isInteger(limit) || limit < 1) {
    throw getError({
      message: `[executePromiseWithLimit] limit must be a positive integer | received: ${limit}`,
    });
  }

  const results: Promise<T>[] = [];
  const executing = new Set();

  for (const task of tasks) {
    const promise = task().then(result => {
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
};

/** Normalize an unknown thrown value into an Error instance. */
export const toError = (error: unknown): Error => {
  return error instanceof Error ? error : new Error(String(error));
};

/** Check if a value is a promise. */
export const isPromiseLike = <T>(value: T | PromiseLike<T>): value is PromiseLike<T> => {
  return (
    !!value &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as PromiseLike<T>).then === 'function'
  );
};

/** Traverse a dotted property path on an object. */
export const getDeepProperty = <T, V>(obj: T, path: string): V => {
  const keys = path.split('.');
  let result: any = obj;

  for (const key of keys) {
    if (result == null) {
      throw getError({ message: `Cannot read property '${key}' of ${result}` });
    }
    result = result[key];
  }

  return result as V;
};

/** Fire-and-forget: routes rejection to `logger` (or console.error), passes sync results through untouched. Standalone rather than a BaseHelper member - TS cannot emit protected members on an exported ANONYMOUS class (TS4094), which is what factory-built controllers return. */
export const voidExecution = (opts: {
  logger?: ILogger;
  scope: string;
  execution: ValueOrPromise<unknown>;
}): void => {
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
};
