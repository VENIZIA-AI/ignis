---
title: Environment
description: Prefix-filtered access to environment variables as strings, plus deployment-stage detection
difficulty: beginner
---

# Environment

`applicationEnvironment` is a singleton that filters `process.env` down to your app's prefix and reads it as strings. `Environment` reads the current deployment stage from `NODE_ENV`.

## In one example

```typescript
import { applicationEnvironment } from '@venizia/ignis-helpers';

const jwtSecret = applicationEnvironment.get('APP_ENV_JWT_SECRET');
const timeout = applicationEnvironment.get('APP_ENV_TIMEOUT', {
  transform: (raw) => (raw === undefined ? undefined : Number(raw)),
  defaultValue: 5000,
});
```

The singleton is created once at module load. It reads only keys that start with `APP_ENV` (the default prefix) from `process.env`. `AppEnvs` is an exported alias for the same instance.

## How it works

- **Construction filters by prefix.** `new ApplicationEnvironment({ prefix, envs })` copies only the keys of `envs` that start with `prefix` into an internal map. Everything else stays invisible to `get()`. The default singleton uses `process.env.APPLICATION_ENV_PREFIX ?? 'APP_ENV'` and `process.env`.
- **`get()` has three forms, and every value is a string.**
  - `get(key)` returns `string | undefined`.
  - `get(key, { defaultValue })` returns `string`: the value, or `defaultValue` when the key is missing.
  - `get(key, { transform, defaultValue? })` returns what `transform` makes of the raw `string | undefined`. It falls back to `defaultValue` only if `transform` returns `undefined` or `null`.
- **The default is an options object, not a positional argument.**
- **A present-but-empty line counts as missing, but only when you pass `defaultValue`.** `APP_ENV_HOST=` and `APP_ENV_HOST=   ` both read as `undefined`, so `defaultValue` applies and `transform` receives `undefined` rather than `''`. Call `get()` without a `defaultValue` and you still get `''` back unchanged. `'0'` and `'false'` are values and are never treated as missing.

> [!WARNING] Put the fallback in `get()`, not after it
> `ParseUtility.toInt()` always answers a number - `0` for anything unparseable - so `ParseUtility.toInt({ input: get(KEY) }) ?? 6379` never reaches its fallback. Write `ParseUtility.toInt({ input: get(KEY, { defaultValue: '6379' }) })` instead. The broken form is silent: a missing port reads `0`, and a missing retry budget reads `0`, which means "give up after the first failure".
- **Nothing is converted unless you pass `transform`.** Every `process.env` value is a `string`, and `get()` types it as one. For a number, convert in a `transform` that handles `undefined`: `Number(undefined)` is `NaN`, and `NaN` is not nullish, so a `defaultValue` never replaces it. A required variable is checked where you read it: see "Read a required variable" below.
- **Stage detection is separate from the singleton.** `Environment.current` reads `process.env.NODE_ENV` directly. It falls back to `'development'` when `NODE_ENV` is unset.
- **`Environment.is({ name })` compares a name against `Environment.current`.**
- **`ApplicationEnvironment.isDevelopment()` is narrower.** It checks `NODE_ENV === 'development'` exactly. The `'dev'` alias fails that check, even though `dev` counts as a development stage everywhere else in IGNIS.

**Deployment stages** (`Environment.*`)

| Constant | Value | In `DEVELOPMENT_ENVS` |
|----------|-------|------------------------|
| `LOCAL` | `'local'` | yes |
| `DEBUG` | `'debug'` | yes |
| `DEVELOPMENT` | `'development'` | yes |
| `DEV` | `'dev'` | yes - short spelling of `development` |
| `SIT` | `'sit'` | yes |
| `UAT` | `'uat'` | no |
| `ALPHA` | `'alpha'` | no |
| `BETA` | `'beta'` | no |
| `STAGING` | `'staging'` | no |
| `PRODUCTION` | `'production'` | no |

All ten stages are in `Environment.COMMON_ENVS`, which the Logger uses to decide whether `DEBUG=true` is honored. The five marked above are `Environment.DEVELOPMENT_ENVS`. IGNIS's error handler consults this set to decide whether a response may carry a stack trace or a raw driver message. The rule is fail-closed: `alpha`, `beta`, `uat`, `staging`, a typo'd name, and an unset `NODE_ENV` are all sanitized as production.

## Common tasks

### Read a variable with a default

`defaultValue` goes inside the options object, not as a second positional argument.

```typescript
const port = applicationEnvironment.get('APP_ENV_SERVER_PORT', { defaultValue: '3000' });
```

### Read a required variable

`get()` answers `string | undefined`, so a variable the app cannot start without is checked where you read it. A small helper of your own keeps that in one place:

```typescript
import { applicationEnvironment, getError } from '@venizia/ignis-helpers';

export const requireEnv = (key: string): string => {
  const value = applicationEnvironment.get(key);

  if (value === undefined || value.trim() === '') {
    throw getError({ message: `[requireEnv] ${key} is not set` });
  }

  return value;
};
```

### Convert a value while reading it

Pass `transform` to parse instead of casting.

```typescript
const timeout = applicationEnvironment.get('APP_ENV_TIMEOUT', {
  transform: (raw) => (raw === undefined ? undefined : Number(raw)),
  defaultValue: 5000,
});
```

### Set or merge variables at runtime

`set()` writes a single key. `merge()` overwrites several keys at once. Both bypass the prefix filter - they write directly, with no `startsWith` check.

```typescript
applicationEnvironment.set('APP_ENV_FEATURE_FLAG', 'enabled');
applicationEnvironment.merge({ envs: { APP_ENV_REGION: 'ap-southeast-1' } });
```

### Branch on the deployment stage

```typescript
import { Environment } from '@venizia/ignis-helpers';

if (Environment.is({ name: Environment.STAGING })) {
  // Staging-only behavior
}
```

### Use a custom prefix

Set `APPLICATION_ENV_PREFIX` before the first import of `@venizia/ignis-helpers`. The singleton is constructed at module load, so a later change has no effect on it.

```
APPLICATION_ENV_PREFIX=MY_APP_ENV
MY_APP_ENV_SERVER_HOST=0.0.0.0
```

### List every filtered key

```typescript
const allKeys = applicationEnvironment.keys();
// e.g. ['APP_ENV_SERVER_HOST', 'APP_ENV_SERVER_PORT', 'APP_ENV_JWT_SECRET']
```

> [!TIP]
> `BaseApplication` allows empty values by default. Set `ALLOW_EMPTY_ENV_VALUE` to `false` or `0` and it validates every prefixed key at startup, throwing on the first empty one - see [Application](/guides/core-concepts/application/).

## See also

- [Application](/guides/core-concepts/application/) - environment validation during startup
- [Helpers Overview](/extensions/helpers/) - all available helpers
- [Logger](/extensions/helpers/logger/) - uses `Environment.COMMON_ENVS` for debug log filtering
- [Error](/extensions/helpers/error/) - uses `Environment.DEVELOPMENT_ENVS` to gate error detail

**Files:**

- [`packages/helpers/src/modules/env/app-env.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/env/app-env.ts) - `Environment`, `ApplicationEnvironment`, the `applicationEnvironment` singleton
- [`packages/helpers/src/modules/env/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/env/common/types.ts) - `IApplicationEnvironment` interface
