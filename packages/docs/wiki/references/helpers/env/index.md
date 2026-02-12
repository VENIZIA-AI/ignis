# Environment

Structured access to application environment variables with prefix filtering, type-safe retrieval, and stage detection.

## Quick Reference

| Item | Value |
|------|-------|
| **Package** | `@venizia/ignis-helpers` |
| **Classes** | `ApplicationEnvironment`, `Environment` |
| **Extends** | `IApplicationEnvironment` (interface) |
| **Singleton** | `applicationEnvironment` -- auto-initialized at module load |
| **Runtimes** | Both |

#### Import Paths

```typescript
// Singleton instance (recommended)
import { applicationEnvironment } from '@venizia/ignis-helpers';

// Classes
import { ApplicationEnvironment, Environment } from '@venizia/ignis-helpers';

// Interface
import type { IApplicationEnvironment } from '@venizia/ignis-helpers';
```

## Creating an Instance

### Singleton (Recommended)

A pre-configured `applicationEnvironment` singleton is auto-initialized at module load time. It reads `process.env` and filters keys matching the configured prefix (default: `APP_ENV`).

```typescript
import { applicationEnvironment } from '@venizia/ignis-helpers';

const jwtSecret = applicationEnvironment.get<string>('APP_ENV_JWT_SECRET');
```

> [!TIP]
> For most applications, the singleton is all you need. It is created once at module load and shares the same filtered environment across your entire app.

### Custom Instance

If you need a different prefix or a custom set of environment variables, construct your own instance.

```typescript
import { ApplicationEnvironment } from '@venizia/ignis-helpers';

const customEnv = new ApplicationEnvironment({
  prefix: 'MY_APP_ENV',
  envs: process.env,
});

const host = customEnv.get<string>('MY_APP_ENV_SERVER_HOST');
```

#### Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `prefix` | `string` | -- (required) | Only keys starting with this prefix are included |
| `envs` | `Record<string, string \| number \| undefined>` | -- (required) | The environment object to filter (typically `process.env`) |

The default singleton uses `process.env.APPLICATION_ENV_PREFIX ?? 'APP_ENV'` as the prefix and `process.env` as the environment source.

## Usage

### Reading Variables

Use `get<ReturnType>(key)` to retrieve a typed environment variable. Only keys matching the configured prefix are available.

```typescript
import { applicationEnvironment } from '@venizia/ignis-helpers';

const jwtSecret = applicationEnvironment.get<string>('APP_ENV_JWT_SECRET');
const serverPort = applicationEnvironment.get<string>('APP_ENV_SERVER_PORT');
```

> [!WARNING]
> `get<T>()` performs a TypeScript type cast, not a runtime conversion. All `process.env` values are strings. If the raw value is `"3000"`, `get<number>()` still returns the string at runtime. Parse it yourself if needed.

### Setting Variables

Use `set<ValueType>(key, value)` to add or override a variable at runtime.

```typescript
applicationEnvironment.set('APP_ENV_FEATURE_FLAG', 'enabled');
```

### Listing Keys

Use `keys()` to retrieve all filtered environment variable keys.

```typescript
const allKeys = applicationEnvironment.keys();
// e.g. ['APP_ENV_SERVER_HOST', 'APP_ENV_SERVER_PORT', 'APP_ENV_JWT_SECRET']
```

### Checking Development Mode

Use `isDevelopment()` to check if `process.env.NODE_ENV` is `'development'`.

```typescript
if (applicationEnvironment.isDevelopment()) {
  // Enable verbose logging, seed data, etc.
}
```

### Environment Stage Detection

The `Environment` class provides static helpers for checking the current `NODE_ENV`.

```typescript
import { Environment } from '@venizia/ignis-helpers';

// Read the current stage (falls back to 'development' if NODE_ENV is unset)
console.log(Environment.current);

// Check a specific stage
if (Environment.is({ name: 'staging' })) {
  // Staging-only behavior
}
```

#### Available Stages

| Constant | Value |
|----------|-------|
| `Environment.LOCAL` | `'local'` |
| `Environment.DEBUG` | `'debug'` |
| `Environment.DEVELOPMENT` | `'development'` |
| `Environment.ALPHA` | `'alpha'` |
| `Environment.BETA` | `'beta'` |
| `Environment.STAGING` | `'staging'` |
| `Environment.PRODUCTION` | `'production'` |

All stages are collected in `Environment.COMMON_ENVS` (a `Set<string>`), which is used internally by the Logger to determine whether debug logging should be active.

### Configuring the Prefix

The default singleton reads `APPLICATION_ENV_PREFIX` from `process.env` to determine its prefix. Set this variable **before** any import of `@venizia/ignis-helpers`.

```
APPLICATION_ENV_PREFIX=MY_APP_ENV

MY_APP_ENV_SERVER_HOST=0.0.0.0
MY_APP_ENV_SERVER_PORT=3000
```

### Integration with BaseApplication

The `applicationEnvironment` singleton is used by the framework's `BaseApplication` during startup to validate that all prefixed environment variables have non-empty values. If any key has an empty value, the application throws an error unless `ALLOW_EMPTY_ENV_VALUE` is set to a truthy value.

```typescript
// This validation runs automatically during application initialization.
// To allow empty values, set in your environment:
ALLOW_EMPTY_ENV_VALUE=true
```

## Troubleshooting

### `get()` returns `undefined`

**Cause:** The key does not start with the configured prefix, so it was filtered out during construction.

**Fix:** Ensure your `.env` keys use the correct prefix:

```
# Wrong -- missing prefix
SERVER_PORT=3000

# Correct -- matches default prefix
APP_ENV_SERVER_PORT=3000
```

### Custom prefix not taking effect

**Cause:** `APPLICATION_ENV_PREFIX` must be set **before** the module loads. If it is set after import, the singleton is already constructed with the default `APP_ENV`.

**Fix:** Set the prefix in your `.env` file or at process start, before any import of `@venizia/ignis-helpers`:

```
APPLICATION_ENV_PREFIX=MY_APP_ENV
```

### `get<number>()` returns a string

**Cause:** `get<T>()` performs a TypeScript type cast, not a runtime conversion. All `process.env` values are strings.

**Fix:** Parse the value explicitly:

```typescript
const port = Number(applicationEnvironment.get<string>('APP_ENV_SERVER_PORT'));
```

### `[validateEnvs] Invalid Application Environment! Key: {key} | Value: {value}`

**Cause:** During application startup, `BaseApplication.validateEnvs()` found a prefixed environment key with an empty or undefined value.

**Fix:** Either provide a value for the key in your `.env` file, or allow empty values by setting:

```
ALLOW_EMPTY_ENV_VALUE=true
```

## See Also

- **Guides:**
  - [Application](/guides/core-concepts/application/) -- Environment validation during startup

- **Other Helpers:**
  - [Helpers Index](../index) -- All available helpers
  - [Logger](/references/helpers/logger/) -- Uses `Environment.COMMON_ENVS` for debug log filtering
