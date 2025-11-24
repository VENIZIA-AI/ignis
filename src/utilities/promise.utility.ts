import { ValueOrPromise } from '@/common';

type TTask<T> = () => Promise<T>;

/**
 *  Execute all tasks with limit number of asyncronous tasks.
 *  Whenever 1 task's resolved next task will be executed.
 *
 *  @example 
 *  With 20 tasks need to execute with limit is 5 tasks asyncronous
 *  ```
 *  const tasks = <Array of 20 functions which return promises>
 *  await executePromiseWithLimit({
 *    tasks,
 *    limit: 5,
      onTaskDone: (opts: { result: any }) => {
        // Do something on task done
      },
 *  })
 *  ```
 */
export const executePromiseWithLimit = async <T>(opts: {
  tasks: Array<TTask<T>>;
  limit: number;
  onTaskDone?: <R>(opts: { result: R }) => ValueOrPromise<void>;
}) => {
  const { tasks, limit, onTaskDone } = opts;

  const results = [];
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

/**
 * Transform a value or promise with a function
 */
export async function transformValueOrPromise<T, V>(
  valueOrPromise: ValueOrPromise<T>,
  transformer: (value: T) => ValueOrPromise<V>,
): Promise<V> {
  const value = await valueOrPromise;
  return transformer(value);
}

/**
 * Check if a value is a promise
 */
export function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  return (
    !!value &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as PromiseLike<T>).then === 'function'
  );
}

/**
 * Try to get the value synchronously, throw if it's a promise
 */
export function getDeepProperty<T, V>(obj: T, path: string): V {
  const keys = path.split('.');
  let result: any = obj;

  for (const key of keys) {
    if (result == null) {
      throw new Error(`Cannot read property '${key}' of ${result}`);
    }
    result = result[key];
  }

  return result as V;
}
