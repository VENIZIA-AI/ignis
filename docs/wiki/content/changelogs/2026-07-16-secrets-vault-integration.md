---
title: Secrets & Vault Integration
description: A pluggable Secrets provider family - HashiCorp Vault, Dotenv Vault, and system env - with boot-time hydration, dynamic leases, and restart-free credential rotation. Fully additive; existing apps are unchanged.
---

# Changelog - 2026-07-16

## Secrets & Vault Integration

<Badge type="tip" text="New Feature" /> <Badge type="info" text="Enhancement" />

IGNIS applications previously read configuration and credentials straight from `process.env`. There was no secrets provider and no way to consume a vault. This release adds a pluggable `Secrets` provider family, a boot-time hydration phase, and restart-free rotation of dynamic database credentials.

The whole subsystem is **additive and dormant by default**: an application that does not override `registerSecrets()` uses the `system-envs` provider and behaves exactly as before.

## Overview

- **Secrets provider family** (`@venizia/ignis-helpers`): `AbstractSecretsHelper` plus `SystemEnvsHelper`, `HashiCorpVaultHelper`, and `DotenvVaultHelper`, selected by a `SecretProviders` const-class.
- **Two consumption paths**: boot-time hydration into `Envs` / `process.env` (existing code unchanged), and an injectable provider bound at `@app/config` for on-demand reads.
- **Dynamic leases + rotation**: HashiCorp Vault dynamic credentials are renewed automatically, and on rotation the PostgreSQL pool is rebuilt gracefully - no restart.
- **Fail-closed**: a vault failure crashes the boot in production; development falls back to `process.env`.

## New Features

### Registering a provider

**File:** `packages/core/src/base/applications/base.ts`

**Problem:** Applications had no way to source secrets from a vault; every credential had to be present in `process.env`.

**Solution:** Override `registerSecrets()` on the application. The default returns `{ provider: 'system-envs' }`, so nothing changes until you opt in.

```typescript
import { SecretProviders, VaultAuthMethods } from '@venizia/ignis-helpers';

export class Application extends BaseApplication {
  override registerSecrets() {
    return {
      provider: SecretProviders.HASHICORP_VAULT,
      config: { endpoint, auth: { method: VaultAuthMethods.APP_ROLE, roleId, secretId } },
      hydrate: [{ path: 'secret/data/myapp/config' }],
      lease: [{ key: 'datasources.PostgresDataSource', path: 'database/creds/app-role' }],
    };
  }
}
```

**Benefits:**
- Static secrets hydrate into `APP_ENV_*` keys; existing `process.env` readers are unchanged.
- Dynamic database credentials rotate without a restart.
- The provider is injectable at `@app/config` for on-demand reads.

### The hydration lifecycle phase

**File:** `packages/core/src/base/applications/base.ts`

A new async `hydrateSecrets()` phase runs between `preConfigure()` and `registerDataSources()`: it resolves the provider, merges static secrets into `Envs`, opens dynamic leases, and binds the provider at the previously-dormant `@app/config` key. `wireSecretRotatables()` then connects each lease to its datasource after registration.

### Restart-free credential rotation

**File:** `packages/core/src/connectors/postgres/datasources/abstract.ts`

The PostgreSQL datasource gains an `onSecretRotated()` hook that performs a graceful soft-evict: it swaps the new credentials into `this.settings`, rebuilds the pool via `configure()`, and drains the old pool with `end()` so in-flight transactions finish. Rotation is opt-in - it is wired only for datasources named in a `lease` entry.

### Vault token self-renewal

**File:** `packages/helpers/src/modules/secrets/hashicorp/hashicorp.helper.ts`

`HashiCorpVaultHelper` renews its own Vault auth token on the same cadence and re-authenticates if the token can no longer be renewed, so AppRole and Kubernetes deployments keep working past the token TTL.

## Optional Peers

The vault backends are optional peer dependencies, reached only through sub-paths and dynamic imports - importing `@venizia/ignis-helpers` never requires them.

| Provider | Peer | Sub-path |
|----------|------|----------|
| HashiCorp Vault | `node-vault` | `@venizia/ignis-helpers/vault` |
| Dotenv Vault | `@dotenvx/dotenvx` | `@venizia/ignis-helpers/dotenv-vault` |

Install a peer only in the application that uses that provider.

## Migration

None required. This release is fully additive:

- Applications that do not override `registerSecrets()` use `system-envs` and are byte-for-byte unchanged at boot.
- The reserved binding keys `@app/config` and `@app/environments` were previously unused.
- No new dependency is forced; the vault peers are optional and installed only when their provider is used.

## Learn More

- [Secrets & Vault guide](/guides/core-concepts/secrets-vault)
- [Secrets & Vault reference](/references/base/secrets)
