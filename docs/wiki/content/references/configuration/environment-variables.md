# Environment Variables Reference

Complete reference of all environment variables used by IGNIS framework.


## Overview

IGNIS uses the `APP_ENV_` prefix for all framework-specific environment variables. This prevents conflicts with system variables like `PATH`, `HOME`, etc.

```bash
# ✅ IGNIS variables
APP_ENV_POSTGRES_HOST=localhost

# ❌ Might conflict with system
POSTGRES_HOST=localhost
```

### Accessing Environment Variables

```typescript
// Direct access
const host = process.env.APP_ENV_POSTGRES_HOST;

// Using applicationEnvironment helper (recommended)
import { applicationEnvironment } from '@venizia/ignis-helpers';
import { EnvironmentKeys } from '@venizia/ignis';
const host = applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_POSTGRES_HOST);
```


## Quick Start Template

Create a `.env` file in your project root:

```bash
# .env

# =====================
# APPLICATION
# =====================
APP_ENV_APPLICATION_NAME=my-app
APP_ENV_APPLICATION_TIMEZONE=UTC

# =====================
# SERVER
# =====================
APP_ENV_SERVER_HOST=0.0.0.0
APP_ENV_SERVER_PORT=3000
APP_ENV_SERVER_BASE_PATH=/api

# =====================
# DATABASE (PostgreSQL)
# =====================
APP_ENV_POSTGRES_HOST=localhost
APP_ENV_POSTGRES_PORT=5432
APP_ENV_POSTGRES_USERNAME=postgres
APP_ENV_POSTGRES_PASSWORD=your_password_here
APP_ENV_POSTGRES_DATABASE=my_database

# =====================
# AUTHENTICATION
# =====================
APP_ENV_APPLICATION_SECRET=generate-a-strong-random-secret
APP_ENV_JWT_SECRET=generate-another-strong-random-secret
APP_ENV_JWT_EXPIRES_IN=86400

# =====================
# LOGGING
# =====================
APP_ENV_LOGGER_FOLDER_PATH=./logs
```

> **Important:** Add `.env` to your `.gitignore` to prevent committing secrets.


## Application Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `APP_ENV_APPLICATION_NAME` | No | `APP` | Application name, used in logs and identification |
| `APP_ENV_APPLICATION_TIMEZONE` | No | `Asia/Ho_Chi_Minh` | Default timezone for date operations |
| `APP_ENV_APPLICATION_ROLES` | No | - | Comma-separated list of application roles |

### Example

```bash
APP_ENV_APPLICATION_NAME=ignis-backend
APP_ENV_APPLICATION_TIMEZONE=UTC
APP_ENV_APPLICATION_ROLES=api,worker
```


## Server Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `APP_ENV_SERVER_HOST` | No | `localhost` | Server bind address |
| `APP_ENV_SERVER_PORT` | No | `3000` | Server port |
| `APP_ENV_SERVER_BASE_PATH` | No | - | Base path convention (`EnvironmentKeys` constant; not read by the framework itself) |
| `HOST` | No | - | Alternative to `APP_ENV_SERVER_HOST` (takes precedence) |
| `PORT` | No | - | Alternative to `APP_ENV_SERVER_PORT` (takes precedence) |

### Example

```bash
# Development
APP_ENV_SERVER_HOST=localhost
APP_ENV_SERVER_PORT=3000
APP_ENV_SERVER_BASE_PATH=/api

# Production
APP_ENV_SERVER_HOST=0.0.0.0
APP_ENV_SERVER_PORT=8080
APP_ENV_SERVER_BASE_PATH=/v1/api
```

### Priority Order

The server host/port resolution uses this priority (`packages/core/src/base/applications/abstract.ts`):
1. Explicit config passed to the application constructor
2. `HOST`/`PORT` variables (for cloud platforms)
3. `APP_ENV_SERVER_HOST`/`APP_ENV_SERVER_PORT` variables
4. Default values (`localhost`/`3000`)


