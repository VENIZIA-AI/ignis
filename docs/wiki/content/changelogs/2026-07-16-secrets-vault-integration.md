---
title: Secrets & Vault Integration
description: A pluggable Secrets provider family for HashiCorp Vault, Dotenv Vault and system env, with boot-time hydration, dynamic leases and restart-free credential rotation.
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-07-16

## Secrets & Vault Integration

<Badge type="tip" text="New Feature" /> <Badge type="info" text="Enhancement" />

**In one line.** You can now load secrets from a vault at boot and rotate dynamic database credentials without a restart. Apps that do not opt in are unchanged.

## What changed

- **Secrets providers.** `AbstractSecretsHelper` plus `SystemEnvsHelper`, `HashiCorpVaultHelper` and `DotenvVaultHelper`, chosen with `SecretProviders`. The default is `system-envs`.
- **Boot-time hydration.** A new `hydrateSecrets()` phase runs between `preConfigure()` and `registerDataSources()`. It merges static secrets into `Envs`, opens dynamic leases and binds the provider at `@app/config` for on-demand reads.
- **Restart-free rotation.** `wireSecretRotatables()` wires each lease in a `lease` entry to its datasource after registration. The PostgreSQL datasource gets an `onSecretRotated()` hook that rebuilds the pool with new credentials and drains the old pool so in-flight transactions finish. Rotation is opt-in per datasource.
- **Vault token self-renewal.** `HashiCorpVaultHelper` renews its own auth token and re-authenticates if it cannot, so AppRole and Kubernetes deployments keep working past the token TTL.
- **Fail-closed.** A vault failure crashes the boot in production. Development falls back to `process.env`.

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

`registerSecrets()` returns `provider` (`SYSTEM_ENVS`, `HASHICORP_VAULT` or `DOTENV_VAULT`), `config` (provider settings), `hydrate` (static paths merged into `Envs`) and `lease` (dynamic leases, each mapped to a datasource by key).

## Who is affected

- **Apps that do not override `registerSecrets()`.** Unaffected.
- **Apps that want a vault.** Override `registerSecrets()` and install the matching peer. No other step.

## Details

The vault backends are optional peer dependencies reached through sub-paths, so importing `@venizia/ignis-helpers` never requires them. Install a peer only in the app that uses that provider.

| Provider | Peer | Sub-path |
|---|---|---|
| HashiCorp Vault | `node-vault` | `@venizia/ignis-helpers/hashicorp-vault` |
| Dotenv Vault | `@dotenvx/dotenvx` | `@venizia/ignis-helpers/dotenv-vault` |

## See also

- [Secrets & Vault guide](/guides/core-concepts/secrets-vault)
- [Secrets & Vault reference](/references/base/secrets)
