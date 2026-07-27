---
title: Secrets & Vault
description: Load configuration and credentials from a vault, hydrate them at boot, and rotate database credentials without a restart
difficulty: intermediate
---

# Secrets & Vault

IGNIS can load configuration and credentials from a vault instead of reading `process.env` directly. This guide shows how to enable it, how to consume secrets in your code, and how to rotate dynamic database credentials into a live pool without restarting the server.

> [!TIP] You do not have to do anything to keep working as before
> Until you override `registerSecrets()`, IGNIS uses the `system-envs` provider, which reads `process.env`. Everything below is opt-in.

## The Mental Model

Secrets reach your app through two paths:

- **Hydrate** - at boot, IGNIS fetches secrets and merges them into `process.env` / `Envs`. Existing code that reads `process.env.APP_ENV_*` keeps working with no change.
- **Provider** - the resolved provider is bound in the container at `@app/config`. Inject it wherever you need on-demand reads, dynamic credentials, or rotation.

You configure both in one place: a `registerSecrets()` override on your application class.

## Enabling a Provider

Override `registerSecrets()` on your `Application extends BaseApplication`.

### HashiCorp Vault

Recommended for enterprise: KV v2 static secrets plus dynamic database credentials with automatic rotation.

```typescript
import { SecretProviders, VaultAuthMethods } from '@venizia/ignis-helpers';

export class Application extends BaseApplication {
  override registerSecrets() {
    return {
      provider: SecretProviders.HASHICORP_VAULT,

      config: {
        endpoint: 'https://vault.internal:8200',
        // Dev: a raw token. Production: AppRole or Kubernetes.
        auth: { method: VaultAuthMethods.APP_ROLE, roleId, secretId },
        // or: { method: VaultAuthMethods.TOKEN, token }
        // or: { method: VaultAuthMethods.KUBERNETES, role: 'my-app' }
      },

      // Static KV v2 secrets -> merged into Envs once at boot.
      hydrate: [
        { path: 'secret/data/myapp/config' },                    // keys land as-is
        { path: 'secret/data/myapp/db', prefix: 'APP_ENV_DS_' }, // optional prefix
        // { path: 'secret/data/myapp/db', keys: { password: 'APP_ENV_DS_PASSWORD' } },
      ],

      // Dynamic engine secrets -> renewed and rotated automatically.
      lease: [
        { key: 'datasources.PostgresDataSource', path: 'database/creds/app-role' },
      ],
    };
  }
}
```

`node-vault` is an optional peer. Install it in the application that uses this provider:

```bash
bun add node-vault
```

Applications that do not use this provider never need it - not even when compiling a binary with
`Bun.build`. If your application uses this provider **and** compiles a binary, ship `node-vault` in
`node_modules` next to the binary, or inject a ready-made `client` through the helper options.

### Dotenv Vault

An encrypted `.env.vault` file decrypted at runtime with a per-environment `DOTENV_KEY`. Static only.

```typescript
import { SecretProviders } from '@venizia/ignis-helpers';

export class Application extends BaseApplication {
  override registerSecrets() {
    return {
      provider: SecretProviders.DOTENV_VAULT,
      config: { path: '.env.vault', dotenvKey: process.env.DOTENV_KEY },
      hydrate: [{ path: 'ignored' }], // decrypts the file and merges it into Envs
    };
  }
}
```

```bash
bun add @dotenvx/dotenvx
```

### System Env (default)

The default; shown here only to be explicit. Reads `process.env`, no dependencies.

```typescript
override registerSecrets() {
  return { provider: SecretProviders.SYSTEM_ENVS };
}
```

## Addressing and Merging

Each `hydrate` entry resolves a path to a flat key-value object that is merged into `Envs` and `process.env`:

- **Convention** - store the keys in the vault already named `APP_ENV_...` and they merge as-is, no mapping needed.
- **`prefix`** - prepend a string to every merged key.
- **`keys`** - an explicit `vaultKey -> envKey` map for precise control (wins over `prefix`).

When the provider is live, vault values take precedence over `process.env`.

## Reading Secrets in Your Code

Inject the provider bound at `@app/config`.

```typescript
import type { ISecretsHelper } from '@venizia/ignis-helpers';

@service()
export class BillingService {
  constructor(
    @inject({ key: '@app/config' }) private secrets: ISecretsHelper,
  ) {}

  async run() {
    // A single keyed value (TTL-cached):
    const apiKey = await this.secrets.get({ path: 'secret/data/myapp/stripe', key: 'apiKey' });

    // Or the whole bundle at a path:
    const bundle = await this.secrets.getBundle({ path: 'secret/data/myapp/stripe' });
  }
}
```

Code that only relies on hydrated values keeps reading `process.env.APP_ENV_*` and needs no injection at all.

## Rotating Database Credentials

Dynamic secrets let Vault mint short-lived database credentials that expire and rotate. IGNIS renews them and, on rotation, rebuilds the connection pool gracefully.

You do **not** write any rotation code for PostgreSQL. Two steps enable it:

1. Configure a dynamic database engine in Vault so a read against `database/creds/<role>` returns fresh credentials with a TTL.
2. Add a `lease` entry whose `key` is the DI binding key of your datasource (`datasources.<ClassName>`), as in the HashiCorp example above.

From there IGNIS:

- renews the lease before it expires;
- when Vault issues fresh credentials, calls the datasource's `onSecretRotated()`, which swaps the new credentials in, builds a new pool, and drains the old one so in-flight transactions finish;
- keeps the app running - no restart.

> [!WARNING] Your datasource configure() must read from this.settings
> Rotation writes the new credentials onto `this.settings` and re-runs `configure()`. If your `configure()` builds the pool from a hard-coded connection string instead, rotation rebuilds with stale credentials. Build the pool from `this.settings`:
> ```typescript
> override configure(): void {
>   this.client = new Pool(this.settings);
> }
> ```

## Behaviour When the Vault Is Down

The failure policy is keyed on `NODE_ENV`:

- **Development** (`local`, `debug`, `development`, `dev`, `sit`) - a vault failure logs a warning and falls back to `process.env`, so you can work offline.
- **Everything else** - a vault failure throws and crashes the boot. The app never starts with missing or empty secrets.

## Testing Against a Real Vault

A local end-to-end setup (Vault dev-mode plus a throwaway PostgreSQL) is described in `docs/superpowers/vault-integration-local-testing.md` in the repository.

## See Also

- [Secrets & Vault Reference](/references/base/secrets) - full API, machinery, and const-classes
- [DataSources](/guides/core-concepts/persistent/datasources) - the pool that rotation rebuilds
