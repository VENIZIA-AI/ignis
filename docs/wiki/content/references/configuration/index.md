# Configuration Reference

Configuration options and environment variables for IGNIS applications.

## Quick Reference

| Category | Purpose | Key Variables |
|----------|---------|---------------|
| Application | App identity and timezone | `APP_ENV_APPLICATION_NAME`, `APP_ENV_APPLICATION_TIMEZONE` |
| Server | HTTP server settings | `APP_ENV_SERVER_HOST`, `APP_ENV_SERVER_PORT` |
| Database | PostgreSQL connection | `APP_ENV_POSTGRES_HOST`, `APP_ENV_POSTGRES_DATABASE` |
| Authentication | JWT tokens and secrets | `APP_ENV_JWT_SECRET`, `APP_ENV_APPLICATION_SECRET` |
| Logging | Log file paths and transports | `APP_ENV_LOGGER_FOLDER_PATH` |
| Storage | MinIO/S3 file storage (application-level convention) | `APP_ENV_MINIO_HOST`, `APP_ENV_MINIO_ACCESS_KEY` |
| Mail | SMTP email sending (application-level convention) | `APP_ENV_MAIL_HOST`, `APP_ENV_MAIL_USER` |

## Environment Variable Prefix

IGNIS uses the `APP_ENV_` prefix to avoid conflicts with system variables:

```bash
# ✅ IGNIS variables
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
import { applicationEnvironment } from '@venizia/ignis-helpers';
import { EnvironmentKeys } from '@venizia/ignis';
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

IGNIS validates every set `APP_ENV_*` variable on startup and fails with a clear error if any is empty (bypass with `ALLOW_EMPTY_ENV_VALUE=true`). Absent variables are not flagged - components validate their own required inputs.

> **Related:** [Environment Variables Reference](./environment-variables.md) | [DataSources Guide](../../guides/core-concepts/persistent/datasources)

## EnvironmentKeys Class

```typescript
import { EnvironmentKeys } from '@venizia/ignis';
```

| Constant | Description |
|----------|-------------|
| `APP_ENV_APPLICATION_NAME` | Application display name |
| `APP_ENV_APPLICATION_TIMEZONE` | Application timezone (e.g., 'Asia/Ho_Chi_Minh') |
| `APP_ENV_APPLICATION_SECRET` | Application-wide secret key |
| `APP_ENV_JWT_SECRET` | JWT signing secret |
| `APP_ENV_JWT_EXPIRES_IN` | JWT token expiration |
| `APP_ENV_LOGGER_FOLDER_PATH` | Log file output directory |
| `APP_ENV_APPLICATION_ROLES` | Application role definitions |
| `APP_ENV_APPLICATION_DS_MIGRATION` | DataSource name for migrations |
| `APP_ENV_APPLICATION_DS_AUTHORIZE` | DataSource name for authorization |
| `APP_ENV_APPLICATION_DS_OAUTH2` | DataSource name for OAuth2 |
| `APP_ENV_OAUTH2_VIEW_FOLDER` | OAuth2 view templates folder |
| `APP_ENV_SERVER_HOST` | HTTP server host (e.g., '0.0.0.0') |
| `APP_ENV_SERVER_PORT` | HTTP server port (e.g., 3000) |
| `APP_ENV_SERVER_BASE_PATH` | Base URL path prefix |
| `APP_ENV_DATASOURCE_NAME` | Default datasource name |
| `APP_ENV_POSTGRES_HOST` | PostgreSQL host |
| `APP_ENV_POSTGRES_PORT` | PostgreSQL port |
| `APP_ENV_POSTGRES_USERNAME` | PostgreSQL username |
| `APP_ENV_POSTGRES_PASSWORD` | PostgreSQL password |
| `APP_ENV_POSTGRES_DATABASE` | PostgreSQL database name |

Usage:

```typescript
import { applicationEnvironment } from '@venizia/ignis-helpers';
import { EnvironmentKeys } from '@venizia/ignis';

const dbHost = applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_POSTGRES_HOST);
```
