---
title: Environment
description: Prefix-filtered, type-safe access to environment variables plus deployment-stage detection
difficulty: beginner
---

# Environment

`applicationEnvironment` is a singleton that filters `process.env` down to your app's prefix and gives typed access to it; `Environment` reads the current deployment stage from `NODE_ENV`.

## In one example

```typescript
import { applicationEnvironment } from '@venizia/ignis-helpers';

const jwtSecret = applicationEnvironment.get<string>('APP_ENV_JWT_SECRET');
const timeout = applicationEnvironment.get<number>('APP_ENV_TIMEOUT', { defaultValue: 5000 });
```

The singleton is created once at module load, reading only keys that start with `APP_ENV` (the default prefix) from `process.env`. `Envs` is an exported alias for the same instance.

## How it works

- **Construction filters by prefix.** `new ApplicationEnvironment({ prefix, envs })` copies only the keys of `envs` that start with `prefix` into an internal map - everything else is invisible to `get()`. The default singleton uses `process.env.APPLICATION_ENV_PREFIX ?? 'APP_ENV'` and `process.env`.
- **`get()` takes an options object, not a positional default.** The signature is `get<ReturnType, BeforeTransformType = unknown>(key, opts?: { defaultValue?, transform? })`. Without `transform`, it returns the raw value (still a `string`) or `defaultValue` when the key is missing. With `transform`, it calls `transform(rawValue)` and falls back to `defaultValue` if that returns `undefined` or `null`.
- **`get<T>()` is a type cast without `transform`, not a runtime conversion.** Every `process.env` value is a `string`; asking for `get<number>('APP_ENV_PORT')` still returns a string at runtime unless you pass `transform: Number`.
- **Stage detection is separate from the singleton.** `Environment.current` reads `process.env.NODE_ENV` directly (falling back to `'development'` when unset); `Environment.is({ name })` compares against it. `ApplicationEnvironment.isDevelopment()` is narrower - it checks `NODE_ENV === 'development'` exactly, so the `'dev'` alias returns `false` there even though it counts as a development stage everywhere else.

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

All ten stages are in `Environment.COMMON_ENVS`, which the Logger uses to decide whether `DEBUG=true` is honored. The five marked above are `Environment.DEVELOPMENT_ENVS` - the set IGNIS's error handler consults to decide whether a response may carry a stack trace or a raw driver message. The rule is fail-closed: `alpha`, `beta`, `uat`, `staging`, a typo'd name, and an unset `NODE_ENV` are all sanitized as production.

## Common tasks

### Read a variable with a default

`defaultValue` goes inside the options object, not as a second positional argument.

```typescript
const port = applicationEnvironment.get<string>('APP_ENV_SERVER_PORT', { defaultValue: '3000' });
```

### Convert a value while reading it

Pass `transform` to parse instead of casting.

```typescript
const timeout = applicationEnvironment.get<number>('APP_ENV_TIMEOUT', {
  transform: value => Number(value),
  defaultValue: 5000,
});
```

### Set or merge variables at runtime

`set()` writes a single key; `merge()` overwrites several at once - both bypass the prefix filter (they write directly, no `startsWith` check).

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

Set `APPLICATION_ENV_PREFIX` before the first import of `@venizia/ignis-helpers` - the singleton is constructed at module load, so a later change has no effect on it.

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
> `BaseApplication` validates every prefixed key at startup and throws on an empty value unless `ALLOW_EMPTY_ENV_VALUE` is truthy - see [Application](/guides/core-concepts/application/).

## See also

- [Application](/guides/core-concepts/application/) - environment validation during startup
- [Helpers Overview](/extensions/helpers/) - all available helpers
- [Logger](/extensions/helpers/logger/) - uses `Environment.COMMON_ENVS` for debug log filtering
- [Error](/extensions/helpers/error/) - uses `Environment.DEVELOPMENT_ENVS` to gate error detail

**Files:**

- [`packages/helpers/src/modules/env/app-env.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/env/app-env.ts) - `Environment`, `ApplicationEnvironment`, the `applicationEnvironment` singleton
- [`packages/helpers/src/modules/env/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/env/types.ts) - `IApplicationEnvironment` interface
