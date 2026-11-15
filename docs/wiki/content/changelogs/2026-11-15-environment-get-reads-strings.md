---
title: applicationEnvironment.get reads strings, with no type cast
description: "get(key) answers string or undefined, get(key, { defaultValue }) answers a string, and get(key, { transform }) answers what the transform returns; the BeforeTransformType generic and the cast are gone."
packages: ['@venizia/ignis-helpers']
migration:
  - id: get-string-type-argument
    symbols: [ApplicationEnvironment.get, IApplicationEnvironment.get]
    upgrade:
      before: |
        const secret = applicationEnvironment.get<string>('APP_ENV_JWT_SECRET');
        const port = applicationEnvironment.get<string>('APP_ENV_PORT', { defaultValue: '3000' });
        const max = applicationEnvironment.get<number | undefined, string>('APP_ENV_POOL_MAX', {
          transform: (value) => (value ? Number(value) : undefined),
        });
      after: |
        // get answers string | undefined: check a required variable where you read it
        const secret = applicationEnvironment.get('APP_ENV_JWT_SECRET');
        const port = applicationEnvironment.get('APP_ENV_PORT', { defaultValue: '3000' });
        // the second type argument is gone: the transform takes string | undefined
        const max = applicationEnvironment.get<number | undefined>('APP_ENV_POOL_MAX', {
          transform: (value) => (value ? Number(value) : undefined),
        });
    downgrade:
      steps:
        - "Put the type arguments back (get<string>(key), get<R, string>(key, { transform })); or restore the files from git, since the codemod has no reverse."
  - id: get-number-cast
    symbols: [ApplicationEnvironment.get, IApplicationEnvironment.get]
    upgrade:
      before: |
        const timeout = applicationEnvironment.get<number>('APP_ENV_TIMEOUT', { defaultValue: 5000 }); // a string at runtime
      after: |
        // convert in a transform: the value is a string
        const timeout = applicationEnvironment.get('APP_ENV_TIMEOUT', {
          transform: (raw) => (raw === undefined ? undefined : Number(raw)),
          defaultValue: 5000,
        });
    downgrade:
      steps:
        - "Call get<number>(key, { defaultValue }) again; the older get<T> was a cast."
    data: "The old get<number>(key) returned the raw string at runtime while its type said number. Code that compared it with a number, or added to it, behaved as a string operation: check each call that carried a non-string type argument."
  - id: required-variable-checked-at-the-read
    symbols: [ApplicationEnvironment.get, IApplicationEnvironment.get]
    upgrade:
      before: |
        const host: string = applicationEnvironment.get<string>('APP_ENV_DB_HOST'); // undefined at runtime when unset
      after: |
        const host = applicationEnvironment.get('APP_ENV_DB_HOST');

        if (host === undefined) {
          throw new Error('APP_ENV_DB_HOST is not set');
        }
    downgrade:
      steps:
        - "Read it with get<string>(key) again and drop the check."
  - id: environment-store-values-are-strings
    symbols: [ApplicationEnvironment, ApplicationEnvironment.set, IApplicationEnvironment.set]
    upgrade:
      before: |
        const environment = new ApplicationEnvironment({ prefix: 'APP_ENV', envs: { APP_ENV_PORT: 3000 } });
        applicationEnvironment.set('APP_ENV_RETRIES', 3);
      after: |
        const environment = new ApplicationEnvironment({ prefix: 'APP_ENV', envs: { APP_ENV_PORT: '3000' } });
        applicationEnvironment.set('APP_ENV_RETRIES', '3');
    downgrade:
      steps:
        - "Pass numbers (or any value) to the constructor and set again; the older store held any."
---

# Changelog - 2026-11-15

## applicationEnvironment.get reads strings, with no type cast

<Badge type="warning" text="Breaking Change" />

**In one line.** Every environment value is a string, so `get()` says so: it no longer lets you cast it to `number` or claim a missing variable is a string.

## What changed

- **`get(key)`** answers `string | undefined`.
- **`get(key, { defaultValue })`** answers `string`.
- **`get(key, { transform, defaultValue? })`** answers what `transform` returns. `transform` takes `string | undefined`.
- **Gone.** The `BeforeTransformType` generic, and the `as ReturnType` cast inside `get`.
- **The store.** `set(key, value)`, the constructor's `envs` and the store hold strings, not any value.

## Who is affected

- **Apps that call `get<string>(...)`.** Run `devz codemod env-get --write <paths>` (from the `@venizia/dev-configs` release that follows this one): it removes the type argument and the second type argument of a `transform` read.
- **Apps that call `get<number>(...)` or another non-string type argument, or read a required variable as a string.** The typecheck names each line: see the migration below.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> These are type-level breaks: runtime behaviour is unchanged. The typecheck names each line.

**Before:**

```typescript
const secret: string = applicationEnvironment.get<string>('APP_ENV_JWT_SECRET');
const timeout = applicationEnvironment.get<number>('APP_ENV_TIMEOUT', { defaultValue: 5000 });
```

**After:**

```typescript
const secret = applicationEnvironment.get('APP_ENV_JWT_SECRET'); // string | undefined
const timeout = applicationEnvironment.get('APP_ENV_TIMEOUT', {
  transform: (raw) => (raw === undefined ? undefined : Number(raw)),
  defaultValue: 5000,
});
```
