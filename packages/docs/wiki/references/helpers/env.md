# Environment Helper

Structured access to application-specific environment variables with prefix filtering.

## Quick Reference

| Feature | Description |
|---------|-------------|
| **Singleton** | `applicationEnvironment` - auto-initialized at startup |
| **Prefix** | Default `APP_ENV_` (customizable via `APPLICATION_ENV_PREFIX`) |
| **Type-safe** | `get<T>(key)` with type inference |
| **Isolation** | Filters `process.env` to prevent conflicts |

### Common Methods

| Method | Purpose | Example |
|--------|---------|---------|
| `get<T>(key)` | Get typed environment variable | `get<string>(EnvironmentKeys.APP_ENV_JWT_SECRET)` |
| `isDevelopment()` | Check if dev environment | `if (env.isDevelopment()) { ... }` |

### Key Features

-   **Prefix-based Filtering**: Isolates app vars (e.g., `APP_ENV_*`)
-   **Type-safe Access**: `get<T>()` with type inference
-   **Centralized Management**: Single consistent access point

## Usage

You can import the `applicationEnvironment` instance and use it to retrieve your configuration values.

### Getting Environment Variables

```typescript
import { applicationEnvironment, EnvironmentKeys } from '@venizia/ignis';

// Get the JWT secret
const jwtSecret = applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_JWT_SECRET);

// Get the server port, parsing it as a number
const serverPort = applicationEnvironment.get<number>(EnvironmentKeys.APP_ENV_SERVER_PORT);
```

### Checking the Current Environment

You can use the `isDevelopment()` method to check if the application is running in a development environment.

```typescript
import { applicationEnvironment } from '@venizia/ignis';

if (applicationEnvironment.isDevelopment()) {
  // Do something only in development
}
```

## Configuration

The prefix for the environment variables can be configured by setting the `APPLICATION_ENV_PREFIX` variable in your environment.

**Example `.env` file:**

```
APPLICATION_ENV_PREFIX=MY_APP_ENV

# Now, your application variables should use the new prefix
MY_APP_ENV_SERVER_HOST=0.0.0.0
MY_APP_ENV_SERVER_PORT=3000
```

## See Also

- **Related Concepts:**
  - [Application](/guides/core-concepts/application/) - Environment validation
  - [DataSources](/guides/core-concepts/persistent/datasources) - Database configuration

- **Other Helpers:**
  - [Helpers Index](./index) - All available helpers

- **References:**
  - [Environment Variables](/references/configuration/environment-variables) - Complete environment reference

- **Best Practices:**
  - [Security Guidelines](/best-practices/security-guidelines) - Environment variable security
  - [Deployment Strategies](/best-practices/deployment-strategies) - Environment management
