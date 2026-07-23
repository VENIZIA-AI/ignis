---
type: Package
title: helpers
description: Production-ready utility library for logging, Redis, queues, storage, crypto, pooling, networking, and more, shared across IGNIS.
resource: packages/helpers
tags: [packages, helpers, utilities]
---

`@venizia/ignis-helpers` sits between `inversion` and `boot` in the dependency chain (`dev-configs -> inversion -> helpers -> boot -> core`). It is a production-ready utility library designed to integrate with the IGNIS IoC container, and ships a dual CJS + ESM build. See the full catalog at [helpers catalog](/reference/helpers.md).

## Module map

`src/modules/` (verified against source) contains: `base` (the shared `BaseHelper`), `cron`, `crypto`, `env`, `error`, `logger`, `network`, `pool`, `queue`, `redis`, `socket` (Socket.IO and WebSocket subfolders), `storage`, `uid`, and `worker-thread`. Highlights:

- **logger** - follows the house tiering: `common/` holds the provider-agnostic `ILogger` contract, `TLogLevel`/`LogLevels`, and `LoggerFormats`; `base/` holds `AbstractLogger`/`BaseLogger` (scope/prefix/DEBUG-gate/`.for()` plumbing shared by every provider); `winston/` is the self-contained built-in provider (`WinstonLogger`, `define.ts`, its own `common/`, `formatters/`, `transports/`); `hf/` is the separate `HfLogger` pipeline - `HfLogger extends AbstractLogger` and implements
`ILogger` (string methods backed by a bounded FIFO encode cache, args formatted through
`formatLogMessage` so nothing is ever dropped; the legacy bytes hot path survives as an overloaded
`log(level, string | Uint8Array)`), writes entry-layout-v2 records (per-entry length bytes, no NUL
padding or stale tails) into a plain, lazily-allocated `ArrayBuffer` ring (`SharedArrayBuffer`
dropped - the design is explicitly single-thread, so nothing is allocated at import time), and
drains through `HfLogFlusher` (`{ sink?, filePath?, batchSize? }`, batched yielding drains,
unref'd `start()`, `stop()`, exact per-batch `dropped` lap accounting). `LoggerFactory.getLogger()` returns `ILogger` and the factory is the ONLY provider-selection point - callers never see which class backs the instance (`Logger.get(scope)` remains the winston-concrete path; custom-backed wrappers are NOT cached). Formatting is two-stage: shared prep on the logger, per-transport assembly - color on console only, files/UDP stay ANSI-free. `APP_ENV_LOGGER_LEVEL` (default `debug`) is the logger-level floor; daily-rotate-file transport is opt-in via `APP_ENV_LOGGER_FOLDER_PATH`. Provider REGISTRATION: `LoggerFactory.use({ provider })` (swap-on-use delegating wrappers - even module-level loggers captured at import follow it; wrapper cost ~0ns measured; delegates resolve LAZILY at the first log call). SINGLE-PROVIDER LOADING: exactly one provider is ever loaded - the registered one, or the winston default lazily required behind a `createRequire` boundary in `factory.ts` (bundler-opaque). Both providers are SUB-PATH ONLY: `WinstonLogger`/`Logger`/`defineCustomLogger`/`DgramTransport`/formatters at `@venizia/ignis-helpers/winston`, `PinoLogger` at `/pino`; the root barrel is provider-free (guard test `no-eager-winston-import.test.ts`). winston/winston-transport/winston-daily-rotate-file and hono are OPTIONAL peers - apps on the winston default must install them; compiled binaries must register a provider explicitly (class reference bundles it). `ApplicationLogger` is the provider-following facade; the lowercase `applicationLogger` instance was REMOVED (migrate to `ApplicationLogger.get(scope)`). Secret redaction has a kill-switch: `APP_ENV_LOGGER_DO_REDACT=false` (that literal only - fail-closed, per-call read) turns `redactSecrets`/`redactUrlCredentials` into pass-throughs for local debugging; never in production.
- **redis** - `AbstractRedisHelper` is the shared data API; `RedisSingleHelper`, `RedisClusterHelper`, and `RedisSentinelHelper` implement it for the three topologies, selected via `createRedisHelper({ mode })`. Consumers should depend on the `IRedisHelper` interface and use `instanceof AbstractRedisHelper` for identity checks.
- **queue** - `BullMQHelper` (Redis-backed queue/worker pair), `QueueHelper` (in-memory, generator-based, state machine `WAITING -> PROCESSING -> LOCKED -> SETTLED`), `MQTTClientHelper`, and a Kafka bundler.
- **pool** - a generic, engine-neutral object pool: `AbstractPoolHelper<T>` owns state and a single re-entrancy-guarded dispatch loop pairing idle resources with waiting acquirers; `BasePoolHelper` is the concrete, callback-configured subclass. The waiter queue is backed by an internal `HfQueueHelper` (O(1) FIFO, no array shift/splice on the hot path).
- **storage** - `BaseStorageHelper` abstract base with `MinioHelper`, `DiskHelper`, and `MemoryStorageHelper` implementations; `isValidName()` guards against path traversal and injection.
- **crypto** - `BaseCryptoAlgorithm` with AES (`aes-256-cbc`/`aes-256-gcm`) and RSA implementations, including file encrypt/decrypt.
- **network** - fetch-based HTTP client in the root barrel; TCP/TLS/UDP servers and clients.
- **uid** - `SnowflakeUidHelper`, a 70-bit Snowflake ID generator (48-bit timestamp + 10-bit worker ID + 12-bit sequence) with Base62 encoding.
- **env** - `Environment` (reads `process.env.NODE_ENV`) and `ApplicationEnvironment({ prefix, envs })` for prefixed, typed environment access.

## Sub-path exports isolate optional peers

Helpers that depend on an optional peer package are never re-exported from the root barrel - they are reachable only via their own sub-path, so importing `@venizia/ignis-helpers` never forces that peer into a consumer's bundle. Confirmed sub-path-only exports: `@venizia/ignis-helpers/socket-io`, `/bullmq`, `/mqtt`, `/minio`, `/bun-s3`, `/axios`, `/cron`, `/kafka`, `/hashicorp-vault`, `/dotenv-vault`, `/winston`, and `/pino`. Dedicated tests assert the root barrel never re-exports the axios fetcher, never loads winston, and never resolves pino.

The secrets family adds a second, bundler-facing rule. `createSecretsHelper` lives in the root barrel and reaches `node-vault` / `@dotenvx/dotenvx` at runtime, so those imports must go through `importOptionalModule({ module })` (in `utilities/module.utility.ts`), never a literal `import('node-vault')`. `Bun.build` resolves literal dynamic-import specifiers at bundle time - a literal anywhere reachable from the root barrel forces every consumer that compiles a binary to install the peer or list it in `external` (BANA had to exclude `node-vault` in every package's compile script before this was fixed). A plain `const s = 'node-vault'; import(s)` is not enough either: `minify: { syntax: true }` constant-folds it back into a resolvable literal. Only a specifier passed across a function boundary stays a runtime import; `src/__tests__/secrets/no-bundler-peer-resolution.test.ts` guards this (root-barrel bundle + resolution-spy + a positive control proving the spy fires on a literal import). `importOptionalModule` wraps a failed import in the standard `getError` install hint, so a missing peer reads the same whether reached through the factory or by constructing a provider directly from its sub-path. The trade-off: an app that uses a peer-backed provider **and** compiles a binary must ship the peer in `node_modules` next to the binary, or inject the client via the helper's options (`HashiCorpVaultHelper` takes `client`, `DotenvVaultHelper` takes `decode`).

## Retry utilities

`src/utilities/retry.utility.ts` exports two retry primitives, both options-object, both logger-aware:

- **`executeWithRetry`** - the general-purpose retrier: retries `execution` on a *thrown error*, races each attempt against an optional `perAttemptTimeoutMs`, and stops at `maxAttempts`, an elapsed `maxTotalMs` budget, or a `shouldRetry` classification hook returning `false` (default: retry every failure). On exhaustion it rethrows the LAST error, after exactly one `logger.warn`. Backoff strategy defaults to EXPONENTIAL from a 250ms initial delay, capped at 30000ms, with FULL jitter (`RetryBackoffStrategies`/`RetryJitterModes` also offer FIXED, LINEAR, SCHEDULE and NONE, EQUAL).
- **`executeWithRetryUntil`** - the predicate-driven sibling, built for read-after-write staleness behind a replicated pool. It retries while `until(result)` returns `false` rather than on a thrown error; on exhaustion it returns the LAST result - never an error - so the caller sees exactly what a single non-retried call would have seen, again with exactly one `logger.warn`. Its `maxTotalMs` is NOT the generic per-attempt-timeout `maxTotalMs` that `executeWithRetry` has (it is deliberately not forwarded there, for exactly that reason) - it only bounds whether a NEW attempt may start, so an in-flight execution always runs to completion and a non-positive value just means "no retries" while still performing exactly one execution. `signal?: AbortSignal` aborts between attempts and during backoff sleeps; unlike exhaustion, an abort REJECTS the call instead of returning the last result. `maxAttempts` below `1` also throws immediately, before any execution runs - the one case where the "never a new error" guarantee does not hold, because the configuration is nonsensical rather than the retry having failed. Internally it is a plain loop over the same building blocks `executeWithRetry` uses (`computeBackoffDelayMs`, the signal-aware backoff sleep) rather than a wrapper around it - the two functions retry on opposite triggers, so sharing the loop would mean tunnelling the predicate through the error channel. A real thrown error from `execution` is never retried, it propagates immediately, so only idempotent (read) operations should be wrapped. `core`'s `AbstractRepository.executeReadWithRetry` is the primary consumer - see [Repository hierarchy](/architecture/repository-hierarchy.md).

## Gotcha: Kafka and compiled binaries

The Kafka bundler's `@platformatic/wasm-utils` dependency reads `native.wasm` off disk at module load. `bun build --compile` never embeds that file, so a compiled binary dies with `ENOENT` before the app boots. The `platformaticWasmPlugin()` (re-exported from the `/kafka` sub-path) redirects the import to a `/bundled` entrypoint with the wasm inlined - any app compiling a binary with Kafka helpers must register this plugin in its own `Bun.build()` call, since the `bun build --compile` CLI itself accepts no plugins.

## Conventions

Every helper extends `BaseHelper`, giving it scoped logging (`this.logger.for('methodName').debug(...)`) and an `IConfigurable`-style `configure(opts?)` lifecycle. All public functions take options objects, never positional arguments. `RuntimeModules.detect()` (and `.isBun()`/`.isNode()`) gate any runtime-specific branch.

## Related

- [helpers catalog](/reference/helpers.md)
- [inversion](/packages/inversion.md)
- [boot](/packages/boot.md)
- [core](/packages/core.md)
- [Repository hierarchy](/architecture/repository-hierarchy.md)
