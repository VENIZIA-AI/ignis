# Usage

## Reading Variables

Use `get<T>(key)` to retrieve a typed environment variable. Only keys matching the configured prefix are available.

```typescript
import { applicationEnvironment, EnvironmentKeys } from '@venizia/ignis-helpers';

// Get the JWT secret
const jwtSecret = applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_JWT_SECRET);

// Get the server port, parsing it as a number
const serverPort = applicationEnvironment.get<number>(EnvironmentKeys.APP_ENV_SERVER_PORT);
```

> [!NOTE]
> `get<T>()` performs a type cast, not a runtime conversion. If the raw value is a string `"3000"`, `get<number>()` still returns the string -- parse it yourself if needed.

## Setting Variables

Use `set(key, value)` to add or override a variable at runtime.

```typescript
applicationEnvironment.set('APP_ENV_FEATURE_FLAG', 'enabled');
```

## Environment Stage Checking

The `Environment` class provides static helpers for checking the current `NODE_ENV`.

```typescript
import { applicationEnvironment, Environment } from '@venizia/ignis-helpers';

// Check development mode via the singleton
if (applicationEnvironment.isDevelopment()) {
  // Enable verbose logging, seed data, etc.
}

// Check specific stages via the static class
if (Environment.is({ name: 'staging' })) {
  // Staging-only behavior
}

// Read the current stage directly
console.log(Environment.current); // 'development', 'production', etc.
```

### Available Stages

| Constant | Value |
|----------|-------|
| `Environment.LOCAL` | `'local'` |
| `Environment.DEBUG` | `'debug'` |
| `Environment.DEVELOPMENT` | `'development'` |
| `Environment.ALPHA` | `'alpha'` |
| `Environment.BETA` | `'beta'` |
| `Environment.STAGING` | `'staging'` |
| `Environment.PRODUCTION` | `'production'` |

## Configuring the Prefix

The prefix for the environment variables can be configured by setting the `APPLICATION_ENV_PREFIX` variable in your environment.

**Example `.env` file:**

```
APPLICATION_ENV_PREFIX=MY_APP_ENV

# Now, your application variables should use the new prefix
MY_APP_ENV_SERVER_HOST=0.0.0.0
MY_APP_ENV_SERVER_PORT=3000
```
