import { ValueOrPromise } from '@/common';
import { getError } from '@/modules/error';

export type TTask<T> = (...args: any[]) => Promise<T>;

/** Execute async tasks with bounded concurrency. */
export const executePromiseWithLimit = async <T>(opts: {
  tasks: Array<TTask<T>>;
  limit: number;
  onTaskDone?: <R>(opts: { result: R }) => ValueOrPromise<void>;
}) => {
  const { tasks, limit, onTaskDone } = opts;

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
      onTaskDone?.({ result: done });
    }
  }

  await Promise.all(executing);
  return Promise.all(results);
};

/** Transform a value or promise with a function. */
export async function transformValueOrPromise<T, V>(
  valueOrPromise: ValueOrPromise<T>,
  transformer: (value: T) => ValueOrPromise<V>,
): Promise<V> {
  const value = await valueOrPromise;
  return transformer(value);
}

/** Normalize an unknown thrown value into an Error instance. */
export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/** Check if a value is a promise. */
export function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  return (
    !!value &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as PromiseLike<T>).then === 'function'
  );
}

/** Traverse a dotted property path on an object. */
export function getDeepProperty<T, V>(obj: T, path: string): V {
  const keys = path.split('.');
  let result: any = obj;

  for (const key of keys) {
    if (result == null) {
      throw getError({ message: `Cannot read property '${key}' of ${result}` });
    }
    result = result[key];
  }

  return result as V;
}