## Database Variables (PostgreSQL)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `APP_ENV_POSTGRES_HOST` | Yes* | `localhost` | Database host |
| `APP_ENV_POSTGRES_PORT` | No | `5432` | Database port |
| `APP_ENV_POSTGRES_USERNAME` | Yes* | `postgres` | Database username |
| `APP_ENV_POSTGRES_PASSWORD` | Yes* | - | Database password |
| `APP_ENV_POSTGRES_DATABASE` | Yes* | - | Database name |
| `APP_ENV_DATASOURCE_NAME` | No | - | DataSource identifier |

*Required when using PostgreSQL DataSource.

### Example

```bash
# Local development
APP_ENV_POSTGRES_HOST=localhost
APP_ENV_POSTGRES_PORT=5432
APP_ENV_POSTGRES_USERNAME=postgres
APP_ENV_POSTGRES_PASSWORD=password
APP_ENV_POSTGRES_DATABASE=my_app_dev

# Production
APP_ENV_POSTGRES_HOST=db.example.com
APP_ENV_POSTGRES_PORT=5432
APP_ENV_POSTGRES_USERNAME=app_user
APP_ENV_POSTGRES_PASSWORD=strong_password_here
APP_ENV_POSTGRES_DATABASE=my_app_prod
```

### DataSource Configuration

```typescript
@datasource({ driver: 'node-postgres' })
export class PostgresDataSource extends BaseDataSource {
  constructor() {
    super({
      name: PostgresDataSource.name,
      config: {
        host: process.env.APP_ENV_POSTGRES_HOST ?? 'localhost',
        port: +(process.env.APP_ENV_POSTGRES_PORT ?? 5432),
        database: process.env.APP_ENV_POSTGRES_DATABASE ?? 'mydb',
        user: process.env.APP_ENV_POSTGRES_USERNAME ?? 'postgres',
        password: process.env.APP_ENV_POSTGRES_PASSWORD ?? '',
      },
    });
  }
}
```


## Authentication Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `APP_ENV_APPLICATION_SECRET` | Yes* | - | Secret for encrypting JWT payload |
| `APP_ENV_JWT_SECRET` | Yes* | - | Secret for signing JWT tokens |
| `APP_ENV_JWT_EXPIRES_IN` | No | - | Token expiration in seconds (e.g., `86400` = 24h) |

*Required by convention when using the authentication component - see below.

### Security Requirements

The `AuthenticateComponent` receives its secrets programmatically via the `jwtOptions` binding (`jwtSecret`, `getTokenExpiresFn`), not by reading these environment variables directly. These `EnvironmentKeys` constants are the conventional way for your application to supply those values. The component throws at startup if `jwtSecret` is missing or left at the placeholder value - so wiring it from an unset environment variable will fail the boot.

### Generate Strong Secrets

```bash
# Generate random secrets
openssl rand -base64 32  # For APP_ENV_APPLICATION_SECRET
openssl rand -base64 32  # For APP_ENV_JWT_SECRET
```

### Example

```bash
APP_ENV_APPLICATION_SECRET=K8sX2mP9qR4tV7wZ1aD3fG6hJ9kL2nO5
APP_ENV_JWT_SECRET=M3nB6vC9xZ2aS5dF8gH1jK4lP7oI0uY
APP_ENV_JWT_EXPIRES_IN=86400
```

### Common Expiration Values

| Value | Duration |
|-------|----------|
| `3600` | 1 hour |
| `86400` | 24 hours (1 day) |
| `604800` | 7 days |
| `2592000` | 30 days |


## Logging Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `APP_ENV_LOGGER_FOLDER_PATH` | No | `./` | Directory for log files |
| `APP_ENV_LOGGER_FORMAT` | No | `text` | Log output format |
| `APP_ENV_LOGGER_FILE_FREQUENCY` | No | `1h` | Log file rotation frequency |
| `APP_ENV_LOGGER_FILE_MAX_SIZE` | No | `100m` | Max size per log file |
| `APP_ENV_LOGGER_FILE_MAX_FILES` | No | `5d` | Log file retention |
| `APP_ENV_LOGGER_FILE_DATE_PATTERN` | No | `YYYYMMDD_HH` | Rotated file date pattern |
| `APP_ENV_LOGGER_DGRAM_HOST` | No | - | UDP log transport host |
| `APP_ENV_LOGGER_DGRAM_PORT` | No | - | UDP log transport port |
| `APP_ENV_LOGGER_DGRAM_LABEL` | No | - | Label for UDP logs |
| `APP_ENV_LOGGER_DGRAM_LEVELS` | No | - | Comma-separated log levels for UDP |
| `APP_ENV_EXTRA_LOG_ENVS` | No | - | Extra env vars to include in logs |

