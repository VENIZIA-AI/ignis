# @venizia/ignis-helpers

Production utilities for IGNIS and for any Bun project: a scoped logger, Redis, queues, object storage, crypto, dates, IDs, networking and worker threads. `@venizia/ignis` already depends on it; install it directly when you use the helpers on their own or need one of the sub-paths below.

## Install

```bash
bun add @venizia/ignis-helpers
```

The root entry loads with no optional peer installed. Every third-party backend (pino, ioredis, bullmq, Kafka, ...) is an optional peer you add only when you use it - see [Entry points](#entry-points).

## Example

Register a logger provider once at the entrypoint, then take scoped loggers and helpers anywhere:

```typescript
// bun add pino ioredis
import { createRedisHelper, LoggerFactory, RedisModes } from '@venizia/ignis-helpers';
import { PinoLogger } from '@venizia/ignis-helpers/pino';

LoggerFactory.use({ provider: PinoLogger });

const logger = LoggerFactory.getLogger(['CacheService']);

const redis = createRedisHelper({
  mode: RedisModes.SINGLE,
  name: 'cache',
  host: '127.0.0.1',
  port: 6379,
  password: Bun.env.REDIS_PASSWORD ?? '',
});

await redis.set({ key: 'user:1', value: { name: 'IGNIS' }, options: { expiresIn: 60_000 } });
const user = await redis.get({ key: 'user:1', transform: JSON.parse });

logger.for('warmup').info('Cache warmed | user: %j', user);
```

Notice that your code only ever types against `ILogger`. `LoggerFactory.use()` swaps the backend for every logger handed out so far. With no provider registered, the factory falls back to winston on the first log call.

Dates and IDs need no peer at all:

```typescript
import { TemporalHelper } from '@venizia/ignis-helpers/temporal';
import { UuidHelper } from '@venizia/ignis-helpers/uuid';

const temporal = new TemporalHelper({ timeZone: 'Asia/Ho_Chi_Minh' });
const paidAt = temporal.parse({ value: '20260919120000', pattern: 'YYYYMMDDHHmmss' });
paidAt.toISOString(); // '2026-09-19T05:00:00.000Z'

UuidHelper.getInstance().v7(); // time-ordered, for a database key
```

`TemporalHelper` uses the runtime's `Temporal` by default. To use a date library you already have, pass `DayjsTemporalAdapter` or `LuxonTemporalAdapter` - this package imports neither.

## Entry points

A helper that imports an optional peer as a value lives only on its own sub-path, so the root entry stays peer-free and a bundler packages only the backends you import.

| Sub-path | What it gives | Extra peers |
|---|---|---|
| `.` | Everything peer-free: `LoggerFactory`, `ILogger`, `HfLogger`, Redis helpers (`createRedisHelper`), `SequentialQueueHelper`, disk and in-memory storage, `AES` / `RSA` / `ECDH`, fetch and TCP / TLS / UDP helpers, Bun WebSocket server, `createSecretsHelper`, `ApplicationEnvironment`, `WorkerPoolHelper`, `RetryHelper`, `TemporalHelper`, `UuidHelper`, `SnowflakeUidHelper`, `ModuleUtility`, `getError` | none to load. `ioredis` to use Redis; `hono` for the JSX types |
| `./core` | Browser-safe runtime classes: `BaseHelper`, the error module, `RetryHelper`, `TemporalHelper`, `UuidHelper`, `TreeBuilder`, `TreeWalker`, `SlugHelper`, `UrlPolicy`, parse utilities | none |
| `./common` | Constants, types, redaction and resolvers | none |
| `./uuid` | `UuidHelper` and the standalone `uuidV4`, `uuidV5`, `uuidV7` | none |
| `./temporal` | `TemporalHelper` and the `Native`, `Dayjs`, `Luxon` temporal adapters | none (your own `dayjs` or `luxon` if you pick that adapter) |
| `./winston` | `WinstonLogger` | `winston`, `winston-transport`, `winston-daily-rotate-file` |
| `./pino` | `PinoLogger` | `pino` (`pino-pretty` for text output, `pino-roll` for file rotation) |
| `./bullmq` | `BullMQHelper` | `bullmq` |
| `./mqtt` | `MQTTClientHelper` | `mqtt` |
| `./kafka` | `KafkaProducerHelper`, `KafkaConsumerHelper`, `KafkaAdminHelper`, schema registry, bundler plugins | `@platformatic/kafka` |
| `./minio` | `MinioHelper` | `minio` |
| `./bun-s3` | `BunS3Helper` | none - Bun's native S3 client (Bun only) |
| `./socket-io` | `SocketIOServerHelper`, `SocketIOClientHelper` | `socket.io`, `@socket.io/redis-adapter`, `@socket.io/redis-emitter`; `socket.io-client` for the client |
| `./axios` | `AxiosFetcher`, `AxiosNetworkRequest` | `axios` |
| `./cron` | `CronHelper` | `cron` |
| `./hashicorp-vault` | `HashiCorpVaultHelper` | `node-vault` |
| `./dotenv-vault` | `DotenvVaultHelper` | `@dotenvx/dotenvx` |

Every entry ships as both CommonJS and ESM.

### Compiled binaries

`ioredis`, `bullmq`, `socket.io-client`, `node-vault` and `@dotenvx/dotenvx` load by name at runtime. A `bun build --compile` binary has no `node_modules` to find them in. Import the peer yourself and hand it over, either through the helper's `module` option or once at the entrypoint:

```typescript
import * as ioredis from 'ioredis';
import { ModuleUtility } from '@venizia/ignis-helpers';

ModuleUtility.register({ modules: { ioredis } });
```

A binary must also call `LoggerFactory.use()` explicitly - the winston fallback cannot reach a bundle. Details: [Module Utility](https://ignis.venizia.ai/references/utilities/module).

## Where it sits

`dev-configs -> inversion -> {filter, helpers} -> {boot, kernel} -> connectors -> {core-worker, core-server} -> atlas`. It depends on `@venizia/ignis-inversion`; `boot`, `kernel` and everything later depend on it.

## Links

[Helpers documentation](https://ignis.venizia.ai/extensions/helpers/) -
[Logger](https://ignis.venizia.ai/extensions/helpers/logger/) -
[Temporal](https://ignis.venizia.ai/extensions/helpers/temporal/) -
[UID](https://ignis.venizia.ai/extensions/helpers/uid/) -
[Changelog](https://ignis.venizia.ai/changelogs/) -
[Issues](https://github.com/VENIZIA-AI/ignis/issues)

MIT licensed - see [LICENSE.md](LICENSE.md).
