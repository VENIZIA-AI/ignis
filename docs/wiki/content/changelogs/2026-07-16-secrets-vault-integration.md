---
title: Secrets & Vault Integration
description: A pluggable Secrets provider family - HashiCorp Vault, Dotenv Vault, and system env - with boot-time hydration, dynamic leases, and restart-free credential rotation. Fully additive; existing apps are unchanged.
---

# Changelog - 2026-07-16

## Secrets & Vault Integration

<Badge type="tip" text="New Feature" /> <Badge type="info" text="Enhancement" />

**In one line.** A pluggable `Secrets` provider family, a boot-time hydration phase, and restart-free rotation of dynamic database credentials - additive and dormant by default.

## The problem it solves

IGNIS applications previously read configuration and credentials straight from `process.env`. There was no secrets provider and no way to consume a vault. Override `registerSecrets()` to opt in - an application that does not is unaffected:

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

## What changed

- **New `Secrets` provider family** (`@venizia/ignis-helpers`): `AbstractSecretsHelper` plus `SystemEnvsHelper`, `HashiCorpVaultHelper`, and `DotenvVaultHelper`, selected by a `SecretProviders` const-class. The default provider is `system-envs`, so nothing changes until you opt in.
- **New `hydrateSecrets()` lifecycle phase**, runs between `preConfigure()` and `registerDataSources()`. It resolves the provider, merges static secrets into `Envs`, opens dynamic leases, and binds the provider at the previously-dormant `@app/config` key.
- **Two ways to consume a secret**: boot-time hydration into `Envs` / `process.env` (existing code unchanged), and an injectable provider bound at `@app/config` for on-demand reads.
- **Restart-free credential rotation.** `wireSecretRotatables()` connects each lease to its datasource after registration. The PostgreSQL datasource gains an `onSecretRotated()` hook that swaps in the new credentials and rebuilds the pool via `configure()`.
  - It then drains the old pool with `end()` so in-flight transactions finish. Rotation is opt-in - wired only for datasources named in a `lease` entry.
- **Vault token self-renewal.** `HashiCorpVaultHelper` renews its own Vault auth token on the same cadence, and re-authenticates if the token can no longer be renewed. AppRole and Kubernetes deployments keep working past the token TTL.
- **Fail-closed.** A vault failure crashes the boot in production. Development falls back to `process.env`.

## Options

`registerSecrets()` returns:

| Field | Meaning |
|---|---|
| `provider` | `SecretProviders.SYSTEM_ENVS` (default), `HASHICORP_VAULT`, or `DOTENV_VAULT` |
| `config` | Provider-specific connection and auth settings |
| `hydrate` | Static secret paths merged into `Envs` at boot |
| `lease` | Dynamic credential leases, each mapped to a datasource by key |

The vault backends are optional peer dependencies, reached only through sub-paths and dynamic imports - importing `@venizia/ignis-helpers` never requires them:

| Provider | Peer | Sub-path |
|---|---|---|
| HashiCorp Vault | `node-vault` | `@venizia/ignis-helpers/hashicorp-vault` |
| Dotenv Vault | `@dotenvx/dotenvx` | `@venizia/ignis-helpers/dotenv-vault` |

Install a peer only in the application that uses that provider.

## Who is affected

- **Applications that do not override `registerSecrets()`.** Unaffected - they use `system-envs` and are byte-for-byte unchanged at boot.
- **Applications that want a vault.** Opt in with `registerSecrets()` and install the matching peer. No other migration step is required.
- **Everyone else.** No new dependency is forced; the reserved binding keys `@app/config` and `@app/environments` were previously unused.

## See also

- [Secrets & Vault guide](/guides/core-concepts/secrets-vault)
- [Secrets & Vault reference](/references/base/secrets)
