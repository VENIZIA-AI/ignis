# Configuration Reference

Configuration options and environment variables for Ignis applications.

## Quick Reference

| Category | Purpose | Key Variables |
|----------|---------|---------------|
| Application | App identity and timezone | `APP_ENV_APPLICATION_NAME`, `APP_ENV_APPLICATION_TIMEZONE` |
| Server | HTTP server settings | `APP_ENV_SERVER_HOST`, `APP_ENV_SERVER_PORT` |
| Database | PostgreSQL connection | `APP_ENV_POSTGRES_HOST`, `APP_ENV_POSTGRES_DATABASE` |
| Authentication | JWT tokens and secrets | `APP_ENV_JWT_SECRET`, `APP_ENV_APPLICATION_SECRET` |
| Logging | Log file paths and transports | `APP_ENV_LOGGER_FOLDER_PATH` |
| Storage | MinIO/S3 file storage | `APP_ENV_MINIO_HOST`, `APP_ENV_MINIO_ACCESS_KEY` |
| Mail | SMTP email sending | `APP_ENV_MAIL_HOST`, `APP_ENV_MAIL_USER` |

## Environment Variable Prefix

Ignis uses the `APP_ENV_` prefix to avoid conflicts with system variables:

```bash
# ✅ Ignis variables
APP_ENV_POSTGRES_HOST=localhost

# ❌ Might conflict with system
POSTGRES_HOST=localhost
```

## Quick Start

Create a `.env` file in your project root:

```bash
# .env
APP_ENV_APPLICATION_NAME=my-app
APP_ENV_SERVER_HOST=0.0.0.0
APP_ENV_SERVER_PORT=3000
APP_ENV_POSTGRES_HOST=localhost
APP_ENV_POSTGRES_DATABASE=my_database
```

## What's in This Section

- [Environment Variables](./environment-variables.md) - Complete reference of all `APP_ENV_*` variables

## Configuration Patterns

### 1. Accessing Variables

```typescript
// 1. Direct access
const host = process.env.APP_ENV_POSTGRES_HOST;

// 2. Using helper (recommended)
import { applicationEnvironment, EnvironmentKeys } from '@venizia/ignis';
const host = applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_POSTGRES_HOST);
```

### 2. Environment Files

```
project/
├── .env                 # Default (development)
├── .env.local           # Local overrides (gitignored)
├── .env.production      # Production values
└── .env.example         # Template (committed)
```

### 3. Validation on Startup

Ignis validates required variables on startup. Missing values cause clear error messages.

> **Related:** [Environment Variables Reference](./environment-variables.md) | [DataSources Guide](../../guides/core-concepts/persistent/datasources)