### Example

```bash
# File logging
APP_ENV_LOGGER_FOLDER_PATH=./app_data/logs

# UDP logging (for log aggregators)
APP_ENV_LOGGER_DGRAM_HOST=127.0.0.1
APP_ENV_LOGGER_DGRAM_PORT=5000
APP_ENV_LOGGER_DGRAM_LABEL=my-app
APP_ENV_LOGGER_DGRAM_LEVELS=error,warn,info
```


## Storage Variables (MinIO/S3)

> [!NOTE]
> These are application-level conventions (used by the `vert` reference application), not variables read by the framework. `MinioHelper` and the StaticAsset component receive their configuration programmatically - your application wires these values in.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `APP_ENV_MINIO_HOST` | Yes* | - | MinIO/S3 endpoint |
| `APP_ENV_MINIO_API_PORT` | No | `9000` | MinIO API port |
| `APP_ENV_MINIO_ACCESS_KEY` | Yes* | - | Access key |
| `APP_ENV_MINIO_SECRET_KEY` | Yes* | - | Secret key |
| `APP_ENV_MINIO_USE_SSL` | No | `false` | Enable SSL |

*Required (by application convention) when wiring MinIO-backed storage.

### Example

```bash
# Local MinIO
APP_ENV_MINIO_HOST=localhost
APP_ENV_MINIO_API_PORT=9000
APP_ENV_MINIO_ACCESS_KEY=minioadmin
APP_ENV_MINIO_SECRET_KEY=minioadmin
APP_ENV_MINIO_USE_SSL=false

# AWS S3
APP_ENV_MINIO_HOST=s3.amazonaws.com
APP_ENV_MINIO_API_PORT=443
APP_ENV_MINIO_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE
APP_ENV_MINIO_SECRET_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
APP_ENV_MINIO_USE_SSL=true
```


## Mail Variables

> [!NOTE]
> These are application-level conventions, not variables read by the framework. The Mail component's transporter receives its SMTP/OAuth2 configuration programmatically - your application wires these values in.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `APP_ENV_MAIL_HOST` | Yes* | - | SMTP host (e.g., `smtp.gmail.com`) |
| `APP_ENV_MAIL_PORT` | No | - | SMTP port (e.g., `465`) |
| `APP_ENV_MAIL_SECURE` | No | - | Use TLS |
| `APP_ENV_MAIL_USER` | Yes* | - | SMTP username/email |
| `APP_ENV_MAIL_CLIENT_ID` | Yes* | - | OAuth2 client ID |
| `APP_ENV_MAIL_CLIENT_SECRET` | Yes* | - | OAuth2 client secret |
| `APP_ENV_MAIL_REFRESH_TOKEN` | Yes* | - | OAuth2 refresh token |

*Required (by application convention) when wiring the Mail component with OAuth2.

### Example (Gmail with OAuth2)

```bash
APP_ENV_MAIL_HOST=smtp.gmail.com
APP_ENV_MAIL_PORT=465
APP_ENV_MAIL_SECURE=true
APP_ENV_MAIL_USER=your-email@gmail.com
APP_ENV_MAIL_CLIENT_ID=your-oauth2-client-id
APP_ENV_MAIL_CLIENT_SECRET=your-oauth2-client-secret
APP_ENV_MAIL_REFRESH_TOKEN=your-oauth2-refresh-token
```


