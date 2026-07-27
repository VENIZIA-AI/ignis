<div align="center">

<br />

# :fire: IGNIS - `@venizia/ignis-helpers`

**The infrastructure layer: logging, Redis, queues, storage, crypto, networking.**

[![Docs](https://img.shields.io/badge/Docs-ignis.venizia.ai-2563EB.svg?style=flat-square)](https://ignis.venizia.ai/extensions/helpers/)
[![npm](https://img.shields.io/npm/v/@venizia/ignis-helpers.svg?style=flat-square&color=cb3837&label=@venizia/ignis-helpers)](https://www.npmjs.com/package/@venizia/ignis-helpers)
[![License: MIT](https://img.shields.io/badge/License-MIT-3DA639.svg?style=flat-square)](LICENSE.md)
[![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.3-f472b6.svg?style=flat-square&logo=bun&logoColor=white)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178C6.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

[Documentation](https://ignis.venizia.ai/extensions/helpers/) &#8226;
[Logger](https://ignis.venizia.ai/extensions/helpers/logger/) &#8226;
[Core API](https://ignis.venizia.ai/references/) &#8226;
[Changelog](https://ignis.venizia.ai/changelogs/)

</div>

---

The pieces every server needs and nobody wants to write again: a scoped logger, Redis, job queues,
object storage, crypto, cron, sockets, HTTP clients, distributed IDs, worker threads.

Every helper extends `BaseHelper`, so it arrives with a scoped `logger` and an `identifier` already
wired. `@venizia/ignis` depends on this package - install it directly when you want the helpers
outside the framework, or when you need one of the sub-paths below.

## Install

```bash
bun add @venizia/ignis-helpers
```

Nothing heavy comes with it. Every module with a third-party backend declares that backend as an
**optional peer** - install only the ones you use.

## Usage

```typescript
// src/index.ts - the entrypoint, before anything logs
import { LoggerFactory } from '@venizia/ignis-helpers';
import { PinoLogger } from '@venizia/ignis-helpers/pino';

LoggerFactory.use({ provider: PinoLogger });
```

```typescript
// anywhere else - provider-agnostic
import { createRedisHelper, ILogger, LoggerFactory, RedisModes } from '@venizia/ignis-helpers';

const logger: ILogger = LoggerFactory.getLogger(['CacheService']);

const redis = createRedisHelper({
  mode: RedisModes.SINGLE,
  name: 'cache',
  host: '127.0.0.1',
  port: 6379,
});

await redis.set({ key: 'user:1', value: { name: 'IGNIS' }, options: { expiresIn: 60_000 } });
const user = await redis.get<{ name: string }>({ key: 'user:1', transform: JSON.parse });

logger.for('warmup').info('Cache warmed | user: %j', user);
```

## Sub-path exports

**This is the one thing to get right.** A helper that value-imports an optional peer is reachable
**only** from its own sub-path. The root barrel is peer-free by construction: `import
'@venizia/ignis-helpers'` works with zero peers installed, and your bundler only ever packages the
backends you imported by name.

| Sub-path | Exports | Peer dependencies to install |
| :--- | :--- | :--- |
| `/winston` | `WinstonLogger` | `winston`, `winston-transport`, `winston-daily-rotate-file` |
| `/pino` | `PinoLogger` | `pino` (+ `pino-pretty` for text format, `pino-roll` for file rotation) |
| `/bullmq` | `BullMQHelper` | `bullmq` |
| `/mqtt` | `MQTTClientHelper` | `mqtt` |
| `/kafka` | `KafkaProducerHelper`, `KafkaConsumerHelper`, `KafkaAdminHelper`, ... | `@platformatic/kafka` |
| `/minio` | `MinioHelper` | `minio` |
| `/bun-s3` | `BunS3Helper` | none - Bun's native S3 client |
| `/socket-io` | `SocketIOServerHelper`, `SocketIOClientHelper` | `socket.io`, `socket.io-client` (+ `@socket.io/redis-adapter`, `@socket.io/redis-emitter` for multi-node) |
| `/axios` | `AxiosFetcher`, `AxiosNetworkRequest` | `axios` |
| `/cron` | `CronHelper` | `cron` |
| `/hashicorp-vault` | `HashiCorpVaultHelper` | `node-vault` |
| `/dotenv-vault` | `DotenvVaultHelper` | `@dotenvx/dotenvx` |

```bash
# example: pino logging + BullMQ jobs + MinIO storage
bun add pino bullmq minio
```

Everything else - Redis (`ioredis` is a real dependency), disk and in-memory storage, crypto,
network, UID, env, pool, worker threads - comes straight off the root barrel.

## Modules

| Module | What it gives you |
| :--- | :--- |
| [logger](https://ignis.venizia.ai/extensions/helpers/logger/) | Scoped `ILogger` over a pluggable winston or pino backend, plus `HfLogger` for hot paths |
| [redis](https://ignis.venizia.ai/extensions/helpers/redis/) | Single, cluster, and sentinel clients over `ioredis`: key-value, hash, RedisJSON, pub/sub |
| [queue](https://ignis.venizia.ai/extensions/helpers/queue/) | BullMQ jobs, MQTT topics, [Kafka](https://ignis.venizia.ai/extensions/helpers/kafka/) producers and consumers, plus an in-process `SequentialQueueHelper` |
| [storage](https://ignis.venizia.ai/extensions/helpers/storage/) | One `IStorageHelper` interface over MinIO/S3, Bun S3, local disk, and memory |
| [crypto](https://ignis.venizia.ai/extensions/helpers/crypto/) | `AES`, `RSA`, `ECDH` - encryption, signing, and key exchange |
| [cron](https://ignis.venizia.ai/extensions/helpers/cron/) | `CronHelper`: declarative schedules with lifecycle hooks |
| [socket](https://ignis.venizia.ai/extensions/helpers/socket-io/) | Socket.IO server and client, plus a [Bun-native WebSocket](https://ignis.venizia.ai/extensions/helpers/websocket/) server |
| [network](https://ignis.venizia.ai/extensions/helpers/network/) | HTTP fetchers (native or axios) and TCP, TLS, UDP clients and servers |
| [uid](https://ignis.venizia.ai/extensions/helpers/uid/) | `SnowflakeUidHelper`: 70-bit time-sortable IDs with Base62 encoding, ~4M/sec/worker |
| [env](https://ignis.venizia.ai/extensions/helpers/env/) | `ApplicationEnvironment`: prefixed, typed access to `process.env` |
| pool | `BasePoolHelper`: generic resource pooling with an O(1) FIFO wait queue |
| [secrets](https://ignis.venizia.ai/extensions/helpers/secrets/) | `createSecretsHelper`: system envs, HashiCorp Vault, or dotenvx behind one interface |
| [worker-thread](https://ignis.venizia.ai/extensions/helpers/worker-thread/) | `WorkerPoolHelper` and a typed message bus for CPU-bound work |

Also on the root barrel: [error](https://ignis.venizia.ai/extensions/helpers/error/) helpers
(`getError`, `ApplicationError`, `isApplicationError`) and utilities for dates, parsing, promises,
retries, and requests.

## Logging

Consumers type against **`ILogger`** and never name a concrete logger class. Get one three ways:

| Source | When |
| :--- | :--- |
| `this.logger` | Inside anything extending `BaseHelper` - already scoped |
| `LoggerFactory.getLogger(['Service', 'method'])` | Anywhere; scopes join with `-` |
| `ApplicationLogger.get('MyService')` | Single-scope shorthand |

`logger.for('methodName')` returns a child logger scoped to that method.

**Exactly five levels**, in severity order: `debug`, `info`, `warn`, `error`, `emerg`. `debug()` is
gated once at module load by `DEBUG` plus an `NODE_ENV` allowlist.

**Provider selection** happens once, at the entrypoint, through `LoggerFactory.use({ provider })`.
The factory hands out stable wrappers that resolve their backend lazily, so loggers acquired before
`use()` re-point to the new provider. With no provider registered, winston loads on the first log
call.

> [!IMPORTANT]
> Compiled binaries (`bun build --compile`) **must** call `LoggerFactory.use()` explicitly. The
> winston fallback is a runtime `require`, which a bundler cannot see - only a class reference
> carries a provider into a bundle.

`HfLogger` is a separate ring-buffered logger for hot paths where allocation matters, drained by
`HfLogFlusher`. Reach for it when profiling says to, not before.

### Environment variables

| Variable | Default | Effect |
| :--- | :--- | :--- |
| `APP_ENV_LOGGER_LEVEL` | `debug` | Floor below which a line reaches no transport |
| `APP_ENV_LOGGER_FORMAT` | `text` (winston) / `json` (pino) | `json` or `text`; pino needs `pino-pretty` for `text` |
| `APP_ENV_LOGGER_FOLDER_PATH` | unset | Set it to enable rotating file output; unset means console or stdout only |
| `APP_ENV_LOGGER_FILE_FREQUENCY` | `1h` | Rotation interval |
| `APP_ENV_LOGGER_FILE_MAX_SIZE` | `100m` | Size at which a file rotates |
| `APP_ENV_LOGGER_FILE_MAX_FILES` | `5d` | Retention |
| `APP_ENV_LOGGER_FILE_DATE_PATTERN` | `YYYYMMDD_HH` | Filename date pattern (winston only) |
| `APP_ENV_LOGGER_DGRAM_HOST` / `_PORT` / `_LABEL` / `_LEVELS` | unset | UDP transport for remote log shipping (winston only) |
| `APP_ENV_LOGGER_DO_REDACT` | `true` | Set `false` to stop redacting secret-looking keys |
| `APP_ENV_LOGGER_INSPECT_DEPTH` | `5` | Depth before a nested object collapses to `[Object]` |
| `DEBUG` + `NODE_ENV` | unset | Together gate `debug()`; read once at module load |

Full detail: [Logger reference](https://ignis.venizia.ai/extensions/helpers/logger/).

## Requirements

- **Bun >= 1.3.** Node.js 18+ runs most modules; the Bun-native ones (`/bun-s3`, the WebSocket
  server) need Bun.
- `experimentalDecorators` and `emitDecoratorMetadata` must be `true` in your `tsconfig.json`,
  declared **inline** - Bun does not resolve them through `extends`. Copy them from
  `@venizia/dev-configs/tsconfig.common.json`.
- Errors always go through `getError` / `ApplicationError`, never `new Error`. Across package
  boundaries check with `isApplicationError()`, never `instanceof` - the class has more than one
  identity in a monorepo.

## Links

[Helpers documentation](https://ignis.venizia.ai/extensions/helpers/) &#8226;
[All extensions](https://ignis.venizia.ai/extensions/) &#8226;
[Best practices](https://ignis.venizia.ai/best-practices/) &#8226;
[Changelog](https://ignis.venizia.ai/changelogs/) &#8226;
[Issues](https://github.com/VENIZIA-AI/ignis/issues)

MIT licensed - see [LICENSE.md](LICENSE.md). Questions: developer@venizia.ai
</content>
