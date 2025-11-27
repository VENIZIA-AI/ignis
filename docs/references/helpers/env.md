# Environment Helper

The Environment helper provides a structured way to access and manage application-specific environment variables.

## Overview

The `applicationEnvironment` is a singleton instance that is automatically initialized when your application starts. It filters the global `process.env` to only include variables that start with a specific prefix (defaulting to `APP_ENV`), preventing conflicts with system-level variables.

### Key Features

-   **Prefix-based Filtering:** Isolates application-specific environment variables.
-   **Type-safe Access:** Provides a `get<T>()` method for retrieving variables with type inference.
-   **Centralized Management:** Offers a single, consistent way to access environment variables throughout your application.

## Usage

You can import the `applicationEnvironment` instance and use it to retrieve your configuration values.

### Getting Environment Variables

```typescript
import { applicationEnvironment, EnvironmentKeys } from '@vez/ignis';

// Get the JWT secret
const jwtSecret = applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_JWT_SECRET);

// Get the server port, parsing it as a number
const serverPort = applicationEnvironment.get<number>(EnvironmentKeys.APP_ENV_SERVER_PORT);
```

### Checking the Current Environment

You can use the `isDevelopment()` method to check if the application is running in a development environment.

```typescript
import { applicationEnvironment } from '@vez/ignis';

if (applicationEnvironment.isDevelopment()) {
  // Do something only in development
}
```

## Configuration

The prefix for the environment variables can be configured by setting the `APPLICATION_ENV_PREFIX` variable in your environment.

**Example `.env` file:**

```env
APPLICATION_ENV_PREFIX=MY_APP_ENV

# Now, your application variables should use the new prefix
MY_APP_ENV_SERVER_HOST=0.0.0.0
MY_APP_ENV_SERVER_PORT=3000
```
