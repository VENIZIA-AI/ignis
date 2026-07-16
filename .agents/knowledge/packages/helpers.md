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

- **logger** - Winston-based `DefaultLogger` with console, daily-rotate-file, and UDP transports; `LoggerFactory`/`Logger.get(scope)` for cached scoped loggers.
- **redis** - `AbstractRedisHelper` is the shared data API; `RedisSingleHelper`, `RedisClusterHelper`, and `RedisSentinelHelper` implement it for the three topologies, selected via `createRedisHelper({ mode })`. Consumers should depend on the `IRedisHelper` interface and use `instanceof AbstractRedisHelper` for identity checks.
- **queue** - `BullMQHelper` (Redis-backed queue/worker pair), `QueueHelper` (in-memory, generator-based, state machine `WAITING -> PROCESSING -> LOCKED -> SETTLED`), `MQTTClientHelper`, and a Kafka bundler.
- **pool** - a generic, engine-neutral object pool: `AbstractPoolHelper<T>` owns state and a single re-entrancy-guarded dispatch loop pairing idle resources with waiting acquirers; `BasePoolHelper` is the concrete, callback-configured subclass. The waiter queue is backed by an internal `HfQueueHelper` (O(1) FIFO, no array shift/splice on the hot path).
- **storage** - `BaseStorageHelper` abstract base with `MinioHelper`, `DiskHelper`, and `MemoryStorageHelper` implementations; `isValidName()` guards against path traversal and injection.
- **crypto** - `BaseCryptoAlgorithm` with AES (`aes-256-cbc`/`aes-256-gcm`) and RSA implementations, including file encrypt/decrypt.
- **network** - fetch-based HTTP client in the root barrel; TCP/TLS/UDP servers and clients.
- **uid** - `SnowflakeUidHelper`, a 70-bit Snowflake ID generator (48-bit timestamp + 10-bit worker ID + 12-bit sequence) with Base62 encoding.
- **env** - `Environment` (reads `process.env.NODE_ENV`) and `ApplicationEnvironment({ prefix, envs })` for prefixed, typed environment access.

## Sub-path exports isolate optional peers

Helpers that depend on an optional peer package are never re-exported from the root barrel - they are reachable only via their own sub-path, so importing `@venizia/ignis-helpers` never forces that peer into a consumer's bundle. Confirmed sub-path-only exports: `@venizia/ignis-helpers/socket-io`, `/bullmq`, `/mqtt`, `/minio`, `/bun-s3`, `/axios`, `/cron`, and `/kafka`. A dedicated test asserts the root barrel never re-exports the axios fetcher for exactly this reason.

## Gotcha: Kafka and compiled binaries

The Kafka bundler's `@platformatic/wasm-utils` dependency reads `native.wasm` off disk at module load. `bun build --compile` never embeds that file, so a compiled binary dies with `ENOENT` before the app boots. The `platformaticWasmPlugin()` (re-exported from the `/kafka` sub-path) redirects the import to a `/bundled` entrypoint with the wasm inlined - any app compiling a binary with Kafka helpers must register this plugin in its own `Bun.build()` call, since the `bun build --compile` CLI itself accepts no plugins.

## Conventions

Every helper extends `BaseHelper`, giving it scoped logging (`this.logger.for('methodName').debug(...)`) and an `IConfigurable`-style `configure(opts?)` lifecycle. All public functions take options objects, never positional arguments. `RuntimeModules.detect()` (and `.isBun()`/`.isNode()`) gate any runtime-specific branch.

## Related

- [helpers catalog](/reference/helpers.md)
- [inversion](/packages/inversion.md)
- [boot](/packages/boot.md)
- [core](/packages/core.md)
