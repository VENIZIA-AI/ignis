---
title: Secrets & Vault
description: The Secrets provider family - read configuration and credentials from HashiCorp Vault, an encrypted .env.vault, or plain process.env behind one interface
difficulty: intermediate
---

# Secrets & Vault

The Secrets helper family reads configuration and credentials from a backend - HashiCorp Vault, an encrypted `.env.vault`, or plain `process.env` - behind one `ISecretsHelper` interface. Only HashiCorp mints dynamic, rotating credentials; the other two are static.

> [!TIP] In an application, you rarely build a provider by hand
> An IGNIS app enables secrets by overriding `registerSecrets()` on its application class; the framework builds the provider, hydrates static secrets into `Envs`, and wires rotation for you. See the [Secrets & Vault deep dive](/references/base/secrets) and the [guide](/guides/core-concepts/secrets-vault). This page documents the provider family itself.

## In one example

```typescript
import { createSecretsHelper, SecretProviders } from '@venizia/ignis-helpers';

const secrets = await createSecretsHelper({
  provider: SecretProviders.SYSTEM_ENVS,
});
await secrets.configure();

const value = await secrets.get({ path: 'ignored', key: 'APP_ENV_DB_PASSWORD' });
```

Swap `provider` for `SecretProviders.HASHICORP_VAULT` (with a `config: { endpoint, auth }`) or `SecretProviders.DOTENV_VAULT` to change the backend - the calling code stays the same.

## How it works

- **One base, three providers.** `AbstractSecretsHelper` owns the provider-agnostic machinery (TTL cache, lease registry, renewal scheduler, rotation dispatch). Concrete providers implement only the raw fetch/renew/revoke calls.
- **Two secret classes.** Static secrets (`get`/`getBundle`) are TTL-cached. Dynamic, lease-bearing secrets (`lease`) are renewed automatically and drive rotation - only HashiCorp supports them.
- **Factory selection.** `createSecretsHelper({ provider })` picks the tier; the peer-backed providers are reached only through a bundler-invisible dynamic import (`importOptionalModule`), so importing the package never requires `node-vault` or `@dotenvx/dotenvx` - not even when the application is compiled into a binary with `Bun.build`, which resolves literal dynamic imports at bundle time. No `external` entry is needed in the compile step.

| Provider | `SecretProviders` value | Kind | Optional peer |
|----------|-------------------------|------|---------------|
| `SystemEnvsHelper` | `system-envs` | Static (`process.env`) | none (default) |
| `HashiCorpVaultHelper` | `hashicorp-vault` | KV + dynamic + rotation | `node-vault` (`@venizia/ignis-helpers/hashicorp-vault`) |
| `DotenvVaultHelper` | `dotenv-vault` | Static (encrypted `.env.vault`) | `@dotenvx/dotenvx` (`@venizia/ignis-helpers/dotenv-vault`) |

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

- **Pick a provider.** `createSecretsHelper({ provider: SecretProviders.HASHICORP_VAULT, config: { endpoint, auth: { method: 'app-role', roleId, secretId } } })`. Install the peer first (`bun add node-vault`).
- **Read a static value or a bundle.** `await secrets.get({ path, key })` / `await secrets.getBundle({ path })`.
- **Open a dynamic, rotating credential.** `await secrets.lease({ path: 'database/creds/app-role', key: 'datasources.PostgresDataSource' })` - the provider renews it and emits `onRotate` when the backend issues fresh credentials.
- **Static providers reject `lease()`.** `SystemEnvsHelper` and `DotenvVaultHelper` throw NotSupported - only HashiCorp has dynamic secrets.

## See also

- [Secrets & Vault deep dive](/references/base/secrets) - the full reference: machinery, rotation contract, failure mode, boot lifecycle
- [Secrets & Vault guide](/guides/core-concepts/secrets-vault) - enabling a provider in an application
- [DataSources](/references/base/datasources) - the pool that rotation rebuilds

**Files:** [`packages/helpers/src/modules/secrets`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/secrets)
