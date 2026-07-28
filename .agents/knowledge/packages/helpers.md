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

`/common` is a sub-path of a different kind: it does not isolate a peer, it exposes the surface that is already browser-safe. The root barrel is `export * from './modules'`, so reaching one constant through it drags 14 node builtins and 27 packages (winston, ioredis, hono, dayjs) into a browser bundle - measured, not assumed. `@venizia/ignis-helpers/common` carries `HTTP`, `TConstValue`, the constant and redaction tables, and resolves to only `@venizia/ignis-inversion`, `lodash`, `reflect-metadata` with zero builtins. The error layer is deliberately NOT re-exported there: `getError`, `ApplicationError`, `ErrorScopes` and the `TError*` types live in `@venizia/ignis-inversion`, which is browser-clean on its own, so a browser consumer imports them from inversion directly rather than through a second path. `src/__tests__/common/browser-purity.test.ts` guards the sub-path, and `packages/inversion/src/__tests__/browser-purity.test.ts` guards inversion - both bundle for `target: 'browser'` and spy at `onResolve`. Note that `Bun.build` with a browser target does NOT error on `node:fs`; build success is not a purity signal, the spy is.

The secrets family adds a second, bundler-facing rule. `createSecretsHelper` lives in the root barrel and reaches `node-vault` / `@dotenvx/dotenvx` at runtime, so those imports must go through `ModuleUtility.load({ module })` (in `utilities/module.utility.ts`), never a literal `import('node-vault')`. `Bun.build` resolves literal dynamic-import specifiers at bundle time - a literal anywhere reachable from the root barrel forces every consumer that compiles a binary to install the peer or list it in `external` (BANA had to exclude `node-vault` in every package's compile script before this was fixed). A plain `const s = 'node-vault'; import(s)` is not enough either: `minify: { syntax: true }` constant-folds it back into a resolvable literal. Only a specifier passed across a function boundary stays a runtime import; `src/__tests__/secrets/no-bundler-peer-resolution.test.ts` guards this (root-barrel bundle + resolution-spy + a positive control proving the spy fires on a literal import). `ModuleUtility.load` wraps a failed import in the standard `getError` install hint, so a missing peer reads the same whether reached through the factory or by constructing a provider directly from its sub-path. The trade-off: an app that uses a peer-backed provider **and** compiles a binary has no `node_modules` for the runtime lookup to resolve against, so it must ship the peer next to the binary, inject the client via the helper's options (`HashiCorpVaultHelper` takes `client`, `DotenvVaultHelper` takes `decode`), or hand the module over with `ModuleUtility.register({ modules })`. The app imports the peer statically (that import is what puts it inside the binary) and registers it before the consuming component binds; `load` and `loadSync` check the registry before touching the filesystem; `assertInstalled` ignores it unless the caller passes `allowRegistered`, which is correct only where `ModuleUtility` itself performs the load. This is the failure BANA's `identity` binary hit: it died at boot with `nodemailer is required` while `nodemailer` sat in its `package.json`, because nothing had put the peer inside the binary.

`register` is the FALLBACK, not the first answer: a global keyed by string depends on call order and types nothing. Prefer an options seam - every component that reaches an optional peer now has one: mail transports take `module`, the gRPC component takes `module` (`{ connect, protocol }`), the vault helpers take `client` / `decode`. `register` has no first-choice call site left in the framework and is kept for consumers. Registering does NOT work wherever the consumer resolves the specifier itself: `pino.transport()` resolves its target inside a worker thread, and `GrpcRequestAdapter` uses its own `createRequire`. Both would be reported present by a registry-aware `assertInstalled` and then still fail - which is why `allowRegistered` defaults to false.

## Retry utilities

`src/utilities/retry.utility.ts` exports two retry primitives, both options-object, both logger-aware:

- **`executeWithRetry`** - the general-purpose retrier: retries `execution` on a *thrown error*, races each attempt against an optional `perAttemptTimeoutMs`, and stops at `maxAttempts`, an elapsed `maxTotalMs` budget, or a `shouldRetry` classification hook returning `false` (default: retry every failure). On exhaustion it rethrows the LAST error, after exactly one `logger.warn`. Backoff strategy defaults to EXPONENTIAL from a 250ms initial delay, capped at 30000ms, with FULL jitter (`RetryBackoffStrategies`/`RetryJitterModes` also offer FIXED, LINEAR, SCHEDULE and NONE, EQUAL).
- **`executeWithRetryUntil`** - the predicate-driven sibling: retries while `until(result)` returns `false`. Built for read-after-write staleness (replica lag, async indexing). The rules:
  - A thrown error is never retried - it propagates immediately. Only wrap idempotent reads.
  - On exhaustion it returns the LAST result with one `logger.warn` - never an error.
  - `maxTotalMs` only gates whether a NEW attempt may start; an in-flight execution always completes. A non-positive value means "no retries" - one execution still runs. It is deliberately NOT forwarded to `executeWithRetry`, where the same name means a per-attempt timeout.
  - An aborted `signal` REJECTS the call. `maxAttempts` below `1` throws before any execution runs.
  - Internally a plain loop over `computeBackoffDelayMs` + the signal-aware sleep - NOT a wrapper around `executeWithRetry`. The two retry on opposite triggers; sharing the loop would mean tunnelling the predicate through the error channel.
  - Primary consumer: `AbstractRepository.executeReadWithRetry` - see [Repository hierarchy](/architecture/repository-hierarchy.md).

## Gotcha: Kafka and compiled binaries

`@platformatic/kafka` breaks `bun build --compile` in two independent ways, both by resolving something at runtime that the bundler cannot see. Both kill the process during module-graph load, before any IGNIS error handler exists. Register `platformaticKafkaPlugins()` (from the `/kafka` sub-path) in the app's own `Bun.build()` call - the `bun build --compile` CLI accepts no plugins.

- `platformaticWasmPlugin()` - `@platformatic/wasm-utils` reads `native.wasm` off disk at module load, which `--compile` never embeds. The plugin redirects the import to the `/bundled` entrypoint with the wasm inlined. Symptom: `ENOENT ... /$bunfs/dist/native.wasm`.
- `platformaticRequirePlugin()` - since 2.8.0, `registries/confluent-schema-registry.js` does `const AjvDraft04 = require('ajv-draft-04')` and `const draft06MetaSchema = require('ajv/dist/refs/json-schema-draft-06.json')` at MODULE SCOPE, through `createRequire(import.meta.url)`. `dist/index.js` re-exports that file, so importing anything from the package runs both lines. The plugin rewrites each module-scope `const X = require('spec')` into a static import at bundle time. Symptom: `Cannot find package 'ajv-draft-04' from '/$bunfs/root/index.js'`.

Three constraints on `platformaticRequirePlugin` that the code alone does not explain:

- **The injected binding is `const X = <alias>;` - never `<alias>?.default ?? <alias>`.** The draft-06 meta schema JSON carries its own top-level `default` key (`{}`), so unwrapping silently replaces the meta schema with an empty object. The binary still boots and the registry still constructs; draft-06 validation then fails with `no schema with key or ref "http://json-schema.org/draft-06/schema#"`. A default import already yields `module.exports` for CJS, so no unwrap is needed. Guarded by `bundler.test.ts` - the compiled probe fetches a draft-06 schema through a local stub registry.
- **The pattern is anchored to `^const ... ;$`**, so the lazy `return require('protobufjs').parse;` inside a method never matches. `SKIPPED_SPECIFIERS` (`protobufjs`, `@node-rs/crc32`) is defence in depth: both are optional peers, and a static import would break builds that do not install them.
- **No match returns `undefined`**, so the plugin is an inert no-op once upstream fixes this. An unresolvable specifier fails the BUILD with Bun's own error rather than dying at runtime - that is the point of hoisting.

## Conventions

Every helper extends `BaseHelper`, giving it scoped logging (`this.logger.for('methodName').debug(...)`) and an `IConfigurable`-style `configure(opts?)` lifecycle. All public functions take options objects, never positional arguments. `RuntimeModules.detect()` (and `.isBun()`/`.isNode()`) gate any runtime-specific branch.

## Related

- [helpers catalog](/reference/helpers.md)
- [inversion](/packages/inversion.md)
- [boot](/packages/boot.md)
- [core](/packages/core.md)
- [Repository hierarchy](/architecture/repository-hierarchy.md)
