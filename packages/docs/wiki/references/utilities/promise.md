# Promise Utility

The Promise utility provides helper functions for working with Promises, particularly for managing concurrency and transforming values.

## `executePromiseWithLimit`

This function executes an array of asynchronous tasks concurrently, but with a specified limit on the number of promises running at any given time. This is useful for throttling asynchronous operations to avoid overwhelming a system (e.g., making a large number of concurrent API calls).

### `executePromiseWithLimit(opts)`

-   `opts` (object):
    -   `tasks` (Array&lt;() => Promise&lt;T&gt;&gt;): An array of functions that each return a Promise.
    -   `limit` (number): The maximum number of promises to execute in parallel.
    -   `onTaskDone` (&lt;R&gt;(opts: { result: R }) => ValueOrPromise&lt;void&gt;, optional): A callback function that is executed whenever a task is completed.

### Example

```typescript
import { executePromiseWithLimit, sleep } from '@venizia/ignis';

const tasks = [
  () => sleep(1000).then(() => 'Task 1 done'),
  () => sleep(500).then(() => 'Task 2 done'),
  () => sleep(1200).then(() => 'Task 3 done'),
  () => sleep(800).then(() => 'Task 4 done'),
];

console.log('Starting tasks with a limit of 2...');

const results = await executePromiseWithLimit({
  tasks,
  limit: 2,
  onTaskDone: ({ result }) => {
    console.log('A task finished:', result);
  },
});

console.log('All tasks finished:', results);
```

## `isPromiseLike`

A type guard function to check if a given value is a Promise-like object (i.e., it has a `then` method).

```typescript
import { isPromiseLike } from '@venizia/ignis';

const a = Promise.resolve(1);
const b = 2;

if (isPromiseLike(a)) {
  // This will run
}

if (isPromiseLike(b)) {
  // This will not run
}
```

## `transformValueOrPromise`

This function applies a transformation function to a value that might be a direct value or a Promise.

```typescript
import { transformValueOrPromise, isPromiseLike } from '@venizia/ignis';

const double = (n: number) => n * 2;

const result1 = await transformValueOrPromise(5, double); // => 10
const result2 = await transformValueOrPromise(Promise.resolve(5), double); // => 10
```

## `getDeepProperty`

Safely retrieves a deeply nested property from an object using a dot-separated path string. It throws an error if any part of the path is null or undefined.

```typescript
import { getDeepProperty } from '@venizia/ignis';

const obj = { a: { b: { c: 'hello' } } };

const value = getDeepProperty(obj, 'a.b.c'); // => 'hello'
```
