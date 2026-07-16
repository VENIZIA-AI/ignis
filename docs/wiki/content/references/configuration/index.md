# Configuration Reference

How IGNIS applications read configuration - the `APP_ENV_` variable convention, the `EnvironmentKeys` constants, and where to look up every value.

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

**Full list:** [Environment Variables Reference](./environment-variables.md) - every `APP_ENV_*` variable, its default, and whether it's required.

## In one example

IGNIS uses the `APP_ENV_` prefix to avoid conflicts with system variables. Create a `.env` file in your project root:

```bash
# ✅ IGNIS variables
APP_ENV_POSTGRES_HOST=localhost

# ❌ Might conflict with system variables
POSTGRES_HOST=localhost
```

```bash
# .env
APP_ENV_APPLICATION_NAME=my-app
APP_ENV_SERVER_HOST=0.0.0.0
APP_ENV_SERVER_PORT=3000
APP_ENV_POSTGRES_HOST=localhost
APP_ENV_POSTGRES_DATABASE=my_database
```

Read a value either directly or through the `applicationEnvironment` helper:

```typescript
// 1. Direct access
const host = process.env.APP_ENV_POSTGRES_HOST;

// 2. Using the helper (recommended)
import { applicationEnvironment } from '@venizia/ignis-helpers';
import { EnvironmentKeys } from '@venizia/ignis';
const host = applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_POSTGRES_HOST);
```

## How it works

- **One prefix, layered files.** Everything IGNIS reads is prefixed `APP_ENV_` (configurable - see the [Environment Variables Reference](./environment-variables.md#custom-environment-prefix)). Layer `.env`, `.env.local`, and `.env.{NODE_ENV}` the same way any dotenv-based tool does.
- **`applicationEnvironment` snapshots `process.env` once at import.** It's built from whatever is in `process.env` when `@venizia/ignis-helpers` loads - values arriving after that (e.g., set programmatically at runtime) won't appear in `.keys()` unless merged in explicitly (secret hydration does this - see below).
- **Startup validation is fail-closed on emptiness, not absence.** IGNIS iterates every `APP_ENV_*` key that IS set and throws if its value is empty; it does not require a variable to exist at all. Bypass with `ALLOW_EMPTY_ENV_VALUE=true`. Component-level checks (e.g., the authentication component's `jwtSecret` check) cover values that must be present.
- **Secrets don't have to live in a file.** IGNIS can hydrate `APP_ENV_*` keys from a vault at boot, before datasources are configured - see [Secrets & Vault](./environment-variables.md#secrets-vault).

## Common tasks

### Access a variable in code
Prefer `applicationEnvironment.get()` over `process.env` directly - it stays in sync when secrets are hydrated from a vault.

```typescript
import { applicationEnvironment } from '@venizia/ignis-helpers';
import { EnvironmentKeys } from '@venizia/ignis';

const dbHost = applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_POSTGRES_HOST);
```

### Add a per-environment file
```
project/
├── .env                 # Default (development)
├── .env.local           # Local overrides (gitignored)
├── .env.production      # Production values
└── .env.example         # Template (committed)
```

### Bypass startup validation during local prototyping
```bash
ALLOW_EMPTY_ENV_VALUE=true
```
Not recommended once real secrets are wired in - see [Validation](./environment-variables.md#validation).

### Look up every variable's default and requirement
See the [Environment Variables Reference](./environment-variables.md) for the full table, grouped by Application, Server, Database, Authentication, Logging, Storage, Mail, and Secrets & Vault.

## Reference

### EnvironmentKeys class
```typescript
import { EnvironmentKeys } from '@venizia/ignis';
```

| Constant | Description |
|----------|-------------|
| `APP_ENV_APPLICATION_NAME` | Application display name |
| `APP_ENV_APPLICATION_TIMEZONE` | Application timezone (e.g., `'Asia/Ho_Chi_Minh'`) |
| `APP_ENV_APPLICATION_SECRET` | Application-wide secret key |
| `APP_ENV_JWT_SECRET` | JWT signing secret |
| `APP_ENV_JWT_EXPIRES_IN` | JWT token expiration |
| `APP_ENV_LOGGER_FOLDER_PATH` | Log file output directory |
| `APP_ENV_APPLICATION_ROLES` | Application role definitions |
| `APP_ENV_APPLICATION_DS_MIGRATION` | DataSource name for migrations |
| `APP_ENV_APPLICATION_DS_AUTHORIZE` | DataSource name for authorization |
| `APP_ENV_APPLICATION_DS_OAUTH2` | DataSource name for OAuth2 |
| `APP_ENV_OAUTH2_VIEW_FOLDER` | OAuth2 view templates folder |
| `APP_ENV_SERVER_HOST` | HTTP server host (e.g., `'0.0.0.0'`) |
| `APP_ENV_SERVER_PORT` | HTTP server port (e.g., `3000`) |
| `APP_ENV_SERVER_BASE_PATH` | Base URL path prefix |
| `APP_ENV_DATASOURCE_NAME` | Default datasource name |
| `APP_ENV_POSTGRES_HOST` | PostgreSQL host |
| `APP_ENV_POSTGRES_PORT` | PostgreSQL port |
| `APP_ENV_POSTGRES_USERNAME` | PostgreSQL username |
| `APP_ENV_POSTGRES_PASSWORD` | PostgreSQL password |
| `APP_ENV_POSTGRES_DATABASE` | PostgreSQL database name |

## See also

- [Environment Variables Reference](./environment-variables.md) - complete variable list, defaults, and the Secrets & Vault section
- [Secrets & Vault Guide](/guides/core-concepts/secrets-vault) - setup walkthrough
- [Secrets & Vault Reference](/references/base/secrets) - full provider API
- [DataSources Guide](/guides/core-concepts/persistent/datasources) - wiring `APP_ENV_POSTGRES_*` into a DataSource

**Files:**

- [`packages/core/src/common/environments.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/common/environments.ts) - `EnvironmentKeys`
- [`packages/helpers/src/modules/env/app-env.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/env/app-env.ts) - `applicationEnvironment`, `Environment`, `ApplicationEnvironment`
- [`packages/core/src/base/applications/abstract.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/base/applications/abstract.ts) - `validateEnvs()`, host/port resolution