## DataSource Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `APP_ENV_APPLICATION_DS_MIGRATION` | No | - | DataSource name for migrations |
| `APP_ENV_APPLICATION_DS_AUTHORIZE` | No | - | DataSource name for auth |
| `APP_ENV_APPLICATION_DS_OAUTH2` | No | - | DataSource name for OAuth2 |


## Debug Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DEBUG` | No | - | Enable debug mode |
| `NODE_ENV` | No | `development` | Environment mode |
| `ALLOW_EMPTY_ENV_VALUE` | No | `false` | Allow empty env values |

### Example

```bash
# Development
NODE_ENV=development
DEBUG=true

# Production
NODE_ENV=production
```


## Environment-Specific Files

Create environment-specific `.env` files:

```
project/
├── .env                 # Default (development)
├── .env.local           # Local overrides (gitignored)
├── .env.production      # Production values
├── .env.test            # Test environment
└── .env.example         # Template for team (committed)
```

### Loading Priority

1. `.env.local` (highest priority, gitignored)
2. `.env.{NODE_ENV}` (e.g., `.env.production`)
3. `.env` (default)


## Custom Environment Prefix

You can customize the prefix from `APP_ENV` to something else via the `APPLICATION_ENV_PREFIX` variable. It is read once when `@venizia/ignis-helpers` loads, so set it in the shell (or before any framework import):

```bash
# Set custom prefix
APPLICATION_ENV_PREFIX=MY_APP

# Now use MY_APP_ prefix
MY_APP_POSTGRES_HOST=localhost
```


## Validation

On startup, IGNIS iterates every `APP_ENV_*` (prefixed) variable that is set and throws if any has an empty value (`validateEnvs` in `packages/core/src/base/applications/abstract.ts`). It does not check for variables that are absent entirely - component-level validation (e.g., the authentication component's `jwtSecret` check) covers required values.

### Disable Validation

```bash
# Allow empty env values (not recommended for production)
ALLOW_EMPTY_ENV_VALUE=true
```


## Security Best Practices

1. **Never commit `.env` files** - Add to `.gitignore`
2. **Use strong secrets** - Generate with `openssl rand -base64 32`
3. **Rotate secrets regularly** - Especially `JWT_SECRET`
4. **Use different values per environment** - Don't reuse dev secrets in production
5. **Use secret managers in production** - AWS Secrets Manager, HashiCorp Vault, etc.


## Complete .env.example

```bash
# ===========================================
# IGNIS ENVIRONMENT VARIABLES
# ===========================================
# Copy this file to .env and fill in values

# APPLICATION
APP_ENV_APPLICATION_NAME=my-app
APP_ENV_APPLICATION_TIMEZONE=UTC

# SERVER
APP_ENV_SERVER_HOST=0.0.0.0
APP_ENV_SERVER_PORT=3000
APP_ENV_SERVER_BASE_PATH=/api

# DATABASE
APP_ENV_POSTGRES_HOST=localhost
APP_ENV_POSTGRES_PORT=5432
APP_ENV_POSTGRES_USERNAME=postgres
APP_ENV_POSTGRES_PASSWORD=
APP_ENV_POSTGRES_DATABASE=

# AUTHENTICATION (Required for auth component)
APP_ENV_APPLICATION_SECRET=
APP_ENV_JWT_SECRET=
APP_ENV_JWT_EXPIRES_IN=86400

# LOGGING
APP_ENV_LOGGER_FOLDER_PATH=./logs

# STORAGE (Optional - MinIO/S3)
# APP_ENV_MINIO_HOST=localhost
# APP_ENV_MINIO_API_PORT=9000
# APP_ENV_MINIO_ACCESS_KEY=
# APP_ENV_MINIO_SECRET_KEY=
# APP_ENV_MINIO_USE_SSL=false

# MAIL (Optional)
# APP_ENV_MAIL_HOST=smtp.gmail.com
# APP_ENV_MAIL_PORT=465
# APP_ENV_MAIL_USER=
# APP_ENV_MAIL_CLIENT_ID=
# APP_ENV_MAIL_CLIENT_SECRET=
# APP_ENV_MAIL_REFRESH_TOKEN=
```
