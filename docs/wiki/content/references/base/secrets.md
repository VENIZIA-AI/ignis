---
title: Secrets & Vault Reference
description: Technical reference for the Secrets provider family, boot-time hydration, dynamic leases, and credential rotation
difficulty: advanced
---

# Deep Dive: Secrets & Vault

Technical reference for the `Secrets` provider family. It covers how IGNIS loads configuration and credentials from a vault instead of reading `process.env` directly, hydrates static secrets at boot, and rotates dynamic database credentials into a live connection pool without a restart.

> [!IMPORTANT] Dormant by default
> An application that does not override `registerSecrets()` gets the `system-envs` provider, which reads `process.env` exactly as before. The whole subsystem is additive - existing apps behave identically until they opt in.

**Files:** `packages/helpers/src/modules/secrets/*.ts` (provider family) and `packages/core-server/src/base/applications/base.ts` (`hydrateSecrets()` lifecycle, DI binding, rotation wiring)

## Quick Reference

| Class / Interface | Purpose | Key Members |
|-------------------|---------|-------------|
| **ISecretsHelper** | Contract every provider implements | `get()`, `getBundle()`, `lease()`, `onRotate()`, `registerRotatable()`, `shutdown()`, `configure()` |
| **AbstractSecretsHelper** | Provider-agnostic machinery | TTL cache, lease registry, renewal scheduler, `onRotate` dispatch; abstract `fetchRaw`/`renewRaw`/`revokeRaw` |
| **SystemEnvsHelper** | Default, static, zero-dependency | Reads `process.env`; `lease()` throws NotSupported |
| **HashiCorpVaultHelper** | KV v2 + dynamic leases + rotation | Token / AppRole / Kubernetes auth; token self-renewal; `node-vault` optional peer |
| **DotenvVaultHelper** | Static, encrypted `.env.vault` | Decrypts via `@dotenvx/dotenvx`; `lease()` throws NotSupported |
| **SecretProviders** | Provider const-class | `SYSTEM_ENVS`, `HASHICORP_VAULT`, `DOTENV_VAULT`, `SCHEME_SET`, `isValid()` |
| **VaultAuthMethods** | Auth const-class | `TOKEN`, `APP_ROLE`, `KUBERNETES`, `SCHEME_SET`, `isValid()` |
| **ISecretsRegistration** | What `registerSecrets()` returns | `provider`, `config`, `hydrate[]`, `lease[]`, `renewBeforeRatio`, `cacheTtlSeconds` |
| **ISecretRotatable** | Opt-in consumer hook | `onSecretRotated({ key, secret })` |

## Two Paths: Hydrate and Provider

Secrets reach the application through two independent channels.

- **Hydrate (static)** - during boot, the framework fetches secrets from the vault and merges them into `Envs` and `process.env`. Any code that already reads `process.env.APP_ENV_*` keeps working unchanged. Set once, never rotated.
- **Provider (dynamic)** - the resolved provider is bound in the container at the key `@app/config`. Code that needs on-demand reads, dynamic credentials, or rotation injects that provider and calls `await secrets.get(...)`.

A single registration drives both. The hydrate path is a convenience over the provider path - the same provider produces both.

## Provider Tiers

```
AbstractSecretsHelper (BaseHelper; TTL cache, lease registry, renewal scheduler, onRotate dispatch)
  ├── SystemEnvsHelper       // 'system-envs'     - process.env / Envs. Static, zero deps, default.
  ├── HashiCorpVaultHelper   // 'hashicorp-vault' - full KV + dynamic + lease + rotation.
  └── DotenvVaultHelper      // 'dotenv-vault'    - encrypted .env.vault, static only.
```

The renewal scheduler, TTL cache, lease registry, and `onRotate` dispatch all live in `AbstractSecretsHelper`. A concrete provider implements only the raw calls against its backend (`fetchRaw`, `renewRaw`, `revokeRaw`). That's why the two static providers are thin, and why only HashiCorp exercises the lease machinery.

## `ISecretsHelper` Interface

**File:** `packages/helpers/src/modules/secrets/common/types.ts`

```typescript
interface ISecretsHelper extends IConfigurable {
  // One-shot read of a static / KV value (TTL-cached).
  get<TValue = string>(opts: { path: string; key?: string; defaultValue?: TValue }): Promise<TValue>;

  // Whole KV bundle at a path - hydration merges this into Envs.
  getBundle(opts: { path: string }): Promise<Record<string, string>>;

  // Lease-bearing dynamic secret. The provider tracks the lease, schedules renewal,
  // and emits onRotate when the backend issues fresh credentials.
  lease(opts: { path: string; key: string }): Promise<ISecretLease>;

  // Rotation event - mirrors the onInitialized / onConnected / onError vocabulary.
  onRotate(handler: (event: ISecretRotationEvent) => ValueOrPromise<void>): void;

  // Connect a live consumer (a pool holder) to a lease key.
  registerRotatable(opts: { key: string; target: ISecretRotatable }): void;

  // Stop renewal timers and revoke outstanding leases.
  shutdown(): Promise<void>;
}

interface ISecretLease {
  value: Record<string, string>; // e.g. { username, password }
  leaseId: string;
  ttlSeconds: number;
  renewable: boolean;
}

interface ISecretRotationEvent {
  key: string; // logical key, e.g. 'datasources.PostgresDataSource'
  lease: ISecretLease;
}

// Opt-in consumer hook. Soft-evict, NOT a hard teardown.
interface ISecretRotatable {
  onSecretRotated(opts: { key: string; secret: Record<string, string> }): Promise<void>;
}
```

