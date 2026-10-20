---
title: Secrets & Vault
description: The Secrets provider family - read configuration and credentials from HashiCorp Vault, an encrypted .env.vault, or plain process.env behind one interface
difficulty: intermediate
---

# Secrets & Vault

The Secrets helper family reads configuration and credentials from a backend, behind one `ISecretsHelper` interface. Swap the provider, and the calling code stays the same.

> [!TIP] In an application, you rarely build a provider by hand
> An IGNIS app enables secrets by overriding `registerSecrets()` on its application class. The framework then builds the provider, hydrates static secrets into `Envs`, and wires rotation for you. See the [Secrets & Vault deep dive](/references/base/secrets) and the [guide](/guides/core-concepts/secrets-vault). This page documents the provider family itself.

## In one example

```typescript
import { createSecretsHelper, SecretProviders } from '@venizia/ignis-helpers';

const secrets = await createSecretsHelper({
  provider: SecretProviders.SYSTEM_ENVS,
});
await secrets.configure();

const value = await secrets.get({ path: 'ignored', key: 'APP_ENV_DB_PASSWORD' });
```

Swap `provider` for `SecretProviders.HASHICORP_VAULT` (with a `config: { endpoint, auth }`) or `SecretProviders.DOTENV_VAULT` to change the backend.

## The three providers

| Provider | `SecretProviders` value | Kind | Optional peer |
|----------|-------------------------|------|---------------|
| `SystemEnvsHelper` | `system-envs` | Static (`process.env`) | none (default) |
| `HashiCorpVaultHelper` | `hashicorp-vault` | KV + dynamic + rotation | `node-vault` (`@venizia/ignis-helpers/hashicorp-vault`) |
| `DotenvVaultHelper` | `dotenv-vault` | Static (encrypted `.env.vault`) | `@dotenvx/dotenvx` (`@venizia/ignis-helpers/dotenv-vault`) |

Only HashiCorp mints dynamic, lease-bearing credentials. The other two are read-only snapshots.

## How it works

- **One base class, three providers.** `AbstractSecretsHelper` owns the provider-agnostic machinery: a TTL cache, a lease registry, a renewal scheduler, and rotation dispatch. Each concrete provider implements only the raw fetch/renew/revoke calls.
- **Static reads are TTL-cached.** `get()` and `getBundle()` cache by path, for `cacheTtlSeconds` (default `300`).
- **The cache evicts lazily, not on a timer.** An expired entry is only cleared the next time you call `get()` or `getBundle()` for that path - there's no background sweep.
- **Dynamic secrets renew themselves.** `lease()` opens a lease-bearing secret, and schedules its own renewal at `ttlSeconds * renewBeforeRatio` (default ratio `0.66`). Only HashiCorp supports `lease()` - the static providers throw.
- **A failed renewal retries with backoff, then rotates.** If Vault is unreachable, the scheduler retries with capped exponential backoff. Once a renewal genuinely can't extend the lease, the helper fetches a fresh one and dispatches rotation.
- **`createSecretsHelper({ provider })` picks the concrete class for you.**
- **The peer packages stay invisible to bundlers.** `node-vault` and `@dotenvx/dotenvx` load only through a dynamic import (`ModuleUtility.load`). Importing `@venizia/ignis-helpers` never requires either package.
- **This holds under `Bun.build` too.** A literal dynamic import resolves at bundle time, so a compiled binary needs no `external` entry for either peer.

## The `ISecretsHelper` interface

| Method | Purpose |
|--------|---------|
| `configure()` | Authenticate / prepare the backend (run before use) |
| `get({ path, key?, defaultValue? })` | Read one static value (TTL-cached) |
| `getBundle({ path })` | Read a whole key-value bundle at a path |
| `lease({ path, key })` | Open a dynamic, lease-bearing secret (HashiCorp only) |
| `onRotate(handler)` | Subscribe to rotation events |
| `registerRotatable({ key, target })` | Connect a live consumer (a pool) to a lease key |
| `shutdown()` | Stop renewal timers and revoke outstanding leases |

## Common tasks

### Read a static value or a bundle

```typescript
const password = await secrets.get({ path: 'secret/data/app', key: 'DB_PASSWORD' });
const bundle = await secrets.getBundle({ path: 'secret/data/app' });
```

### Connect to HashiCorp Vault

Install the peer first: `bun add node-vault`. Vault supports three auth methods.

| `auth.method` | Fields |
|---|---|
| `token` | `token` |
| `app-role` | `roleId`, `secretId`, `mountPath?` |
| `kubernetes` | `role`, `jwtPath?`, `mountPath?` |

```typescript
const secrets = await createSecretsHelper({
  provider: SecretProviders.HASHICORP_VAULT,
  config: {
    endpoint: 'https://vault.internal:8200',
    auth: { method: 'app-role', roleId, secretId },
  },
});
await secrets.configure();
```

### Open a dynamic, rotating credential

```typescript
const lease = await secrets.lease({
  path: 'database/creds/app-role',
  key: 'datasources.PostgresDataSource',
});

secrets.onRotate(({ key, lease }) => {
  logger.for('secrets').info('Rotated | key: %s | ttl: %d', key, lease.ttlSeconds);
});
```

### Rebuild a live consumer when its secret rotates

`registerRotatable` connects a pool - or any `ISecretRotatable` - directly to a lease key. It rebuilds on rotation without going through `onRotate`.

```typescript
secrets.registerRotatable({ key: 'datasources.PostgresDataSource', target: pool });
```

### Read a static `.env.vault`

```typescript
const secrets = await createSecretsHelper({
  provider: SecretProviders.DOTENV_VAULT,
  config: { path: '.env.vault', dotenvKey: process.env.DOTENV_KEY },
});
```

### Shut down cleanly

`shutdown()` clears every renewal timer and revokes every outstanding lease. Call it on application stop.

```typescript
await secrets.shutdown();
```

## See also

- [Secrets & Vault deep dive](/references/base/secrets) - the full reference: machinery, rotation contract, failure mode, boot lifecycle
- [Secrets & Vault guide](/guides/core-concepts/secrets-vault) - enabling a provider in an application
- [DataSources](/references/base/datasources) - the pool that rotation rebuilds

**Files:** [`packages/helpers/src/modules/secrets`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/secrets)
