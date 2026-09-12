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
- **`applicationEnvironment` snapshots `process.env` once at import.** It's built from whatever is in `process.env` when `@venizia/ignis-helpers` loads.
- **Late values need an explicit merge.** A value set programmatically at runtime, after that snapshot, won't appear in `.keys()` unless merged in - secret hydration does this, see below.
- **Startup validation is fail-closed on emptiness, not absence.** IGNIS iterates every `APP_ENV_*` key that IS set and throws if its value is empty. It does not require a variable to exist at all.
- **Bypass and per-component checks.** Bypass emptiness validation with `ALLOW_EMPTY_ENV_VALUE=true`. Component-level checks (e.g., the authentication component's `jwtSecret` check) still cover values that must be present.
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

The column that matters is the last one: a constant marked **no** is a naming convention for your
own code, and setting it changes nothing in IGNIS.

| Constant | Description | Read by IGNIS |
|----------|-------------|---------------|
| `APP_ENV_APPLICATION_NAME` | Application display name | yes - `AppConstants.APPLICATION_NAME`, startup banner |
| `APP_ENV_APPLICATION_TIMEZONE` | Application timezone (e.g., `'Asia/Ho_Chi_Minh'`) | yes - `DateUtility` default zone, startup banner |
| `APP_ENV_LOGGER_FOLDER_PATH` | Log file output directory | yes - enables rotating file logs |
| `APP_ENV_SERVER_HOST` | HTTP server host (e.g., `'0.0.0.0'`) | yes - fallback when `configs.host` is absent |
| `APP_ENV_SERVER_PORT` | HTTP server port (e.g., `3000`) | yes - fallback when `configs.port` is absent |
| `APP_ENV_APPLICATION_SECRET` | Application-wide secret key | no |
| `APP_ENV_APPLICATION_ROLES` | Application role definitions | no |
| `APP_ENV_JWT_SECRET` | JWT signing secret | no |
| `APP_ENV_JWT_EXPIRES_IN` | JWT token expiration | no |
| `APP_ENV_OAUTH2_VIEW_FOLDER` | OAuth2 view templates folder | no |
| `APP_ENV_SERVER_BASE_PATH` | Base URL path prefix | no - `configs.path.base` is the real setting |
| `APP_ENV_DATASOURCE_NAME` | Default datasource name | no |
| `APP_ENV_POSTGRES_HOST` | PostgreSQL host | no |
| `APP_ENV_POSTGRES_PORT` | PostgreSQL port | no |
| `APP_ENV_POSTGRES_USERNAME` | PostgreSQL username | no |
| `APP_ENV_POSTGRES_PASSWORD` | PostgreSQL password | no |
| `APP_ENV_POSTGRES_DATABASE` | PostgreSQL database name | no |

The logger reads a further set of `APP_ENV_LOGGER_*` names that `EnvironmentKeys` does not declare -
see [Environment variables](./environment-variables).

## See also

- [Environment Variables Reference](./environment-variables.md) - complete variable list, defaults, and the Secrets & Vault section
- [Secrets & Vault Guide](/guides/core-concepts/secrets-vault) - setup walkthrough
- [Secrets & Vault Reference](/references/base/secrets) - full provider API
- [DataSources Guide](/guides/core-concepts/persistent/datasources) - wiring `APP_ENV_POSTGRES_*` into a DataSource

**Files:**

- [`packages/core-server/src/common/environments.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/common/environments.ts) - `EnvironmentKeys`
- [`packages/helpers/src/modules/env/app-env.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/env/app-env.ts) - `applicationEnvironment`, `Environment`, `ApplicationEnvironment`
- [`packages/kernel/src/base/applications/abstract.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/base/applications/abstract.ts) - `validateEnvs()`, host/port resolution