> [!NOTE] Static vs dynamic secrets
> `get()` / `getBundle()` return static values (KV, env) and are TTL-cached. `lease()` returns a dynamic, lease-bearing secret and is supported only by `HashiCorpVaultHelper`. The static providers throw an explicit NotSupported error instead of returning a fake lease.

## Registration

An application opts in by overriding `registerSecrets()` on its `BaseApplication` subclass. The method returns an `ISecretsRegistration` and runs before datasources are built.

**File:** `packages/helpers/src/modules/secrets/common/types.ts`

```typescript
interface ISecretsRegistration {
  provider: TSecretProvider;              // SecretProviders.*
  config?: AnyObject;                     // provider-specific (endpoint, auth, ...)
  hydrate?: Array<{                       // static KV -> merged into Envs at boot
    path: string;
    prefix?: string;                      // prepend to every merged key
    keys?: Record<string, string>;        // explicit vaultKey -> envKey (wins over prefix)
  }>;
  lease?: Array<{                         // dynamic leases -> renewed + rotated
    key: string;                          // binding key of the consuming datasource
    path: string;
  }>;
  renewBeforeRatio?: number;              // renew a lease at ttl * ratio (default 0.66)
  cacheTtlSeconds?: number;               // TTL for the get/getBundle cache (default 300)
}
```

### `registerSecrets()` default

```typescript
// packages/core-server/src/base/applications/base.ts
registerSecrets(): ValueOrPromise<ISecretsRegistration> {
  return { provider: SecretProviders.SYSTEM_ENVS };
}
```

Because the default names `system-envs`, an app that never overrides it hydrates nothing, leases nothing, and reads `process.env` as always.

## Const-classes

**File:** `packages/helpers/src/modules/secrets/common/constants.ts`

```typescript
export class SecretProviders {
  static readonly SYSTEM_ENVS = 'system-envs';
  static readonly HASHICORP_VAULT = 'hashicorp-vault';
  static readonly DOTENV_VAULT = 'dotenv-vault';

  static readonly SCHEME_SET = new Set([this.SYSTEM_ENVS, this.HASHICORP_VAULT, this.DOTENV_VAULT]);
  static isValid(value: string): value is TSecretProvider {
    return this.SCHEME_SET.has(value);
  }
}

export class VaultAuthMethods {
  static readonly TOKEN = 'token';
  static readonly APP_ROLE = 'app-role';
  static readonly KUBERNETES = 'kubernetes';

  static readonly SCHEME_SET = new Set([this.TOKEN, this.APP_ROLE, this.KUBERNETES]);
  static isValid(value: string): value is TVaultAuthMethod {
    return this.SCHEME_SET.has(value);
  }
}
```

## Lifecycle Integration

The registration is consumed by a new async boot phase, `hydrateSecrets()`, inserted between `preConfigure()` and `registerDataSources()`.

```
validateEnvs → staticConfigure → preConfigure
   → hydrateSecrets()          ← resolve provider, hydrate Envs, bind @app/config, set up leases
   → registerDataSources
   → wireSecretRotatables()    ← connect each lease key to its datasource
   → registerComponents → registerControllers → postConfigure
```

`hydrateSecrets()` does four things:

1. Calls `registerSecrets()` and builds the provider via `createSecretsHelper({ provider })`.
2. Runs `provider.configure()` (authentication), then merges every `hydrate` entry into `Envs` + `process.env`, and opens every `lease`.
3. Binds the live provider at `CoreBindings.APPLICATION_CONFIG` (`@app/config`) as a singleton.
4. Registers a post-stop hook (`secrets.shutdown`) so `provider.shutdown()` runs on teardown, revoking outstanding leases.

`wireSecretRotatables()` runs after datasources are registered. For each `lease` entry it resolves the datasource at `entry.key` and, if the instance implements `onSecretRotated`, calls `provider.registerRotatable({ key, target })`. A datasource that does not implement the hook is skipped.

> [!TIP] Why a lifecycle phase and not a Component
> Components register *after* datasources, but secrets must be resolved *before* datasources build their pools. Hydration is therefore a dedicated phase, not a component.

## Failure Mode

`hydrateSecrets()` is fail-closed in production and forgiving in development, keyed on `Environment.DEVELOPMENT_ENVS` (`local`, `debug`, `development`, `dev`, `sit`).

| Environment | Vault unreachable / auth fails / secret missing |
|-------------|-------------------------------------------------|
| Development set | Log a warning, fall back to a `system-envs` provider, continue booting |
| Everything else (prod, staging, and any unrecognized name) | Throw `ApplicationError`, crash the boot |

