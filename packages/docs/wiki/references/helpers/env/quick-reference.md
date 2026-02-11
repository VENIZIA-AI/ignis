# Quick Reference

| Item | Value |
|------|-------|
| **Package** | `@venizia/ignis-helpers` |
| **Classes** | `ApplicationEnvironment`, `Environment` |
| **Singleton** | `applicationEnvironment` - auto-initialized at startup |
| **Prefix** | Default `APP_ENV_` (customizable via `APPLICATION_ENV_PREFIX`) |
| **Runtimes** | Both |

## Common Methods

| Method | Purpose | Example |
|--------|---------|---------|
| `get<T>(key)` | Get typed environment variable | `get<string>(EnvironmentKeys.APP_ENV_JWT_SECRET)` |
| `set<T>(key, value)` | Set environment variable | `set('APP_ENV_PORT', 3000)` |
| `isDevelopment()` | Check if dev environment | `if (env.isDevelopment()) { ... }` |
| `keys()` | List all filtered keys | `env.keys()` |
| `Environment.current` | Get current `NODE_ENV` | `Environment.current` |
| `Environment.is({ name })` | Check specific environment | `Environment.is({ name: 'staging' })` |

## Key Features

- **Prefix-based Filtering**: Isolates app vars (e.g., `APP_ENV_*`)
- **Type-safe Access**: `get<T>()` with type inference
- **Centralized Management**: Single consistent access point

::: details Import Paths
```typescript
// Singleton instance
import { applicationEnvironment } from '@venizia/ignis-helpers';

// Classes
import { ApplicationEnvironment, Environment } from '@venizia/ignis-helpers';

// Key constants
import { EnvironmentKeys } from '@venizia/ignis-helpers';
```
:::