The fallback in development builds a fresh `SystemEnvsHelper`. It shuts down the partially-built provider first, so a half-authenticated Vault client leaves no renewal timer or lease behind.

## `AbstractSecretsHelper` Machinery

**File:** `packages/helpers/src/modules/secrets/base/abstract.helper.ts`

- **TTL cache** - `get()` / `getBundle()` cache each path for `cacheTtlSeconds` (default 300) and re-fetch on expiry.
- **Renewal scheduler** - each lease schedules a renewal at `ttlSeconds × renewBeforeRatio` (default 0.66) through an injectable timer seam.
- **On renewal fire** - `renewRaw()` extends the same lease. On renew failure or max-TTL, `fetchRaw()` mints a fresh lease and a single rotation is dispatched instead.
- **Rotation dispatch** - `onRotate` handlers run first. The registered rotatables for that key then run **in series**; a throwing consumer is logged and does not abort the others.
- **Shutdown** - clears every timer and revokes every lease via `revokeRaw()`.

The scheduler, cache, and clock are injectable, so the machinery is tested deterministically without real timers or a live vault.

## HashiCorp Vault Provider

**File:** `packages/helpers/src/modules/secrets/hashicorp/hashicorp.helper.ts`

- **Auth** - a Zod discriminated union on `method`: `token` (`token`), `app-role` (`roleId` + `secretId`, optional `mountPath`), `kubernetes` (`role`, optional `jwtPath` and `mountPath`). `configure()` logs in and stores the Vault token. `mountPath` defaults to the method name - `approle` and `kubernetes`.
- **KV v2** - `getBundle()` unwraps the KV-v2 `.data.data` envelope automatically.
- **Dynamic secrets** - a read against a dynamic engine (for example `database/creds/...`) returns a lease (`lease_id`, `lease_duration`, `renewable`), which drives the renewal scheduler.
- **Token self-renewal** - the Vault auth token has its own TTL. The provider schedules the token for renewal in the same cadence as leases.
- **Re-auth on expiry** - if the token can no longer be renewed, the provider re-runs the login flow, so AppRole / Kubernetes deployments survive past the token TTL without a restart.

`node-vault` is an optional peer. It is reached only through the `@venizia/ignis-helpers/hashicorp-vault` sub-path and a bundler-invisible dynamic import (`ModuleUtility.load`), so importing the root package never requires it. `Bun.build`-compiled applications need no `external: ['node-vault']` workaround.

An application that does use this provider and compiles a binary must ship `node-vault` in `node_modules` next to the binary. Alternatively, inject a ready-made `client` through the helper options, or import `node-vault` statically and hand it over with `ModuleUtility.register({ modules: { 'node-vault': nodeVault } })` at startup.

## Dotenv Vault Provider

**File:** `packages/helpers/src/modules/secrets/dotenv/dotenv.helper.ts`

Decrypts a committed `.env.vault` file with a per-environment `DOTENV_KEY` (via `@dotenvx/dotenvx`) into a flat key-value map, which the hydrate path merges into `Envs`. Static only - `lease()` throws NotSupported. `@dotenvx/dotenvx` is an optional peer reached through the `@venizia/ignis-helpers/dotenv-vault` sub-path.

## Rotation and the Soft-Evict Contract

When a dynamic credential rotates, a live connection pool holding the old credentials must rebuild. IGNIS uses an event plus an opt-in rebuild callback, mirroring the Spring Cloud Vault + HikariCP pattern.

The PostgreSQL datasource implements `onSecretRotated()` on `AbstractRelationalDataSource`:

1. Capture the current pool.
2. Apply the new credentials onto `this.settings` (`{ username, password }` maps to pg's `{ user, password }`).
3. Clear the driver / connector / client, re-run `configure()` to build a fresh pool, and re-wire the driver.
4. Drain the old pool with `end()`. It resolves once checked-out clients are released, so in-flight transactions finish on the old pool while new work uses the new one.

> [!WARNING] configure() must read from this.settings
> Rotation applies new credentials by writing them onto `this.settings` and re-running `configure()`. A `configure()` that builds its pool from a hard-coded connection string, or reads `Envs` directly, will rebuild with **stale** credentials.

## Consuming the Provider

Any provider-fed code injects the singleton at `@app/config`.

```typescript
import type { ISecretsHelper } from '@venizia/ignis-helpers';

@service()
export class PaymentService {
  constructor(
    @inject({ key: '@app/config' }) private secrets: ISecretsHelper,
  ) {}

  async charge() {
    const apiKey = await this.secrets.get({ path: 'secret/data/myapp/stripe', key: 'apiKey' });
    // ...
  }
}
```

For a step-by-step walkthrough of enabling each provider, see the [Secrets & Vault guide](/guides/core-concepts/secrets-vault).

## See Also

- [Secrets & Vault guide](/guides/core-concepts/secrets-vault) - practical setup for each provider
- [DataSources](./datasources) - the pool that rotation rebuilds
- [Environment Variables](/references/configuration/environment-variables) - where hydrated secrets land
