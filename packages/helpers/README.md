<div align="center">

# :fire: IGNIS - @venizia/ignis-helpers

**Production-ready infrastructure utilities for the IGNIS Framework**

[![npm](https://img.shields.io/npm/v/@venizia/ignis-helpers.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@venizia/ignis-helpers)
[![License](https://img.shields.io/badge/License-MIT-3DA639.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

Logging, Redis, queues (BullMQ/MQTT/Kafka), storage (MinIO/Disk/Memory), cryptography (AES/RSA/ECDH), networking (TCP/TLS/UDP/HTTP), cron, Socket.IO, WebSocket, UID generation, worker threads, and more. Designed to integrate seamlessly with the IGNIS IoC container.

[Installation](#installation) &#8226; [Quick Start](#module-overview) &#8226; [API Reference](#logger) &#8226; [Documentation](https://venizia-ai.github.io/ignis)

</div>

## Highlights

| | Feature | |
| :---: | :--- | :--- |
| **1** | **14+ Production Modules** | Logger, Redis, Queue, Storage, Crypto, Network, and more |
| **2** | **Pluggable Architecture** | Install only what you use via optional peer deps |
| **3** | **Sub-Path Imports** | Tree-shake heavy modules with `@venizia/ignis-helpers/redis` |
| **4** | **Consistent API** | Every helper extends `BaseHelper` with scoped logging |
| **5** | **HfLogger** | Zero-allocation ring buffer logger for hot paths (~100-300ns) |
| **6** | **Snowflake UID** | 70-bit distributed IDs at ~4M/sec/worker |

---

## At a Glance

The 5 most common imports:

```typescript
import { LoggerFactory } from '@venizia/ignis-helpers';
import { RedisHelper } from '@venizia/ignis-helpers/redis';
import { BullMQHelper } from '@venizia/ignis-helpers/bullmq';
import { MinioHelper } from '@venizia/ignis-helpers/minio';
import { CryptoHelper } from '@venizia/ignis-helpers/crypto';
```

---

## Table of Contents

- [Installation](#installation)
- [Module Overview](#module-overview)
- [Logger](#logger)
  - [Logger Class](#logger-class)
  - [Log Levels](#log-levels)
  - [LoggerFactory Caching](#loggerfactory-caching)
  - [Custom Logger](#custom-logger)
  - [Transport Types](#transport-types)
  - [HfLogger (High-Frequency Logger)](#hflogger-high-frequency-logger)
  - [Logger Environment Variables](#logger-environment-variables)
- [Redis](#redis)
  - [Single Instance](#single-instance)
  - [Cluster](#cluster)
  - [String Operations](#string-operations)
  - [Hash Operations](#hash-operations)
  - [Batch Operations](#batch-operations)
  - [Key Operations](#key-operations)
  - [RedisJSON Operations](#redisjson-operations)
  - [Pub/Sub with Compression](#pubsub-with-compression)
  - [Raw Command Execution](#raw-command-execution)
  - [Connection Management](#connection-management)
  - [Redis Event Lifecycle](#redis-event-lifecycle)
  - [Reconnection Behavior](#reconnection-behavior)
- [Queue](#queue)
  - [BullMQ](#bullmq)
  - [In-Memory Queue](#in-memory-queue)
  - [MQTT](#mqtt)
  - [Kafka (Experimental)](#kafka-experimental)
- [Storage](#storage)
  - [Common Interface (IStorageHelper)](#common-interface-istoragehelper)
  - [Security Validation](#security-validation)
  - [MinIO (S3-Compatible)](#minio-s3-compatible)
  - [Disk](#disk)
  - [Memory Storage](#memory-storage)
- [Crypto](#crypto)
  - [AES](#aes)
  - [RSA](#rsa)
  - [ECDH](#ecdh)
  - [Crypto Utility (hash)](#crypto-utility-hash)
- [Cron](#cron)
- [Socket.IO](#socketio)
  - [Server](#socketio-server)
  - [Client](#socketio-client)
  - [Authentication Flow](#socketio-authentication-flow)
- [WebSocket (Bun Native)](#websocket-bun-native)
  - [Server Setup](#websocket-server-setup)
  - [Messaging API](#websocket-messaging-api)
  - [Encryption Support](#websocket-encryption-support)
  - [WebSocket Authentication Flow](#websocket-authentication-flow)
- [Network](#network)
  - [HTTP Clients](#http-clients)
  - [TCP](#tcp)
  - [UDP](#udp)
- [UID (Snowflake)](#uid-snowflake)
  - [Bit Layout](#bit-layout)
  - [API Reference](#uid-api-reference)
  - [Throughput and Limits](#throughput-and-limits)
- [Environment](#environment)
- [Error](#error)
- [Worker Thread](#worker-thread)
- [Common Utilities](#common-utilities)
  - [Date Utility](#date-utility)
  - [Parse Utility](#parse-utility)
  - [Promise Utility](#promise-utility)
  - [Request Utility](#request-utility)
  - [Performance Utility](#performance-utility)
  - [Module Utility](#module-utility)
- [Common Types](#common-types)
- [Key Patterns](#key-patterns)
- [Integration with IGNIS Core](#integration-with-ignis-core)
- [Environment Variables Reference](#environment-variables-reference)
- [Error Handling Patterns](#error-handling-patterns)
- [Performance Tips](#performance-tips)
- [License](#license)

---

## Installation

```bash
bun add @venizia/ignis-helpers
```

The package has several **optional peer dependencies** that you install only for the modules you need:

| Peer Dependency                  | Required For                 | Install Command                         |
| -------------------------------- | ---------------------------- | --------------------------------------- |
| `bullmq`                        | BullMQ queue/worker          | `bun add bullmq`                       |
| `cron`                          | Cron job scheduling          | `bun add cron`                          |
| `minio`                         | MinIO/S3 storage             | `bun add minio`                         |
| `mqtt`                          | MQTT pub/sub                 | `bun add mqtt`                          |
| `socket.io`                     | Socket.IO server             | `bun add socket.io`                     |
| `socket.io-client`              | Socket.IO client             | `bun add socket.io-client`              |
| `@socket.io/redis-adapter`      | Socket.IO Redis adapter      | `bun add @socket.io/redis-adapter`      |
| `@socket.io/redis-emitter`      | Socket.IO Redis emitter      | `bun add @socket.io/redis-emitter`      |
| `axios`                         | Axios HTTP client            | `bun add axios`                         |
| `@platformatic/kafka`           | Kafka producer/consumer      | `bun add @platformatic/kafka`           |

**Sub-path imports** are available for tree-shaking heavy optional dependencies:

```typescript
import { BullMQHelper } from '@venizia/ignis-helpers/bullmq';
import { MQTTClientHelper } from '@venizia/ignis-helpers/mqtt';
import { MinioHelper } from '@venizia/ignis-helpers/minio';
import { SocketIOServerHelper } from '@venizia/ignis-helpers/socket-io';
import { AxiosNetworkRequest } from '@venizia/ignis-helpers/axios';
import { CronHelper } from '@venizia/ignis-helpers/cron';
import { KafkaProducerHelper, KafkaConsumerHelper, KafkaAdminHelper } from '@venizia/ignis-helpers/kafka';
```

**Core dependencies** (always installed):

| Dependency                                                    | Purpose                                  |
| ------------------------------------------------------------- | ---------------------------------------- |
| `winston` + `winston-daily-rotate-file` + `winston-transport` | Logger transports                        |
| `ioredis`                                                     | Redis client                             |
| `dayjs`                                                       | Date/time utilities                      |
| `hono`                                                        | HTTP framework types, JSX re-exports     |
| `drizzle-orm`                                                 | ORM types (used across IGNIS)            |
| `lodash`                                                      | Utility functions                        |
| `reflect-metadata`                                            | Decorator metadata                       |
| `@venizia/ignis-inversion`                                    | IoC container, `@inject`/`@injectable`   |

---

## Module Overview

| Module               | Description                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------- |
| **Logger**           | Winston-based logging with daily file rotation, scoped loggers, JSON/text formats, and UDP transport |
| **HfLogger**         | High-frequency zero-allocation ring buffer logger for hot paths (~100--300ns)                  |
| **Redis**            | Single instance and Cluster support via IoRedis with auto-reconnect, pub/sub, JSON commands, and zlib compression |
| **Queue (BullMQ)**   | Redis-backed distributed job queue with producer/worker roles                                 |
| **Queue (Internal)** | In-memory generator-based queue with state machine (WAITING/PROCESSING/LOCKED/SETTLED)        |
| **Queue (MQTT)**     | MQTT client for IoT and lightweight pub/sub messaging                                         |
| **Queue (Kafka)**    | Kafka producer, consumer, and admin via `@platformatic/kafka` (experimental)                  |
| **Storage (MinIO)**  | S3-compatible object storage with bucket management and file upload                           |
| **Storage (Disk)**   | Local filesystem storage with the same `IStorageHelper` interface                             |
| **Storage (Memory)** | In-memory key-value storage helper                                                            |
| **Crypto (AES)**     | AES-256-CBC and AES-256-GCM encryption/decryption with file support                          |
| **Crypto (RSA)**     | RSA key pair generation and public/private key encryption                                     |
| **Crypto (ECDH)**    | ECDH P-256 key exchange with HKDF-derived AES-256-GCM (Web Crypto API)                       |
| **Cron**             | Cron job scheduling with modification and duplication                                         |
| **Socket.IO**        | Socket.IO server and client helpers with Redis adapter, auth flow, and room management        |
| **WebSocket**        | Bun-native WebSocket server with Redis pub/sub, encryption support, room/user management      |
| **Network (HTTP)**   | HTTP request clients with Axios and native fetch backends                                     |
| **Network (TCP)**    | TCP server and client with TLS support, auth flow, and client state tracking                  |
| **Network (UDP)**    | UDP client with multicast support                                                             |
| **UID**              | Snowflake ID generator (48-10-12 bit layout) with Base62 encoding, ~4M IDs/sec/worker        |
| **Environment**      | Environment detection (`NODE_ENV`) and prefixed env var management                            |
| **Error**            | Standardized `ApplicationError` with status codes and message codes                           |
| **Worker Thread**    | Worker pool management, worker bus for inter-thread messaging                                 |

---

## Logger

Winston-based logging system with console, daily-rotated file, and UDP (dgram) transports.

### Logger Class

The primary logger with scope-based caching and `[Scope]` prefixed output.

```typescript
import { Logger, LoggerFactory } from '@venizia/ignis-helpers';

// Get a logger (cached by scope)
const logger = Logger.get('UserService');
logger.info('User created');        // [UserService] User created
logger.error('Something failed');   // [UserService] Something failed

// Create a method-scoped child logger
logger.for('createUser').info('Validating input');
// [UserService-createUser] Validating input

// Using LoggerFactory (array-based scope)
const log = LoggerFactory.getLogger(['OrderService', 'v2']);
log.info('Processing order');       // [OrderService-v2] Processing order

// Custom Winston logger instance
import { defineCustomLogger } from '@venizia/ignis-helpers';
const customWinston = defineCustomLogger({ /* ... */ });
const customScopedLogger = Logger.get('MyScope', customWinston);
```

### Log Levels

The logger defines a custom level hierarchy. Lower numeric priority means higher severity:

| Level     | Priority | Description              | Color   |
| --------- | -------- | ------------------------ | ------- |
| `error`   | 0        | Error conditions         | Red     |
| `alert`   | 0        | Alert conditions         | Red     |
| `emerg`   | 0        | Emergency conditions     | Red     |
| `warn`    | 1        | Warning conditions       | Yellow  |
| `info`    | 2        | Informational messages   | Green   |
| `http`    | 3        | HTTP request logging     | Magenta |
| `verbose` | 4        | Verbose output           | Gray    |
| `debug`   | 5        | Debug messages (requires `DEBUG=true`) | Blue |
| `silly`   | 6        | Most verbose             | Gray    |

**Debug level behavior:** The `debug` method is gated at module load time. It only produces output when:

1. `DEBUG` env var is truthy, AND
2. `NODE_ENV` is one of the common environments (`local`, `debug`, `development`, `alpha`, `beta`, `staging`, `production`) or listed in `APP_ENV_EXTRA_LOG_ENVS`.

This means calling `logger.debug()` in production with `DEBUG=false` has **zero runtime cost** -- the check is pre-computed once at module load.

```typescript
// Available log methods on Logger:
logger.debug('msg', ...args);  // Only when DEBUG=true
logger.info('msg', ...args);
logger.warn('msg', ...args);
logger.error('msg', ...args);
logger.emerg('msg', ...args);
logger.log('http', 'msg', ...args); // Generic method for any level
```

### LoggerFactory Caching

`Logger.get(scope)` uses a `Map<string, Logger>` for global caching. The same scope always returns the same Logger instance:

```typescript
const a = Logger.get('UserService');
const b = Logger.get('UserService');
console.log(a === b); // true -- same cached instance

// Method-scoped loggers are also cached
const c = a.for('create');
const d = a.for('create');
console.log(c === d); // true -- cached as 'UserService-create'

// Custom loggers use a separate cache key ('scope:custom')
const custom = Logger.get('MyScope', customWinstonLogger);
```

### Custom Logger

Build a fully custom Winston logger with file rotation and UDP transports:

```typescript
import {
  defineCustomLogger,
  defineLogFormatter,
  defineJsonLoggerFormatter,
  definePrettyLoggerFormatter,
  LoggerFormats,
} from '@venizia/ignis-helpers';

// Create a custom formatter
const myFormatter = defineLogFormatter({
  label: 'MyApp',
  format: 'json', // 'json' or 'text'
});

// Or use specific formatters directly
const jsonFormat = defineJsonLoggerFormatter({ label: 'MyApp' });
// Combines: label, timestamp, splat, errors(stack), json, colorize

const prettyFormat = definePrettyLoggerFormatter({ label: 'MyApp' });
// Combines: simple, label, timestamp, splat, align, colorize, printf, errors(stack)
// Output: "2025-01-01T00:00:00.000Z [MyApp] info: message"

// Full custom logger with all transport options
const myLogger = defineCustomLogger({
  // Optional: override default log levels
  logLevels: {
    error: 0,
    warn: 1,
    info: 2,
    debug: 5,
  },
  // Optional: override default colors
  logColors: {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    debug: 'blue',
  },
  // Optional: custom formatter (defaults to applicationLogFormatter)
  loggerFormatter: myFormatter,
  transports: {
    info: {
      file: {
        folder: './logs',
        prefix: 'myapp',
        frequency: '1h',        // Rotation frequency
        maxSize: '100m',        // Max file size
        maxFiles: '5d',         // Retention period
        datePattern: 'YYYYMMDD_HH',
      },
      dgram: {
        socketOptions: { type: 'udp4' },
        host: '127.0.0.1',
        port: 9999,
        label: 'myapp-info',
        levels: ['info', 'warn'], // Only forward these levels via UDP
      },
    },
    error: {
      file: {
        folder: './logs',
        prefix: 'myapp',
      },
      dgram: {
        socketOptions: { type: 'udp4' },
        host: '127.0.0.1',
        port: 9999,
        label: 'myapp-error',
        levels: ['error', 'emerg'],
      },
    },
  },
});
```

### Transport Types

**Console Transport:**
Always active. Level: `debug`. Provides colorized output to stdout.

**DailyRotateFile Transport:**
Configured per info/error channel. Automatically rotates files based on time and size.

```
./logs/APP-info-20250101_14.log    # Rotated hourly by default
./logs/APP-error-20250101_14.log
```

| Option        | Default        | Description                              |
| ------------- | -------------- | ---------------------------------------- |
| `frequency`   | `1h`           | How often to rotate                      |
| `maxSize`     | `100m`         | Maximum size before forced rotation      |
| `maxFiles`    | `5d`           | How long to retain rotated files         |
| `datePattern` | `YYYYMMDD_HH`  | Date format in rotated filenames         |

**UDP/Dgram Transport:**
Forwards log messages over UDP to a remote collector. Only activates when host, port, label, and levels are all provided.

```typescript
// The DgramTransport class extends winston-transport
// It only sends messages matching the configured levels
import { DgramTransport } from '@venizia/ignis-helpers';

const transport = new DgramTransport({
  label: 'my-service',
  host: '10.0.0.1',
  port: 5140,
  levels: ['error', 'warn'],        // Only forward these levels
  socketOptions: { type: 'udp4' },
});

// Or use the safe factory (returns null if any required option is missing)
const safeTransport = DgramTransport.fromPartial({
  host: process.env.LOG_UDP_HOST,   // If undefined, returns null
  port: parseInt(process.env.LOG_UDP_PORT ?? '0'),
  label: 'my-service',
  levels: ['error'],
  socketOptions: { type: 'udp4' },
});
```

The Dgram transport auto-reconnects on socket errors and formats messages as:

```
<timestamp> [<label>] <level> <message>
```

### HfLogger (High-Frequency Logger)

Zero-allocation logger using a pre-allocated `SharedArrayBuffer` ring buffer for latency-critical hot paths (~100--300ns per log). Designed for trading engines, real-time pipelines, and any code path where Winston's overhead is unacceptable.

**Architecture:**

- 64K-entry ring buffer (65,536 slots x 256 bytes = 16MB `SharedArrayBuffer`)
- Lock-free writes via atomic increment of write index
- Entries are written in binary format, flushed asynchronously to disk

**Entry format (256 bytes per entry):**

| Offset  | Size      | Field                                        |
| ------- | --------- | -------------------------------------------- |
| 0--7    | 8 bytes   | Timestamp (BigInt64, nanosecond precision)    |
| 8       | 1 byte    | Level (0=debug, 1=info, 2=warn, 3=error, 4=emerg) |
| 9--40   | 32 bytes  | Scope (fixed-width, padded)                  |
| 41--255 | 215 bytes | Message (fixed-width, truncated if longer)   |

```typescript
import { HfLogger, HfLogFlusher } from '@venizia/ignis-helpers';

// --- Initialization phase (once, before hot path) ---

// Get a cached logger instance (scope bytes are pre-computed)
const logger = HfLogger.get('OrderEngine');

// Pre-encode messages at init time (ZERO allocation in hot path)
const MSG_SENT = HfLogger.encodeMessage('Order sent');
const MSG_FILLED = HfLogger.encodeMessage('Order filled');
const MSG_REJECTED = HfLogger.encodeMessage('Order rejected');

// --- Hot path (~100-300ns per call, zero allocation) ---
logger.log('info', MSG_SENT);
logger.log('info', MSG_FILLED);
logger.log('error', MSG_REJECTED);

// --- Background flush (separate context / interval) ---
const flusher = new HfLogFlusher();
flusher.start(100); // flush every 100ms

// Or flush manually
await flusher.flush();
```

**HfLogger levels:**

| Level   | Numeric Value |
| ------- | ------------- |
| `debug` | 0             |
| `info`  | 1             |
| `warn`  | 2             |
| `error` | 3             |
| `emerg` | 4             |

**Key characteristics:**

- Scope cache: `Map<string, Uint8Array>` -- scope strings are encoded to fixed 32-byte arrays once
- Message cache: `Map<string, Uint8Array>` -- pre-encoded messages avoid `TextEncoder.encode()` in hot path
- Ring buffer wraps around using bitmask: `writeIndex++ & (BUFFER_SIZE - 1)`
- The flusher reads from flushIndex to writeIndex, decoding each entry back to text

### Logger Environment Variables

| Variable                            | Default        | Description                                    |
| ----------------------------------- | -------------- | ---------------------------------------------- |
| `APP_ENV_LOGGER_FOLDER_PATH`        | `./`           | Directory for log files                        |
| `APP_ENV_LOGGER_FORMAT`             | `text`         | Log format: `json` or `text`                   |
| `APP_ENV_LOGGER_FILE_FREQUENCY`     | `1h`           | File rotation frequency                        |
| `APP_ENV_LOGGER_FILE_MAX_SIZE`      | `100m`         | Max file size before rotation                  |
| `APP_ENV_LOGGER_FILE_MAX_FILES`     | `5d`           | Max days to retain log files                   |
| `APP_ENV_LOGGER_FILE_DATE_PATTERN`  | `YYYYMMDD_HH`  | Date pattern for rotated file names            |
| `APP_ENV_LOGGER_DGRAM_HOST`         | --             | UDP transport host                             |
| `APP_ENV_LOGGER_DGRAM_PORT`         | --             | UDP transport port                             |
| `APP_ENV_LOGGER_DGRAM_LABEL`        | --             | UDP transport label                            |
| `APP_ENV_LOGGER_DGRAM_LEVELS`       | --             | Comma-separated log levels to forward via UDP  |
| `DEBUG`                             | --             | Set to any truthy value to enable `debug` level output |
| `APP_ENV_EXTRA_LOG_ENVS`            | --             | Comma-separated extra `NODE_ENV` values that enable debug |
| `APP_ENV_APPLICATION_NAME`          | `APP`          | Application name prefix for log files and labels |

---

## Redis

Full-featured Redis client wrapper around IoRedis supporting single instances and clusters.

### Single Instance

```typescript
import { RedisSingleHelper } from '@venizia/ignis-helpers';

const redis = new RedisSingleHelper({
  name: 'main-redis',
  host: '127.0.0.1',
  port: 6379,
  password: 'secret',
  database: 0,         // Redis DB index (default: 0)
  autoConnect: true,    // Connect immediately (default: true, false = lazyConnect)
  maxRetry: 5,          // Max reconnect attempts (-1 = unlimited, 0 = no retry, default: 0)
  onReady: ({ name }) => console.log(`${name} ready`),
  onError: ({ error }) => console.error(error),
});
```

### Cluster

```typescript
import { RedisClusterHelper } from '@venizia/ignis-helpers';

const cluster = new RedisClusterHelper({
  name: 'redis-cluster',
  nodes: [
    { host: 'node1.redis.example.com', port: 6379 },
    { host: 'node2.redis.example.com', port: 6379 },
    { host: 'node3.redis.example.com', port: 6379 },
  ],
  clusterOptions: {
    redisOptions: { password: 'secret' },
    // scaleReads: 'slave',           // Optional: read from replicas
    // natMap: { ... },               // If behind NAT/proxy
  },
  onReady: ({ name }) => console.log(`${name} cluster ready`),
});
```

Both `RedisSingleHelper` and `RedisClusterHelper` extend `AbstractRedisHelper`, which provides all data operations. They differ only in how the underlying IoRedis client is created.

### String Operations

```typescript
// SET -- auto JSON.stringify for objects
await redis.set({ key: 'user:1', value: { name: 'Alice', age: 30 } });
await redis.set({ key: 'user:1', value: 'simple-string' });
await redis.set({ key: 'counter', value: 42, options: { log: true } }); // Enable debug logging

// GET -- returns raw string
const raw = await redis.get({ key: 'user:1' }); // '{"name":"Alice","age":30}'

// GET with custom transform
const parsed = await redis.get({
  key: 'user:1',
  transform: (str: string) => JSON.parse(str),
}); // { name: 'Alice', age: 30 }

// getString -- alias for get()
const str = await redis.getString({ key: 'token' });

// getObject -- auto JSON.parse
const user = await redis.getObject({ key: 'user:1' }); // { name: 'Alice', age: 30 }
```

### Hash Operations

```typescript
// HSET -- set multiple hash fields at once
await redis.hset({ key: 'hash:1', value: { field1: 'data1', field2: 'data2' } });
// Returns number of NEW fields added

// HGETALL -- get all fields as object
const all = await redis.hgetall({ key: 'hash:1' });
// { field1: 'data1', field2: 'data2' }

// HGETALL with transform
const transformed = await redis.hgetall({
  key: 'hash:1',
  transform: (obj) => Object.entries(obj),
});

// Aliases (PascalCase)
await redis.hSet({ key: 'hash:1', value: { field: 'data' } });
const result = await redis.hGetAll({ key: 'hash:1' });
```

### Batch Operations

```typescript
// MSET -- set multiple keys at once (auto JSON.stringify)
await redis.mset({
  payload: [
    { key: 'k1', value: { a: 1 } },
    { key: 'k2', value: { b: 2 } },
    { key: 'k3', value: 'plain-string' },
  ],
  options: { log: true },
});

// MGET -- get multiple keys at once
const values = await redis.mget({ keys: ['k1', 'k2', 'k3'] });
// ['{"a":1}', '{"b":2}', '"plain-string"']

// MGET with transform
const objects = await redis.mget({
  keys: ['k1', 'k2'],
  transform: (str: string) => JSON.parse(str),
});
// [{ a: 1 }, { b: 2 }]

// Convenience methods
const strings = await redis.getStrings({ keys: ['k1', 'k2'] });
const objs = await redis.getObjects({ keys: ['k1', 'k2'] });

// Aliases (PascalCase)
await redis.mSet({ payload: [{ key: 'k', value: 'v' }] });
const vals = await redis.mGet({ keys: ['k'] });
```

### Key Operations

```typescript
// KEYS -- find keys by pattern
const keys = await redis.keys({ key: 'user:*' });
// ['user:1', 'user:2', 'user:3']

// DEL -- delete one or more keys
await redis.del({ keys: ['user:1', 'user:2'] });
// Returns number of keys deleted
```

### RedisJSON Operations

These operations require the [RedisJSON](https://redis.io/docs/stack/json/) module installed on your Redis server.

```typescript
// JSON.SET -- set a JSON document at a path
await redis.jSet({ key: 'doc:1', path: '$', value: { name: 'Alice', age: 30, tags: [] } });
// Returns 'OK'

// JSON.GET -- retrieve JSON at a path
const doc = await redis.jGet({ key: 'doc:1', path: '$' });
// Returns the JSON value

// JSON.GET with default path
const full = await redis.jGet({ key: 'doc:1' }); // path defaults to '$'

// JSON.DEL -- delete a path within a JSON document
await redis.jDelete({ key: 'doc:1', path: '$.age' });
// Returns number of paths deleted

// JSON.NUMINCRBY -- increment a numeric value
await redis.jNumberIncreaseBy({ key: 'doc:1', path: '$.age', value: 1 });
// Returns new value as string

// JSON.STRAPPEND -- append to a string value
await redis.jStringAppend({ key: 'doc:1', path: '$.name', value: ' Smith' });
// Returns array of new string lengths

// JSON.ARRAPPEND -- push to an array
await redis.jPush({ key: 'doc:1', path: '$.tags', value: 'admin' });
// Returns array of new array lengths

// JSON.ARRPOP -- pop from an array
const popped = await redis.jPop({ key: 'doc:1', path: '$.tags' });
// Returns the popped value
```

### Pub/Sub with Compression

```typescript
// Subscribe to a topic
redis.subscribe({ topic: 'events' });

// Listen for messages on the underlying IoRedis client
redis.client.on('message', (channel: string, message: Buffer | string) => {
  // If compressed, decompress:
  // const data = JSON.parse(zlib.inflateSync(message).toString());
  console.log(channel, message);
});

// Publish to one or more topics
await redis.publish({
  topics: ['events', 'notifications'],
  payload: { type: 'user.created', userId: '123' },
});

// Publish with zlib compression (deflateSync)
await redis.publish({
  topics: ['events'],
  payload: { type: 'user.created', userId: '123' },
  useCompress: true, // Compresses payload with zlib.deflateSync before publishing
});

// Unsubscribe from a topic
redis.unsubscribe({ topic: 'events' });
```

### Raw Command Execution

Execute any Redis command directly:

```typescript
// Simple command with no parameters
const pong = await redis.execute<string>('PING');
// 'PONG'

// Command with parameters
const result = await redis.execute<string>('SET', ['mykey', 'myvalue']);

// Complex command
const info = await redis.execute<string>('INFO', ['server']);

// Custom module commands
const custom = await redis.execute<any>('FT.SEARCH', ['my-index', '*']);
```

### Connection Management

```typescript
// Connect (if using lazyConnect / autoConnect: false)
const connected = await redis.connect();
// Returns true if status is 'ready', false if already connecting/ready

// Disconnect gracefully (sends QUIT command)
const disconnected = await redis.disconnect();
// Returns true if quit was successful

// Check connection status
redis.client.status; // 'wait' | 'connecting' | 'connect' | 'ready' | 'close' | 'reconnecting' | 'end'

// Ping
await redis.ping(); // 'PONG'

// Access the underlying IoRedis client directly
const ioRedisClient = redis.getClient(); // Redis (single) or Cluster instance
```

### Redis Event Lifecycle

Events are fired in order during the connection lifecycle:

| Order | Callback        | Triggered When                         | Receives               |
| ----- | --------------- | -------------------------------------- | ---------------------- |
| 1     | `onInitialized` | Helper instance created (synchronous)  | `{ name, helper }`     |
| 2     | `onConnected`   | Redis TCP connection established       | `{ name, helper }`     |
| 3     | `onReady`       | Redis is ready to accept commands      | `{ name, helper }`     |
| --    | `onError`       | Any Redis error                        | `{ name, helper, error }` |

Additionally, the client logs `reconnecting` events automatically.

### Reconnection Behavior

The `RedisHelper` uses exponential backoff for reconnection:

```
Strategy: Math.max(Math.min(attempt * 2000, 5000), 1000) ms

Attempt 1: 1000ms (min clamp)
Attempt 2: 2000ms
Attempt 3: 4000ms
Attempt 4: 5000ms (max clamp)
Attempt 5: 5000ms (max clamp)
...continues at 5000ms until maxRetry is reached
```

- `maxRetry: 0` -- no retries (default)
- `maxRetry: -1` -- unlimited retries (not recommended for production without monitoring)
- `maxRetry: 5` -- retry 5 times then give up

The helper also sets `maxRetriesPerRequest: null` (required by BullMQ) and `showFriendlyErrorStack: true`.

---

## Queue

### BullMQ

Redis-backed distributed job queue using BullMQ. Import from the sub-path to avoid bundling BullMQ when unused.

**Producer setup:**

```typescript
import { BullMQHelper } from '@venizia/ignis-helpers/bullmq';

const producer = BullMQHelper.newInstance({
  queueName: 'email-queue',
  identifier: 'email-producer',
  role: 'queue',                  // 'queue' = producer, 'worker' = consumer
  redisConnection: redis,          // IRedisHelper instance
});

// Add jobs to the queue
await producer.queue.add('send-welcome', {
  to: 'user@example.com',
  template: 'welcome',
});

// Add with BullMQ job options
await producer.queue.add('send-invoice', data, {
  delay: 5000,                     // Delay 5 seconds
  attempts: 3,                     // Retry up to 3 times
  backoff: { type: 'exponential', delay: 1000 },
  priority: 1,                     // Lower = higher priority
});

// Cleanup
await producer.close();
```

**Worker setup:**

```typescript
const worker = BullMQHelper.newInstance({
  queueName: 'email-queue',
  identifier: 'email-worker',
  role: 'worker',
  redisConnection: redis,
  numberOfWorker: 3,                // Concurrency (default: 1)
  lockDuration: 90 * 60 * 1000,    // Job lock duration: 90 minutes (default)
  onWorkerData: async (job) => {
    // Process the job
    await sendEmail(job.data);
    return { sent: true };
  },
  onWorkerDataCompleted: async (job, result) => {
    console.log(`Job ${job.id} completed`, result);
  },
  onWorkerDataFail: async (job, error) => {
    console.error(`Job ${job?.id} failed`, error);
  },
});

// Cleanup
await worker.close();
```

**Default job options (configured on the queue):**

- `removeOnComplete: true` -- clean up completed jobs automatically
- `removeOnFail: true` -- clean up failed jobs automatically

**Redis connection note:** BullMQ requires `maxRetriesPerRequest: null`. The `RedisHelper` sets this automatically. The BullMQ helper calls `redisConnection.getClient().duplicate()` for both queue and worker connections so they don't interfere with your main Redis client.

**Supported roles:**

- `'queue'` -- creates a `Queue` instance (producer)
- `'worker'` -- creates a `Worker` instance (consumer)

### In-Memory Queue

Generator-based in-memory queue with a state machine for synchronous sequential processing. Useful for ordering operations that must be processed one at a time.

**State machine:**

```
WAITING --(enqueue + autoDispatch)--> PROCESSING --(message done)--> WAITING
   |                                       |
   +--(lock())--> LOCKED                   +--(settle request + empty)--> SETTLED
                    |
                    +--(unlock())--> WAITING
```

| State            | Description                              |
| ---------------- | ---------------------------------------- |
| `000_WAITING`    | Idle, waiting for next message           |
| `100_PROCESSING` | Currently processing a message           |
| `200_LOCKED`     | Paused, no new messages processed        |
| `300_SETTLED`    | Terminal state, no more items accepted   |

```typescript
import { QueueHelper, QueueStatuses } from '@venizia/ignis-helpers';

const queue = new QueueHelper<{ userId: string }>({
  identifier: 'sync-processor',
  autoDispatch: true,              // Auto-process on enqueue (default: true)
  onMessage: async ({ queueElement }) => {
    console.log('Processing:', queueElement.payload);
    // { isLocked: true, payload: { userId: 'user-1' } }
  },
  onDataEnqueue: async ({ identifier, queueElement }) => {
    console.log('Enqueued:', queueElement.payload);
  },
  onDataDequeue: async ({ identifier, queueElement }) => {
    console.log('Dequeued:', queueElement.payload);
  },
  onStateChange: async ({ from, to }) => {
    console.log(`State: ${from} -> ${to}`);
  },
});

// Enqueue items (auto-dispatched one at a time)
await queue.enqueue({ userId: 'user-1' });
await queue.enqueue({ userId: 'user-2' });

// Flow control
queue.lock();                                    // Pause processing (LOCKED state)
queue.unlock({ shouldProcessNextElement: true }); // Resume + process next
queue.unlock({ shouldProcessNextElement: false }); // Resume without processing

// Settle -- no more items accepted; transitions to SETTLED when empty
queue.settle();

// Check state
queue.getState();           // Current state string
queue.isSettled();          // true when SETTLED and storage is empty
queue.getTotalEvent();      // Total items ever enqueued
queue.getProcessingEvents(); // Set of currently processing elements

// Close -- settle + return generator
queue.close();

// Manual dispatch (when autoDispatch: false)
queue.nextMessage();
```

### MQTT

Lightweight MQTT pub/sub client for IoT messaging.

```typescript
import { MQTTClientHelper } from '@venizia/ignis-helpers/mqtt';

const mqtt = new MQTTClientHelper({
  identifier: 'iot-client',
  url: 'mqtt://broker.example.com:1883',
  options: {
    username: 'device',
    password: 'secret',
    clientId: 'sensor-001',
    keepalive: 60,
    reconnectPeriod: 1000,
  },
  onConnect: () => console.log('MQTT connected'),
  onDisconnect: () => console.log('MQTT disconnected'),
  onError: (error) => console.error('MQTT error:', error),
  onClose: (error) => console.log('MQTT closed', error),
  onMessage: ({ topic, message }) => {
    console.log(`[${topic}]`, message.toString());
  },
});

// Subscribe to topics
await mqtt.subscribe({ topics: ['sensors/temperature', 'sensors/humidity'] });

// Publish a message
await mqtt.publish({ topic: 'commands/led', message: 'ON' });
await mqtt.publish({ topic: 'data/json', message: JSON.stringify({ temp: 23.5 }) });
await mqtt.publish({ topic: 'data/binary', message: Buffer.from([0x01, 0x02]) });
```

The MQTT client auto-connects on construction. If the client is already established, `configure()` is a no-op. Subscribe/publish throw `ApplicationError` if the client is not connected.

### Kafka (Experimental)

Apache Kafka helpers built on `@platformatic/kafka`. Import from the `@venizia/ignis-helpers/kafka` sub-path.

**Constants and defaults:**

| Constant                         | Default        | Description                           |
| -------------------------------- | -------------- | ------------------------------------- |
| `KafkaDefaults.CLIENT_ID`        | `ignis-kafka`  | Default client ID                     |
| `KafkaDefaults.SESSION_TIMEOUT`  | `30000`        | Consumer session timeout (ms)         |
| `KafkaDefaults.HEARTBEAT_INTERVAL` | `3000`       | Consumer heartbeat interval (ms)      |
| `KafkaDefaults.MAX_WAIT_TIME`    | `5000`         | Max wait time for fetch (ms)          |
| `KafkaDefaults.HIGH_WATER_MARK`  | `1024`         | Stream high water mark                |

**Ack levels (`KafkaAcks`):**

| Constant           | Value | Behavior               |
| ------------------ | ----- | ---------------------- |
| `KafkaAcks.NONE`   | `0`   | No acknowledgment      |
| `KafkaAcks.LEADER` | `1`   | Leader only            |
| `KafkaAcks.ALL`    | `-1`  | All in-sync replicas   |

**Producer:**

```typescript
import { KafkaProducerHelper, KafkaAcks } from '@venizia/ignis-helpers/kafka';

const producer = KafkaProducerHelper.newInstance({
  identifier: 'my-producer',
  bootstrapBrokers: ['localhost:9092'],
  clientId: 'my-app',               // Default: 'ignis-kafka'
  acks: KafkaAcks.ALL,              // -1 = all replicas
  timeout: 30000,                    // Connection timeout
  retries: 5,                        // Connection retries
  retryDelay: 100,                   // Delay between retries
  autocreateTopics: true,            // Auto-create topics on send
  onConnected: () => console.log('Producer connected'),
  onDisconnected: () => console.log('Producer disconnected'),
  onError: ({ error }) => console.error('Producer error:', error),
});

// Send messages
await producer.send({
  messages: [
    { topic: 'events', key: 'user-1', value: JSON.stringify({ action: 'login' }) },
    { topic: 'events', key: 'user-2', value: JSON.stringify({ action: 'signup' }) },
  ],
  acks: KafkaAcks.ALL,
});

// Send batch (grouped by topic)
await producer.sendBatch({
  topicMessages: [
    {
      topic: 'orders',
      messages: [
        { key: 'order-1', value: JSON.stringify({ total: 99.99 }) },
        { key: 'order-2', value: JSON.stringify({ total: 149.50 }) },
      ],
    },
    {
      topic: 'notifications',
      messages: [
        { key: 'notif-1', value: JSON.stringify({ type: 'email' }) },
      ],
    },
  ],
});

// Access underlying @platformatic/kafka Producer
const rawProducer = producer.getProducer();

await producer.close();
```

**Consumer:**

```typescript
import { KafkaConsumerHelper } from '@venizia/ignis-helpers/kafka';

const consumer = KafkaConsumerHelper.newInstance({
  identifier: 'my-consumer',
  bootstrapBrokers: ['localhost:9092'],
  groupId: 'my-group',
  topics: ['events'],
  mode: 'latest',                    // 'latest' | 'earliest' | 'committed'
  autocommit: true,                  // Auto-commit offsets (default: true)
  sessionTimeout: 30_000,
  heartbeatInterval: 3_000,
  highWaterMark: 1024,
  maxWaitTime: 5_000,

  onMessage: async ({ message }) => {
    console.log(`[${message.topic}:${message.partition}]`, message.value);
    console.log('  key:', message.key);
    console.log('  offset:', message.offset);
    console.log('  timestamp:', message.timestamp);
    console.log('  headers:', message.headers);

    // Manual commit (when autocommit: false)
    // await message.commit();
  },
  onError: ({ error }) => console.error('Consumer error:', error),
  onConnected: () => console.log('Consumer connected'),
  onDisconnected: () => console.log('Consumer disconnected'),
  onGroupJoin: ({ groupId, memberId }) => console.log(`Joined ${groupId} as ${memberId}`),
  onGroupLeave: () => console.log('Left consumer group'),
  onRebalance: () => console.log('Rebalance triggered'),
  onLag: ({ offsets }) => console.log('Consumer lag:', offsets),
});

// Start consuming (fires up the async consume loop)
await consumer.start();

// Flow control
consumer.pause();          // Pause the message stream
consumer.resume();         // Resume the message stream
consumer.isPaused();       // Check if paused
consumer.isConsuming();    // Check if actively consuming

// Manual commit (when autocommit: false)
await consumer.commit({
  offsets: [{ topic: 'events', partition: 0, offset: 42n, leaderEpoch: 0 }],
});

// Lag monitoring
consumer.startLagMonitoring({ interval: 10_000 }); // Check every 10s
consumer.stopLagMonitoring();

// Access underlying @platformatic/kafka Consumer
const rawConsumer = consumer.getConsumer();

await consumer.close();
```

**Admin:**

```typescript
import { KafkaAdminHelper, KafkaConfigResourceTypes } from '@venizia/ignis-helpers/kafka';

const admin = KafkaAdminHelper.newInstance({
  identifier: 'my-admin',
  bootstrapBrokers: ['localhost:9092'],
  onConnected: () => console.log('Admin connected'),
});

// Topic management
await admin.createTopics({ topics: ['events', 'orders'], partitions: 3, replicas: 1 });
await admin.deleteTopics({ topics: ['old-topic'] });
const topics = await admin.listTopics();                     // string[]
const topicsWithInternal = await admin.listTopics({ includeInternals: true });
const metadata = await admin.metadata({ topics: ['events'] });

// Partition management
await admin.createPartitions({
  topics: [{ name: 'events', count: 6 }],   // Increase to 6 partitions
  validateOnly: false,
});

// Consumer group management
const groups = await admin.listGroups({ states: ['Stable'] });
const groupInfo = await admin.describeGroups({ groups: ['my-group'] });
await admin.deleteGroups({ groups: ['old-group'] });

// Offset management
const offsets = await admin.listConsumerGroupOffsets({ groups: ['my-group'] });
await admin.alterConsumerGroupOffsets({
  groupId: 'my-group',
  topics: [{
    name: 'events',
    partitionOffsets: [{ partition: 0, offset: 100n }],
  }],
});

// Config management
const configs = await admin.describeConfigs({
  resources: [{
    resourceType: KafkaConfigResourceTypes.TOPIC,  // 2
    resourceName: 'events',
  }],
  includeSynonyms: false,
  includeDocumentation: true,
});

await admin.alterConfigs({
  resources: [{
    resourceType: KafkaConfigResourceTypes.TOPIC,
    resourceName: 'events',
    configs: [{ name: 'retention.ms', value: '604800000' }], // 7 days
  }],
});

// Access underlying @platformatic/kafka Admin
const rawAdmin = admin.getAdmin();

await admin.close();
```

---

## Storage

All storage helpers implement the `IStorageHelper` interface for a unified API across backends.

### Common Interface (IStorageHelper)

```typescript
interface IStorageHelper {
  // Name validation
  isValidName(name: string): boolean;

  // Bucket operations
  isBucketExists(opts: { name: string }): Promise<boolean>;
  getBuckets(): Promise<IBucketInfo[]>;
  getBucket(opts: { name: string }): Promise<IBucketInfo | null>;
  createBucket(opts: { name: string }): Promise<IBucketInfo | null>;
  removeBucket(opts: { name: string }): Promise<boolean>;

  // File operations
  upload(opts: {
    bucket: string;
    files: IUploadFile[];
    normalizeNameFn?: (opts: { originalName: string; folderPath?: string }) => string;
    normalizeLinkFn?: (opts: { bucketName: string; normalizeName: string }) => string;
  }): Promise<IUploadResult[]>;

  getFile(opts: { bucket: string; name: string; options?: any }): Promise<Readable>;
  getStat(opts: { bucket: string; name: string }): Promise<IFileStat>;
  removeObject(opts: { bucket: string; name: string }): Promise<void>;
  removeObjects(opts: { bucket: string; names: string[] }): Promise<void>;
  listObjects(opts: { bucket: string; prefix?: string; useRecursive?: boolean; maxKeys?: number }): Promise<IObjectInfo[]>;

  // Utility
  getFileType(opts: { mimeType: string }): string;
}
```

**Related types:**

```typescript
interface IUploadFile {
  originalName: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
  encoding?: string;
  folderPath?: string;
}

interface IUploadResult {
  bucketName: string;
  objectName: string;
  link: string;
}

interface IFileStat {
  size: number;
  metadata: Record<string, any>;
  lastModified?: Date;
  etag?: string;
  versionId?: string;
}

interface IBucketInfo {
  name: string;
  creationDate: Date;
}

interface IObjectInfo {
  name?: string;
  size?: number;
  lastModified?: Date;
  etag?: string;
  prefix?: string;
}
```

### Security Validation

`isValidName()` is called automatically before bucket and file operations. It prevents:

| Threat             | Pattern Blocked                                | Example                   |
| ------------------ | ---------------------------------------------- | ------------------------- |
| Path traversal     | `..`, `/`, `\`                                 | `../../etc/passwd`        |
| Hidden files       | Leading `.`                                    | `.env`, `.gitignore`      |
| Shell injection    | `;`, `\|`, `&`, `$`, backticks, `<>{}[]!#`     | `file; rm -rf /`          |
| Header injection   | `\n`, `\r`, `\0`                               | `file\r\nHeader: inject`  |
| DoS                | Length > 255                                   | Very long filenames       |
| Whitespace-only    | Empty or spaces                                | `"   "`                   |

```typescript
storage.isValidName('photo.jpg');        // true
storage.isValidName('../etc/passwd');     // false -- path traversal
storage.isValidName('.hidden');           // false -- hidden file
storage.isValidName('file;rm -rf /');    // false -- shell injection
storage.isValidName('a'.repeat(300));    // false -- too long
```

### MinIO (S3-Compatible)

```typescript
import { MinioHelper } from '@venizia/ignis-helpers/minio';

const storage = new MinioHelper({
  endPoint: 'minio.example.com',
  port: 9000,
  useSSL: false,
  accessKey: 'minioadmin',
  secretKey: 'minioadmin',
  // All minio.ClientOptions are supported
});

// Bucket operations
await storage.createBucket({ name: 'uploads' });
const exists = await storage.isBucketExists({ name: 'uploads' });
const buckets = await storage.getBuckets();          // IBucketInfo[]
const bucket = await storage.getBucket({ name: 'uploads' }); // IBucketInfo | null
await storage.removeBucket({ name: 'empty-bucket' });

// Upload files
const results = await storage.upload({
  bucket: 'uploads',
  files: [{
    originalName: 'photo.jpg',
    mimetype: 'image/jpeg',
    buffer: fileBuffer,
    size: fileBuffer.length,
    folderPath: 'images',          // Optional subfolder
  }],
  // Optional: customize naming
  normalizeNameFn: ({ originalName, folderPath }) =>
    `${folderPath}/${Date.now()}-${originalName}`,
  // Optional: customize link generation
  normalizeLinkFn: ({ bucketName, normalizeName }) =>
    `https://cdn.example.com/${bucketName}/${normalizeName}`,
});
// [{ bucketName: 'uploads', objectName: 'images/photo.jpg', link: '/static-assets/uploads/...' }]

// Retrieve file as readable stream
const stream = await storage.getFile({
  bucket: 'uploads',
  name: 'images/photo.jpg',
  options: {
    versionId: 'abc123',                // Optional version
    SSECustomerAlgorithm: 'AES256',     // Optional SSE
    SSECustomerKey: 'base64key',
    SSECustomerKeyMD5: 'md5hash',
  },
});

// Get file metadata
const stat = await storage.getStat({ bucket: 'uploads', name: 'images/photo.jpg' });
// { size: 12345, metadata: { ... }, lastModified: Date, etag: '...', versionId: '...' }

// List objects
const objects = await storage.listObjects({
  bucket: 'uploads',
  prefix: 'images/',
  useRecursive: true,
  maxKeys: 100,
});

// Delete
await storage.removeObject({ bucket: 'uploads', name: 'images/photo.jpg' });
await storage.removeObjects({ bucket: 'uploads', names: ['file1.jpg', 'file2.jpg'] });

// Access underlying minio.Client for advanced operations
storage.client.presignedGetObject('uploads', 'photo.jpg', 3600); // Pre-signed URL
```

### Disk

Local filesystem storage with the same interface. Buckets are directories; objects are files.

```typescript
import { DiskHelper } from '@venizia/ignis-helpers';

const storage = new DiskHelper({
  basePath: './data/storage',  // Base directory (created automatically if missing)
});

// All IStorageHelper operations work identically
await storage.createBucket({ name: 'uploads' });
// Creates: ./data/storage/uploads/

await storage.upload({
  bucket: 'uploads',
  files: [{ originalName: 'doc.pdf', mimetype: 'application/pdf', buffer: buf, size: buf.length }],
});
// Writes: ./data/storage/uploads/doc.pdf
// Returns: [{ bucketName: 'uploads', objectName: 'doc.pdf', link: '/static-resources/uploads/doc.pdf' }]

const stream = await storage.getFile({ bucket: 'uploads', name: 'doc.pdf' });
// Returns: fs.createReadStream(...)

const stat = await storage.getStat({ bucket: 'uploads', name: 'doc.pdf' });
// { size: 12345, lastModified: Date, metadata: { mimetype: 'application/pdf' } }

// List with prefix and recursion
const objects = await storage.listObjects({
  bucket: 'uploads',
  prefix: 'reports/',
  useRecursive: true,
  maxKeys: 50,
});

// Remove bucket (must be empty)
await storage.removeBucket({ name: 'uploads' });
```

The Disk helper auto-detects MIME types from file extensions using a built-in map (20+ common types, falls back to `application/octet-stream`).

### Memory Storage

Simple in-memory key-value storage (not implementing `IStorageHelper`). Useful for testing, caching, and temporary data.

```typescript
import { MemoryStorageHelper } from '@venizia/ignis-helpers';

// Type-safe container
const cache = MemoryStorageHelper.newInstance<{
  token: string;
  user: { name: string; role: string };
  settings: Record<string, boolean>;
}>();

cache.set('token', 'abc123');
cache.set('user', { name: 'Alice', role: 'admin' });
cache.set('settings', { darkMode: true });

const token = cache.get<string>('token');           // 'abc123'
const user = cache.get<{ name: string }>('user');   // { name: 'Alice', role: 'admin' }

cache.isBound('token');    // true
cache.isBound('missing');  // false

cache.keys();              // ['token', 'user', 'settings']
cache.getContainer();      // Full internal object

cache.clear();             // Reset to empty object
cache.keys();              // []
```

---

## Crypto

### AES

Symmetric encryption with AES-256-CBC or AES-256-GCM.

**Algorithm comparison:**

| Feature          | AES-256-CBC                    | AES-256-GCM                                |
| ---------------- | ------------------------------ | ------------------------------------------- |
| Confidentiality  | Yes                            | Yes                                         |
| Authentication   | No (encrypt-only)              | Yes (AEAD -- built-in auth tag)             |
| Auth tag size    | N/A                            | 16 bytes                                    |
| Performance      | Slightly faster                | Slightly slower (auth overhead)             |
| Use case         | Legacy compatibility           | **Recommended** for new code                |
| Encrypted format | `[IV(16B)][ciphertext]`        | `[IV(16B)][authTag(16B)][ciphertext]`       |

```typescript
import { AES } from '@venizia/ignis-helpers';

// Create instance with chosen algorithm
const aesCbc = AES.withAlgorithm('aes-256-cbc');
const aesGcm = AES.withAlgorithm('aes-256-gcm'); // Recommended

// Encrypt string
const encrypted = aesGcm.encrypt({
  message: 'Hello, World!',
  secret: 'my-secret-key',     // Auto-padded/truncated to 32 bytes (256 bits)
});
// Returns base64-encoded string: [IV][AuthTag][Ciphertext]

// Decrypt string
const decrypted = aesGcm.decrypt({
  message: encrypted,
  secret: 'my-secret-key',
});
// 'Hello, World!'

// File encryption
const encryptedContent = aesGcm.encryptFile({
  absolutePath: '/path/to/file.txt',
  secret: 'my-secret-key',
});
// Returns base64-encoded encrypted file content

const decryptedContent = aesGcm.decryptFile({
  absolutePath: '/path/to/encrypted.txt',
  secret: 'my-secret-key',
});
// Returns original file content as string

// Advanced options
const result = aesGcm.encrypt({
  message: 'data',
  secret: 'key',
  opts: {
    iv: customIV,              // Custom IV (default: crypto.randomBytes(16))
    inputEncoding: 'utf-8',    // Input encoding (default: 'utf-8')
    outputEncoding: 'base64',  // Output encoding (default: 'base64')
    doThrow: false,            // If false, returns original message on error (default: true)
  },
});
```

**Key normalization:** The secret key is automatically padded with null bytes (`0x00`) or truncated to exactly 32 bytes (256 bits). You can pass a passphrase of any length.

### RSA

Asymmetric encryption using RSA with DER key format.

```typescript
import { RSA } from '@venizia/ignis-helpers';

const rsa = RSA.withAlgorithm();

// Generate DER key pair
const { publicKey, privateKey } = rsa.generateDERKeyPair({ modulus: 2048 });
// publicKey: Buffer (DER, SPKI format)
// privateKey: Buffer (DER, PKCS8 format)

// Convert to base64 for storage/transmission
const pubKeyB64 = publicKey.toString('base64');
const privKeyB64 = privateKey.toString('base64');

// Encrypt with public key
const encrypted = rsa.encrypt({
  message: 'Secret message',
  secret: pubKeyB64,
  // opts: {
  //   inputEncoding: { key: 'base64', message: 'utf-8' },  // defaults
  //   outputEncoding: 'base64',                              // default
  //   doThrow: true,                                         // default
  // }
});

// Decrypt with private key
const decrypted = rsa.decrypt({
  message: encrypted,
  secret: privKeyB64,
  // opts: {
  //   inputEncoding: { key: 'base64', message: 'base64' },  // defaults
  //   outputEncoding: 'utf-8',                                // default
  //   doThrow: true,                                          // default
  // }
});

// Available modulus sizes
rsa.generateDERKeyPair({ modulus: 1024 });  // Fast, insecure (testing only)
rsa.generateDERKeyPair({ modulus: 2048 });  // Standard (default)
rsa.generateDERKeyPair({ modulus: 4096 });  // High security, slower
```

### ECDH

Elliptic Curve Diffie-Hellman key exchange with HKDF-derived AES-256-GCM session keys. Uses the Web Crypto API for cross-platform compatibility (Bun and browsers).

**Algorithm details:**

- Curve: P-256 (NIST)
- Key derivation: HKDF with SHA-256
- Cipher: AES-256-GCM with 128-bit auth tag
- IV: 12 bytes random per encryption
- Salt: 32 bytes (generated or shared)
- Info string: `ignis-ecdh-p256-aes-256-gcm-v1` (customizable)

```typescript
import { ECDH } from '@venizia/ignis-helpers';

const ecdh = ECDH.withAlgorithm();
// Or with custom HKDF info string:
// const ecdh = ECDH.withAlgorithm({ hkdfInfo: 'my-app-v1' });

// --- Key Exchange Flow ---

// 1. Both parties generate key pairs
const alice = await ecdh.generateKeyPair();
// { keyPair: CryptoKeyPair, publicKeyB64: 'base64-encoded-raw-public-key' }

const bob = await ecdh.generateKeyPair();

// 2. Exchange public keys (via network, etc.)
const alicePeerKey = await ecdh.importPublicKey({ rawKeyB64: bob.publicKeyB64 });
const bobPeerKey = await ecdh.importPublicKey({ rawKeyB64: alice.publicKeyB64 });

// 3. Derive shared AES-256-GCM keys
const aliceSession = await ecdh.deriveAESKey({
  privateKey: alice.keyPair.privateKey,
  peerPublicKey: alicePeerKey,
  // salt is auto-generated if not provided
});
// { key: CryptoKey, salt: 'base64-encoded-salt' }

const bobSession = await ecdh.deriveAESKey({
  privateKey: bob.keyPair.privateKey,
  peerPublicKey: bobPeerKey,
  salt: aliceSession.salt, // MUST use same salt to derive same key
});

// 4. Encrypt with Alice's derived key
const payload = await ecdh.encrypt({
  message: 'Hello Bob!',
  secret: aliceSession.key,
  opts: {
    additionalData: 'optional-aad', // Optional authenticated associated data
  },
});
// { iv: 'base64-iv', ct: 'base64-ciphertext' }

// 5. Decrypt with Bob's derived key (same shared secret)
const plaintext = await ecdh.decrypt({
  message: payload,
  secret: bobSession.key,
  opts: {
    additionalData: 'optional-aad', // Must match what was used in encrypt
  },
});
// 'Hello Bob!'
```

### Crypto Utility (hash)

Simple hashing utility for HMAC-SHA256 and MD5:

```typescript
import { hash } from '@venizia/ignis-helpers';

// HMAC-SHA256 (requires secret)
const sha256 = hash('data', {
  algorithm: 'SHA256',
  secret: 'hmac-secret',
  outputType: 'hex',     // 'hex' | 'base64' | 'latin1'
});

// MD5 (no secret required)
const md5 = hash('data', {
  algorithm: 'MD5',
  outputType: 'base64',
});

// SHA256 without secret returns the original text (no-op)
const noop = hash('data', { algorithm: 'SHA256', outputType: 'hex' });
// 'data'
```

---

## Cron

Scheduled job management built on the `cron` package.

```typescript
import { CronHelper } from '@venizia/ignis-helpers/cron';

const job = CronHelper.newInstance({
  cronTime: '0 */5 * * * *', // Every 5 minutes
  onTick: async () => {
    console.log('Running scheduled task');
  },
  autoStart: true,
  tz: 'America/New_York',
  errorHandler: (error) => {
    console.error('Cron error:', error);
  },
});

// Manual control
job.start();

// Modify schedule at runtime
job.modifyCronTime({
  cronTime: '0 */10 * * * *', // Change to every 10 minutes
  shouldFireOnTick: true,       // Fire immediately after modification
});

// Duplicate with different schedule (same onTick handler)
const nightJob = job.duplicate({
  cronTime: '0 0 2 * * *', // 2:00 AM daily
});
nightJob.start();

// Access underlying CronJob instance
const nextDate = job.instance.nextDate();
```

---

## Socket.IO

Real-time communication helpers supporting both Node.js and Bun runtimes, with Redis adapter for horizontal scaling.

### Socket.IO Server

```typescript
import { SocketIOServerHelper } from '@venizia/ignis-helpers/socket-io';

const io = new SocketIOServerHelper({
  identifier: 'main-ws',
  runtime: 'node',              // or 'bun'
  server: httpServer,            // Node.js HTTP server (for 'node' runtime)
  // engine: bunEngine,          // @socket.io/bun-engine (for 'bun' runtime)
  serverOptions: {
    cors: { origin: '*' },
    path: '/socket.io',
  },
  redisConnection: redis,        // IRedisHelper instance
  defaultRooms: ['io-default', 'io-notification'],
  authenticateTimeout: 10_000,   // 10s to authenticate
  pingInterval: 30_000,          // 30s ping interval

  authenticateFn: (handshake) => {
    const token = handshake.auth?.token;
    return verifyJWT(token);      // return true/false
  },
  validateRoomFn: ({ socket, rooms }) => {
    return rooms.filter(r => isAuthorized(socket, r));
  },
  clientConnectedFn: async ({ socket }) => {
    console.log('Client authenticated:', socket.id);
  },
});

await io.configure();

// Send messages
io.send({
  destination: 'room-123',      // room, client ID, or omit for broadcast
  payload: {
    topic: 'notification',
    data: { message: 'Hello!' },
  },
});

// Register custom event handlers
io.on({
  topic: 'custom-event',
  handler: (data) => console.log(data),
});

// Retrieve connected clients
const clients = io.getClients();
const client = io.getClients({ id: 'socket-id-123' });

// Shutdown
await io.shutdown();
```

### Socket.IO Client

```typescript
import { SocketIOClientHelper } from '@venizia/ignis-helpers/socket-io';

const client = new SocketIOClientHelper({
  identifier: 'app-client',
  host: 'http://localhost:3000',
  options: {
    path: '/socket.io',
    extraHeaders: { authorization: 'Bearer token123' },
  },
  onConnected: () => console.log('Connected'),
  onAuthenticated: () => console.log('Authenticated'),
  onDisconnected: (reason) => console.log('Disconnected:', reason),
});

// Authenticate (triggers server-side authenticateFn)
client.authenticate();

// Subscribe to events
client.subscribe({
  event: 'notification',
  handler: (data) => console.log('Notification:', data),
});

// Subscribe to multiple events
client.subscribeMany({
  events: {
    'message': (data) => console.log(data),
    'alert': (data) => console.warn(data),
  },
});

// Emit events
client.emit({ topic: 'chat', data: { text: 'Hello!' } });

// Room management
client.joinRooms({ rooms: ['room-1', 'room-2'] });
client.leaveRooms({ rooms: ['room-1'] });

// Cleanup
client.shutdown();
```

### Socket.IO Authentication Flow

1. Client connects to Socket.IO server
2. Server starts authentication timeout (default 10s)
3. Client emits `authenticate` event
4. Server calls `authenticateFn` with handshake data
5. On success: client joins default rooms, receives `authenticated` event, ping interval starts
6. On failure: client receives `unauthenticated` event and is disconnected
7. On timeout: client is disconnected

**System events:**

| Event             | Direction          | Description            |
| ----------------- | ------------------ | ---------------------- |
| `ping`            | Server -> Client   | Keepalive              |
| `connection`      | Client -> Server   | Initial connection     |
| `disconnect`      | Bidirectional      | Disconnection          |
| `join`            | Client -> Server   | Join rooms             |
| `leave`           | Client -> Server   | Leave rooms            |
| `authenticate`    | Client -> Server   | Start authentication   |
| `authenticated`   | Server -> Client   | Auth success           |
| `unauthenticated` | Server -> Client   | Auth failure           |

---

## WebSocket (Bun Native)

High-performance WebSocket server using Bun's native WebSocket API with Redis pub/sub for multi-instance scaling. Supports optional end-to-end encryption with an outbound transformer pattern.

### WebSocket Server Setup

```typescript
import { WebSocketServerHelper } from '@venizia/ignis-helpers';

const ws = new WebSocketServerHelper({
  identifier: 'realtime',
  server: bunServer,              // Bun server instance (IBunServer)
  redisConnection: redis,         // IRedisHelper instance
  path: '/ws',                    // Default: '/ws'
  authTimeout: 5_000,             // 5s to authenticate (default)
  heartbeatInterval: 30_000,      // 30s between heartbeats (default)
  heartbeatTimeout: 90_000,       // 3x interval, disconnect after 3 missed (default)
  requireEncryption: false,       // When true, handshakeFn is required
  encryptedBatchLimit: 10,        // Max concurrent encryption operations (default)
  defaultRooms: ['ws-default', 'ws-notification'], // Auto-join on auth

  serverOptions: {
    maxPayloadLength: 128 * 1024, // 128KB (default)
    idleTimeout: 60,              // seconds (default)
    sendPings: true,              // default
    perMessageDeflate: false,
    backpressureLimit: 1024 * 1024, // 1MB
  },

  authenticateFn: async (data) => {
    const user = await verifyToken(data.token);
    return user ? { userId: user.id, metadata: { role: user.role } } : null;
  },
  validateRoomFn: ({ userId, rooms }) => {
    return rooms.filter(r => canJoinRoom(userId, r));
  },
  clientConnectedFn: async ({ clientId, userId, metadata }) => {
    console.log(`${userId} connected as ${clientId}`, metadata);
  },
  clientDisconnectedFn: async ({ clientId, userId }) => {
    console.log(`${userId} (${clientId}) disconnected`);
  },
  messageHandler: async ({ clientId, userId, message }) => {
    console.log(`[${clientId}] ${message.event}:`, message.data);
  },
});

await ws.configure();

// Get the Bun WebSocket handler for server.upgrade()
const handler = ws.getBunWebSocketHandler();
// Use in Bun.serve({ websocket: handler, fetch: ... })
```

### WebSocket Messaging API

```typescript
// --- High-level API (local + Redis cross-instance) ---

// Broadcast to all authenticated clients
ws.send({ payload: { topic: 'update', data: { version: 2 } } });

// Send to specific client
ws.send({ destination: clientId, payload: { topic: 'dm', data: { text: 'hi' } } });

// Send to room
ws.send({ destination: 'room-1', payload: { topic: 'chat', data: { msg: 'hello' } } });

// --- Low-level APIs (local instance only) ---

ws.sendToClient({ clientId, event: 'ping', data: {} });
ws.sendToUser({ userId: 'user-1', event: 'alert', data: { msg: 'hi' } });
ws.sendToRoom({ room: 'lobby', event: 'join', data: { user: 'Alice' } });
ws.sendToRoom({ room: 'lobby', event: 'msg', data: { text: 'hi' }, exclude: [clientId] });
ws.broadcast({ event: 'system', data: { maintenance: true } });
ws.broadcast({ event: 'system', data: { maintenance: true }, exclude: ['client-1'] });

// --- Room Management ---

ws.joinRoom({ clientId, room: 'my-room' });
ws.leaveRoom({ clientId, room: 'my-room' });

// --- Query ---

const allClients = ws.getClients();                            // Map<string, IWebSocketClient>
const oneClient = ws.getClients({ id: clientId });             // IWebSocketClient | undefined
const userClients = ws.getClientsByUser({ userId: 'user-1' }); // IWebSocketClient[]
const roomClients = ws.getClientsByRoom({ room: 'lobby' });    // IWebSocketClient[]

await ws.shutdown();
```

### WebSocket Encryption Support

When `requireEncryption: true`, clients must complete an encryption handshake during authentication:

```typescript
const ws = new WebSocketServerHelper({
  // ...
  requireEncryption: true,
  handshakeFn: async ({ clientId, userId, data }) => {
    // Generate ECDH key pair for this client
    const keyPair = await ecdh.generateKeyPair();
    // Store privateKey for this client session...
    return {
      serverPublicKey: keyPair.publicKeyB64,
      salt: someSalt,
    };
    // Return null/false to reject the handshake
  },
  outboundTransformer: async ({ client, event, data }) => {
    // Transform outbound messages for encrypted clients
    const encrypted = await encrypt(data, client.metadata.sessionKey);
    return { event, data: encrypted };
    // Return null to send unmodified { event, data }
  },
});
```

When a client has encryption enabled:

- It is unsubscribed from Bun's native pub/sub topics (prevents double delivery)
- All messages go through the `outboundTransformer` before `socket.send()`
- Room/broadcast messages are delivered individually with concurrency limit (`encryptedBatchLimit`)

### WebSocket Authentication Flow

1. Client connects via `server.upgrade()` -- state: `UNAUTHORIZED`
2. Auth timeout starts (default 5s)
3. Client sends `{ event: 'authenticate', data: { token: '...' } }`
4. Server calls `authenticateFn(data)` -- state: `AUTHENTICATING`
5. On success:
   - Client state: `AUTHENTICATED`
   - Subscribes to broadcast topic
   - Joins default rooms + own room
   - If `requireEncryption`: runs `handshakeFn`, enables encryption
   - Sends `connected` event with `{ id, userId, time, serverPublicKey?, salt? }`
   - Calls `clientConnectedFn`
6. On failure: sends `error` event, closes with code `4003`
7. On timeout: closes with code `4001`

**WebSocket close codes:**

| Code   | Reason                                   |
| ------ | ---------------------------------------- |
| `1001` | Server shutting down                     |
| `4001` | Authentication timeout                   |
| `4002` | Heartbeat timeout                        |
| `4003` | Authentication failed                    |
| `4004` | Encryption required (handshake failed)   |

**Redis pub/sub channels:**

| Channel            | Purpose                                  |
| ------------------ | ---------------------------------------- |
| `ws:broadcast`     | Broadcast messages across instances      |
| `ws:room:<name>`   | Room-targeted messages                   |
| `ws:client:<id>`   | Client-targeted messages                 |
| `ws:user:<id>`     | User-targeted messages                   |

---

## Network

### HTTP Clients

Two HTTP client implementations sharing a common `IFetchable` interface.

**Common interface:**

```typescript
interface IFetchable<V, RQ, RS> {
  send(opts: RQ): Promise<RS>;
  get(opts: RQ): Promise<RS>;
  post(opts: RQ): Promise<RS>;
  put(opts: RQ): Promise<RS>;
  patch(opts: RQ): Promise<RS>;
  delete(opts: RQ): Promise<RS>;
  getWorker(): AxiosInstance | typeof fetch;
}
```

**Node Fetch (built-in, zero dependencies):**

```typescript
import { NodeFetchNetworkRequest } from '@venizia/ignis-helpers';

const api = new NodeFetchNetworkRequest({
  name: 'github-api',
  networkOptions: {
    baseUrl: 'https://api.github.com',
    headers: { Authorization: 'token ghp_xxx' },
    // All RequestInit options are supported
  },
});

const url = api.getRequestUrl({ paths: ['/repos', '/VENIZIA-AI', '/ignis'] });
// 'https://api.github.com/repos/VENIZIA-AI/ignis'

const response = await api.getNetworkService().get({ url, timeout: 5000 });
const data = await response.json();

// With query parameters
const searchUrl = api.getRequestUrl({ paths: ['/search', '/repositories'] });
const results = await api.getNetworkService().get({
  url: searchUrl,
  params: { q: 'ignis', sort: 'stars' },
});
// Fetches: https://api.github.com/search/repositories?q=ignis&sort=stars

// POST with body
await api.getNetworkService().post({
  url: api.getRequestUrl({ paths: ['/repos'] }),
  body: JSON.stringify({ name: 'new-repo' }),
  headers: { 'Content-Type': 'application/json' },
});

// Default content-type: 'application/json; charset=utf-8'
// Timeout implemented via AbortController
```

**Axios (requires `bun add axios`):**

```typescript
import { AxiosNetworkRequest } from '@venizia/ignis-helpers/axios';

const api = new AxiosNetworkRequest({
  name: 'payment-api',
  networkOptions: {
    baseUrl: 'https://api.payment.com',
    timeout: 30_000,               // Default: 60_000 (60s)
    headers: { 'X-API-Key': 'key123' },
    // All AxiosRequestConfig options are supported
  },
});

const url = api.getRequestUrl({ paths: ['/v1', '/charges'] });
const response = await api.getNetworkService().post({
  url,
  body: { amount: 1000, currency: 'USD' },
});
// response.data contains parsed JSON

// Access the underlying Axios instance for interceptors
const axiosInstance = api.getWorker();
axiosInstance.interceptors.request.use((config) => {
  config.headers['X-Request-ID'] = crypto.randomUUID();
  return config;
});
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle token refresh
    }
    return Promise.reject(error);
  },
);

// Default configs:
// withCredentials: true
// validateStatus: (status) => status < 500
// HTTPS: auto-creates https.Agent with rejectUnauthorized: false
```

**Differences between implementations:**

| Feature       | NodeFetch                     | Axios                            |
| ------------- | ----------------------------- | -------------------------------- |
| Return type   | `Response` (Web API)          | `AxiosResponse.data` (parsed)    |
| Dependencies  | None (built-in `fetch`)       | `axios`                          |
| Timeout       | `AbortController`             | Axios built-in                   |
| Interceptors  | Manual                        | Built-in request/response        |
| HTTPS         | Standard                      | Auto `https.Agent`               |
| Credentials   | Manual headers                | `withCredentials: true`          |

### TCP

TCP server and client with optional TLS, authentication flow, and client state tracking.

**Server:**

```typescript
import { NetworkTcpServer, NetworkTcpClient } from '@venizia/ignis-helpers';

const server = new NetworkTcpServer({
  identifier: 'data-server',
  serverOptions: {},                          // net.ServerOpts
  listenOptions: { host: '0.0.0.0', port: 9000 }, // net.ListenOptions
  authenticateOptions: {
    required: true,                           // Require client auth
    duration: 5000,                           // 5s to authenticate
  },
  extraEvents: {
    'timeout': ({ id, socket }) => {
      console.log(`Client ${id} timed out`);
    },
  },
  onServerReady: ({ server }) => {
    console.log('Server listening on', server.address());
  },
  onClientConnected: ({ id, socket }) => {
    console.log(`Client ${id} connected from ${socket.remoteAddress}:${socket.remotePort}`);
    // Client starts as 'unauthorized' when authenticateOptions.required = true
  },
  onClientData: ({ id, data }) => {
    console.log(`[${id}] Data:`, data.toString());
  },
  onClientClose: ({ id }) => {
    console.log(`Client ${id} disconnected`);
  },
  onClientError: ({ id, error }) => {
    console.error(`Client ${id} error:`, error);
  },
});

// Authentication management
server.doAuthenticate({ id: clientId, state: 'authenticated' });
// States: 'unauthorized' | 'authenticating' | 'authenticated'

// Send data to a client
server.emit({ clientId: id, payload: 'Hello client!' });
server.emit({ clientId: id, payload: Buffer.from([0x01, 0x02]) });

// Get connected clients
const clients = server.getClients();  // Record<string, ITcpSocketClient>
const client = server.getClient({ id: clientId });
// { id, socket, state, subscriptions: Set, storage: { connectedAt, authenticatedAt, ... } }
```

**Client:**

```typescript
const client = new NetworkTcpClient({
  identifier: 'data-client',
  options: { host: '127.0.0.1', port: 9000 },  // net.TcpSocketConnectOpts
  reconnect: true,           // Auto-reconnect on error (default: false)
  maxRetry: 5,               // Max reconnection attempts (default: 5)
  encoding: 'utf-8',         // Socket encoding (optional)
  onConnected: ({ client }) => {
    console.log('Connected to server');
  },
  onData: ({ identifier, message }) => {
    console.log(`[${identifier}] Received:`, message);
  },
  onClosed: ({ client }) => {
    console.log('Connection closed');
  },
  onError: (error) => {
    console.error('Error:', error);
    // Auto-reconnect fires after 5000ms if reconnect: true
  },
});

client.connect({ resetReconnectCounter: true });
client.emit({ payload: 'Hello server!' });
client.emit({ payload: Buffer.from([0x01, 0x02]) });

client.isConnected();         // boolean
client.forceReconnect();      // Destroy + reconnect with counter reset
client.disconnect();          // Destroy + clear reconnect timer
```

**TLS variants:** `NetworkTLSTcpServer` and `NetworkTLSTcpClient` accept `tls.TLSSocketOptions` and `tls.ConnectionOptions` respectively. They use the same API but with encrypted connections.

### UDP

```typescript
import { NetworkUdpClient } from '@venizia/ignis-helpers';

// Unicast
const udpSimple = NetworkUdpClient.newInstance({
  identifier: 'udp-sender',
  port: 5000,
  host: '0.0.0.0',
  onData: ({ message, remoteInfo }) => {
    console.log(`From ${remoteInfo.address}:${remoteInfo.port}:`, message.toString());
  },
});
udpSimple.connect();

// Multicast
const udp = NetworkUdpClient.newInstance({
  identifier: 'sensor-listener',
  port: 5000,
  reuseAddr: true,
  multicastAddress: {
    groups: ['239.1.2.3', '239.1.2.4'],
    interface: '0.0.0.0',
  },
  onData: ({ message, remoteInfo }) => {
    console.log(`From ${remoteInfo.address}:${remoteInfo.port}:`, message.toString());
  },
  onBind: async ({ socket, multicastAddress }) => {
    // Join multicast groups after binding
    for (const group of multicastAddress?.groups ?? []) {
      socket.addMembership(group, multicastAddress?.interface);
    }
  },
  onConnected: ({ identifier, host, port }) => {
    console.log(`${identifier} listening on ${host}:${port}`);
  },
  onClosed: ({ identifier }) => {
    console.log(`${identifier} closed`);
  },
  onError: ({ identifier, error }) => {
    console.error(`${identifier} error:`, error);
  },
});

udp.connect();
udp.isConnected();    // boolean
udp.disconnect();
```

---

## UID (Snowflake)

Snowflake ID generator producing unique, time-sortable IDs with Base62 encoding.

### Bit Layout

```
 70-bit Snowflake ID
 +-----------------+----------+----------+
 |   Timestamp     | Worker   | Sequence |
 |   (48 bits)     | (10 bits)| (12 bits)|
 +-----------------+----------+----------+
 MSB                                   LSB
```

| Field     | Bits | Range                         | Description                    |
| --------- | ---- | ----------------------------- | ------------------------------ |
| Timestamp | 48   | ~8,919 years from epoch       | Milliseconds since epoch       |
| Worker ID | 10   | 0--1023 (1024 workers)        | Unique worker identifier       |
| Sequence  | 12   | 0--4095 per millisecond       | Per-millisecond counter        |

**Output:** Base62 encoded string (10--12 characters).
**Default epoch:** 2025-01-01 00:00:00 UTC (`1735689600000`).
**Lifespan:** Until approximately 10,944 AD.

### UID API Reference

```typescript
import { SnowflakeUidHelper, SnowflakeConfig } from '@venizia/ignis-helpers';

// Default: workerId=199, epoch=2025-01-01
const uid = new SnowflakeUidHelper();

// Custom configuration
const uid = new SnowflakeUidHelper({
  workerId: 42,                                // 0-1023
  epoch: BigInt(1735689600000),                // Custom epoch
});

// --- Generate IDs ---

const id = uid.nextId();                       // Base62 string, e.g., "9du1sJXO88"
const snowflake = uid.nextSnowflake();         // Raw BigInt, e.g., 130546360012247045n

// --- Parse an ID back to components ---

const parsed = uid.parseId('9du1sJXO88');
// {
//   raw: 130546360012247045n,
//   timestamp: Date,       // When the ID was generated
//   workerId: 199,         // Which worker generated it
//   sequence: 0,           // Sequence within that millisecond
// }

// --- Extract individual components from raw snowflake ---

const ts = uid.extractTimestamp(snowflake);     // Date
const wid = uid.extractWorkerId(snowflake);    // number (0-1023)
const seq = uid.extractSequence(snowflake);    // number (0-4095)

// --- Base62 encoding/decoding ---

const encoded = uid.encodeBase62(BigInt(123456789));  // "8m0Kx"
const decoded = uid.decodeBase62('8m0Kx');            // 123456789n

// --- Configuration constants ---

SnowflakeConfig.DEFAULT_EPOCH;            // 1735689600000n (2025-01-01)
SnowflakeConfig.MAX_WORKER_ID;            // 1023n
SnowflakeConfig.MAX_SEQUENCE;             // 4095n
SnowflakeConfig.MAX_CLOCK_BACKWARD_MS;    // 100n (tolerance for clock drift)

// Get current worker ID
uid.getWorkerId();                         // number
```

### Throughput and Limits

| Metric                                   | Value                            |
| ---------------------------------------- | -------------------------------- |
| **IDs per millisecond per worker**       | 4,096                            |
| **IDs per second per worker**            | 4,096,000                        |
| **Max workers**                          | 1,024                            |
| **Total IDs per second (all workers)**   | ~4.2 billion                     |
| **ID lifespan**                          | ~8,919 years from epoch          |
| **Clock backward tolerance**             | 100ms (waits), >100ms throws    |
| **Base62 output length**                 | 10--12 characters                |
| **Base62 charset**                       | `0-9A-Za-z`                      |

**Clock drift handling:**

- If clock moves backward <= 100ms: waits (spin-loop) until clock catches up
- If clock moves backward > 100ms: throws `ApplicationError` (500)
- If sequence exhausted in a millisecond (>4095): waits for next millisecond

**Expiry warning:** The generator logs a warning when approaching the 48-bit timestamp limit (~10 years before expiry). Action: plan migration to a new epoch.

---

## Environment

### Environment Detection

```typescript
import { Environment } from '@venizia/ignis-helpers';

const env = Environment.current;            // process.env.NODE_ENV or 'development'
const isProd = Environment.is({ name: 'production' });

// Available constants
Environment.LOCAL;       // 'local'
Environment.DEBUG;       // 'debug'
Environment.DEVELOPMENT; // 'development'
Environment.ALPHA;       // 'alpha'
Environment.BETA;        // 'beta'
Environment.STAGING;     // 'staging'
Environment.PRODUCTION;  // 'production'

// Common environment set (used for debug level gating)
Environment.COMMON_ENVS; // Set containing all above values
```

### Application Environment

Prefixed environment variable management.

```typescript
import { applicationEnvironment, ApplicationEnvironment } from '@venizia/ignis-helpers';

// Default instance uses prefix 'APP_ENV' (configurable via APPLICATION_ENV_PREFIX env var)
const dbHost = applicationEnvironment.get<string>('APP_ENV_DB_HOST');
applicationEnvironment.set('APP_ENV_FEATURE_FLAG', true);

const isDev = applicationEnvironment.isDevelopment();
const keys = applicationEnvironment.keys();
// Only returns keys starting with the configured prefix

// Custom prefix
const myEnv = new ApplicationEnvironment({
  prefix: 'MY_APP',
  envs: process.env,
});
const val = myEnv.get<string>('MY_APP_SECRET');
```

### Runtime Detection

```typescript
import { RuntimeModules } from '@venizia/ignis-helpers';

const runtime = RuntimeModules.detect();  // 'bun' or 'node'
const isBun = RuntimeModules.isBun();     // Checks: typeof Bun !== 'undefined'
const isNode = RuntimeModules.isNode();
```

---

## Error

Standardized error class with HTTP status codes and optional message codes.

```typescript
import { ApplicationError, getError } from '@venizia/ignis-helpers';

// Using factory function (preferred)
throw getError({
  statusCode: 404,
  message: 'User not found',
  messageCode: 'user.not_found',   // Optional machine-readable code
});

// Using class constructor
throw new ApplicationError({
  statusCode: 400,
  message: 'Invalid input',
});

// Static factory
throw ApplicationError.getError({
  statusCode: 500,
  message: 'Internal error',
});

// ApplicationError extends Error
try {
  throw getError({ statusCode: 403, message: 'Forbidden', messageCode: 'auth.forbidden' });
} catch (error) {
  if (error instanceof ApplicationError) {
    console.log(error.statusCode);   // 403
    console.log(error.message);      // 'Forbidden'
    console.log(error.messageCode);  // 'auth.forbidden'
    console.log(error.stack);        // Standard Error stack trace
  }
}
```

**Error Zod schema (for OpenAPI):**

```typescript
import { ErrorSchema } from '@venizia/ignis-helpers';

// ErrorSchema is a Zod schema used in OpenAPI route definitions
// { name?: string, statusCode?: number, messageCode?: string, message: string }
```

---

## Worker Thread

Worker pool management and inter-thread messaging.

### Worker Pool

Singleton pool that tracks worker threads up to the number of CPU cores.

```typescript
import { WorkerPoolHelper, BaseWorkerHelper } from '@venizia/ignis-helpers';

const pool = WorkerPoolHelper.getInstance(); // Singleton

// Create and register a worker
const worker = new BaseWorkerHelper({
  identifier: 'image-processor',
  path: './workers/image-processor.ts',
  options: { workerData: { quality: 80 } },  // WorkerOptions
  eventHandlers: {
    onOnline: () => console.log('Worker online'),
    onMessage: ({ message }) => console.log('Result:', message),
    onError: ({ error }) => console.error('Worker error:', error),
    onExit: ({ code }) => console.log('Worker exited:', code),
    onMessageError: ({ error }) => console.error('Message error:', error),
  },
});

pool.register({ key: 'image-processor', worker });

// Check pool
pool.has({ key: 'image-processor' });  // true
pool.size();                            // 1
pool.get({ key: 'image-processor' });  // BaseWorkerHelper instance

// Unregister (terminates worker thread)
await pool.unregister({ key: 'image-processor' });

// Pool warns when size reaches CPU core count (configurable via ignoreMaxWarning)
```

### Worker Bus

Message bus for structured inter-thread communication using `MessagePort`.

```typescript
import {
  BaseWorkerBusHelper,
  BaseWorkerMessageBusHandlerHelper,
  BaseWorkerThreadHelper,
} from '@venizia/ignis-helpers';

// --- Inside worker thread ---
const thread = new BaseWorkerThreadHelper({ scope: 'ImageWorker' });
// Throws if called from main thread

const busHandler = new BaseWorkerMessageBusHandlerHelper({
  scope: 'image-bus-handler',
  onMessage: ({ message }) => {
    console.log('Received from main:', message);
  },
  onClose: () => console.log('Bus closed'),
  onError: ({ error }) => console.error('Bus error:', error),
  onExit: ({ exitCode }) => console.log('Bus exited:', exitCode),
});

const bus = new BaseWorkerBusHelper({
  scope: 'image-bus',
  port: parentPort!,           // MessagePort from worker_threads
  busHandler,
});

thread.bindWorkerBus({ key: 'main', bus });

// Send message to main thread
bus.postMessage({
  message: { type: 'result', data: processedImage },
  transferList: undefined,       // Optional Transferable[]
});

// Lifecycle hooks
// bus.onBeforePostMessage = ({ message }) => { ... };
// bus.onAfterPostMessage = ({ message }) => { ... };

// Retrieve a bound bus
const mainBus = thread.getWorkerBus({ key: 'main' });

// Unbind (removes all listeners)
thread.unbindWorkerBus({ key: 'main' });
```

---

## Common Utilities

### Date Utility

Day.js with UTC, timezone, weekday, isoWeek, and custom parse format plugins pre-configured.

```typescript
import {
  dayjs,
  sleep,
  isWeekday,
  getPreviousWeekday,
  getNextWeekday,
  getDateTz,
  hrTime,
} from '@venizia/ignis-helpers';

// Default timezone: Asia/Ho_Chi_Minh (configurable via APP_ENV_APPLICATION_TIMEZONE)
const now = dayjs();
const utc = dayjs.utc();

// Sleep utility
await sleep(1000); // Sleep 1 second

// Weekday checks (Monday=1 through Friday=5)
isWeekday('2025-01-06');                                 // true (Monday)
isWeekday('2025-01-05');                                 // false (Sunday)

// Navigate to adjacent weekdays
const prevWeekday = getPreviousWeekday();                 // Previous weekday from today
const nextWeekday = getNextWeekday();                     // Next weekday from today
const prevFromDate = getPreviousWeekday({ date: '2025-01-06' });

// Timezone conversion
const tzDate = getDateTz({
  date: '2025-01-01T00:00:00Z',
  timezone: 'America/New_York',
  useClientTz: false,       // default
  timeOffset: -5,           // Additional hour offset
});

// High-resolution time (seconds with 9 decimal places)
const elapsed = hrTime(); // e.g., 1234567.890123456
```

### Parse Utility

```typescript
import {
  int, float, isInt, isFloat, toBoolean,
  toCamel, keysToCamel,
  toStringDecimal, getNumberValue, getUID,
  parseArrayToRecordWithKey, parseArrayToMapWithKey,
} from '@venizia/ignis-helpers';

// --- Numeric parsing ---
int('42');                        // 42
int('3.14');                      // 3
int('1,234');                     // 1234 (removes commas)
int(null);                        // 0
int(NaN);                         // 0

float('3.14159', 2);              // 3.14
float('3.14159', 4);              // 3.1416 (rounds using lodash.round)
float('1,234.56');                // 1234.56

isInt(42);                        // true
isInt(3.14);                      // false
isFloat(3.14);                    // true
isFloat(42);                      // true (integers are also valid floats)

// --- Boolean parsing ---
toBoolean('true');                // true
toBoolean('');                    // false
toBoolean('false');               // false
toBoolean('0');                   // false
toBoolean(0);                     // false
toBoolean(null);                  // false
toBoolean(undefined);             // false
toBoolean(1);                     // true
toBoolean('yes');                 // true (any non-falsy string)

// --- Case conversion ---
toCamel('snake_case');            // 'snakeCase'
toCamel('kebab-case');            // 'kebabCase'
toCamel('already_camelCase');     // 'alreadyCamelCase'

keysToCamel({ user_name: 'Alice', home_address: { zip_code: '12345' } });
// { userName: 'Alice', homeAddress: { zipCode: '12345' } }
// Recursively converts nested objects (but not arrays or Dates)

// --- Number formatting ---
toStringDecimal(1234567.891, 2);  // '1,234,567.89' (en-US locale)
toStringDecimal(1234567, 0);      // '1,234,567'
toStringDecimal(3.14159, 4);      // '3.1416'
toStringDecimal(42, 2, { useLocaleFormat: false }); // '42.00'

// EU number format support
getNumberValue('1.234,56', { locale: 'eu' });           // 1234 (parsed as int)
getNumberValue('1.234,56', { locale: 'eu', method: 'float' }); // 1234.56
getNumberValue('1,234.56', { locale: 'us' });           // 1234 (default locale)

// --- Random ID ---
getUID();                         // Random string, e.g., 'K7X2F9ZA1B' (Math.random base36)

// --- Array to keyed collections ---
const users = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }];

const record = parseArrayToRecordWithKey({ arr: users, keyMap: 'id' });
// { 1: { id: 1, name: 'A' }, 2: { id: 2, name: 'B' } }

const map = parseArrayToMapWithKey(users, 'id');
// Map { 1 => { id: 1, name: 'A' }, 2 => { id: 2, name: 'B' } }
// Note: Duplicate keys = last element wins in both cases
```

### Promise Utility

```typescript
import {
  executePromiseWithLimit,
  isPromiseLike,
  getDeepProperty,
  transformValueOrPromise,
} from '@venizia/ignis-helpers';

// --- Parallel task execution with concurrency limit ---
// Execute 100 tasks with max 10 concurrent
const urls = Array.from({ length: 100 }, (_, i) => `https://api.example.com/item/${i}`);
const tasks = urls.map(url => () => fetch(url).then(r => r.json()));

const results = await executePromiseWithLimit({
  tasks,          // Array<() => Promise<T>>
  limit: 10,      // Max concurrent promises
  onTaskDone: ({ result }) => {
    console.log('Task completed:', result);
  },
});
// results: all 100 resolved values in order

// --- Promise detection ---
isPromiseLike(Promise.resolve(1));       // true
isPromiseLike({ then: () => {} });       // true (thenable)
isPromiseLike(42);                        // false
isPromiseLike(null);                      // false

// --- Deep property access ---
const obj = { a: { b: { c: 42 } } };
const value = getDeepProperty(obj, 'a.b.c'); // 42
// Throws ApplicationError if any part of the path is null/undefined

// --- Transform value or promise ---
const transformed = await transformValueOrPromise(
  fetchData(),                                    // ValueOrPromise<T>
  (data) => data.map(item => item.name),         // Transformer function
);
// Works with both sync values and promises
```

### Request Utility

```typescript
import {
  parseMultipartBody,
  sanitizeFilename,
  encodeRFC5987,
  createContentDispositionHeader,
} from '@venizia/ignis-helpers';

// --- Parse multipart form data (Hono context) ---

// Memory storage (default) -- files kept as Buffer
const files = await parseMultipartBody({
  context: c,             // Hono Context (or anything with .req.formData())
  storage: 'memory',      // 'memory' | 'disk'
});
// Returns: IParsedFile[]
// [{ fieldname, originalname, encoding, mimetype, size, buffer }]

// Disk storage -- files written to filesystem
const diskFiles = await parseMultipartBody({
  context: c,
  storage: 'disk',
  uploadDir: './uploads',  // Default: './uploads' (created if missing)
});
// Returns: IParsedFile[]
// [{ fieldname, originalname, encoding, mimetype, size, filename, path }]
// filename format: '<timestamp>-<random>-<sanitized-original>'

// --- Filename sanitization ---
sanitizeFilename('photo.jpg');               // 'photo.jpg'
sanitizeFilename('../../../etc/passwd');      // '______etc_passwd' or 'download'
sanitizeFilename('.hidden');                  // 'hidden' (leading dot removed)
sanitizeFilename('file with spaces.txt');    // 'file with spaces.txt'
sanitizeFilename('');                         // 'download' (fallback)
sanitizeFilename('...');                      // 'download' (fallback)
// Allowed characters: alphanumeric, spaces, hyphens, underscores, dots

// --- RFC 5987 encoding ---
encodeRFC5987("report (2025).pdf");
// 'report%20%282025%29.pdf'

// --- Content-Disposition header (RFC 5987 compliant) ---
const header = createContentDispositionHeader({
  filename: 'report (2025).pdf',
  type: 'attachment',     // 'attachment' | 'inline'
});
// 'attachment; filename="report__2025_.pdf"; filename*=UTF-8\'\'report__2025_.pdf'
// Includes both ASCII fallback (filename=) and UTF-8 encoded (filename*=) for compatibility
```

### Performance Utility

```typescript
import {
  getPerformanceCheckpoint,
  getExecutedPerformance,
  executeWithPerformanceMeasure,
} from '@venizia/ignis-helpers';

// --- Manual checkpoints ---
const start = getPerformanceCheckpoint(); // performance.now()

// ... do work ...

const elapsed = getExecutedPerformance({ from: start, digit: 3 });
// e.g., 142.567 (ms, 3 decimal places)
// Default digit: 6

// --- Automatic measurement with logging ---
const result = await executeWithPerformanceMeasure({
  scope: 'DataSync',
  description: 'Syncing user data',
  logger,                    // Logger instance (falls back to console)
  level: 'debug',            // Log level (default: 'debug')
  args: { userId: 123 },    // Optional context args (logged)
  task: () => syncUserData(),
});
// Logs:
// [DataSync] START | Syncing user data... | Args: {"userId":123}
// [DataSync] DONE  | Syncing user data | Args: {"userId":123} | Took: 142.567 (ms)
// Returns: result of syncUserData()
```

### Module Utility

Pre-flight check for optional dependencies before using them. Throws a clear error with install instructions if any module is missing.

```typescript
import { validateModule } from '@venizia/ignis-helpers';

// Check single module
await validateModule({
  scope: 'SocketIO',
  modules: ['socket.io'],
});

// Check multiple modules
await validateModule({
  scope: 'SocketIO',
  modules: ['socket.io', '@socket.io/redis-adapter'],
});
// If socket.io is missing:
// throws ApplicationError:
// "[validateModule] socket.io is required for SocketIO. Please install 'socket.io'"

// Without scope
await validateModule({
  modules: ['bullmq'],
});
// If bullmq is missing:
// throws: "[validateModule] bullmq is required. Please install 'bullmq'"
```

This utility is used internally by all sub-path modules (BullMQ, MQTT, MinIO, Socket.IO, Axios, Cron, Kafka) to provide clear error messages when peer dependencies are not installed.

---

## Common Types

```typescript
// Nullable
type TNullable<T> = T | undefined | null;

// Flexible types
type AnyType = any;
type AnyObject = Record<string | symbol | number, any>;

// Value types
type ValueOrPromise<T> = T | Promise<T>;
type ValueOf<T> = T[keyof T];
type ValueOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
type ValueOptionalExcept<T, K extends keyof T> = Pick<T, K> & Partial<Omit<T, K>>;

// Class types
type TConstructor<T> = new (...args: any[]) => T;
type TAbstractConstructor<T> = abstract new (...args: any[]) => T;
type TClass<T> = TConstructor<T> & { [property: string]: any };
type TAbstractClass<T> = TAbstractConstructor<T> & { [property: string]: any };

// Mixin types
type TMixinTarget<T> = TConstructor<{ [P in keyof T]: T[P] }>;
type TAbstractMixinTarget<T> = TAbstractConstructor<{ [P in keyof T]: T[P] }>;

// Resolver types
type TResolver<T> = (...args: any[]) => T;
type TAsyncResolver<T> = (...args: any[]) => T | Promise<T>;
type TValueOrResolver<T> = T | TResolver<T>;

// Resolver helpers
resolveValue<T>(valueOrResolver)       // Resolve sync value or resolver (handles class constructors)
resolveValueAsync<T>(valueOrResolver)  // Resolve async value or resolver
resolveClass<T>(ref)                   // Resolve class reference or string binding key

// Configuration
interface IConfigurable<Options, Result> {
  configure(opts?: Options): ValueOrPromise<Result>;
}

// Constants
RuntimeModules.detect() / .isBun() / .isNode()
DataTypes.NUMBER | TEXT | BYTE | JSON | BOOLEAN
HTTP.Headers, HTTP.Methods, HTTP.ResultCodes, HTTP.HeaderValues
MimeTypes.IMAGE | VIDEO | TEXT | UNKNOWN

// Field Mapping Types (for dynamic schemas)
type TFieldMappingDataType = 'string' | 'number' | 'strings' | 'numbers' | 'boolean';
interface IFieldMapping { name: string; type: TFieldMappingDataType; default?: any; }

// JSX (re-exported from Hono)
type { Child, FC, PropsWithChildren } from 'hono/jsx';
```

---

## Key Patterns

### BaseHelper

All helpers extend `BaseHelper` which provides scoped logging automatically:

```typescript
class BaseHelper {
  scope: string;
  identifier: string;
  logger: Logger;

  constructor(opts: { scope: string; identifier?: string });

  getIdentifier(): string;
  getLogger(): Logger;
}
```

Usage in helpers:

```typescript
class MyHelper extends BaseHelper {
  constructor() {
    super({ scope: 'MyHelper', identifier: 'instance-1' });
  }

  doWork() {
    this.logger.for('doWork').info('Starting...');
    this.logger.for('doWork').debug('Detail: %j', data);
  }
}
```

The logger scope is constructed as `[scope-identifier]` (or just `[scope]` if no identifier). Method-scoped loggers append `-methodName`.

### Options Objects

All APIs use options objects instead of positional parameters:

```typescript
// Correct
redis.get({ key: 'user:1' });
aes.encrypt({ message: 'data', secret: 'key' });
pool.register({ key: 'worker-1', worker: myWorker });

// NOT positional arguments
// redis.get('user:1');       -- wrong
// aes.encrypt('data', 'key') -- wrong
```

### Event Lifecycle

Helpers that manage connections follow a consistent lifecycle hook pattern:

```typescript
{
  onInitialized?: (opts) => void;   // Instance created
  onConnected?: (opts) => void;     // Connection established
  onReady?: (opts) => void;         // Ready for operations
  onError?: (opts) => void;         // Error occurred
}
```

### IConfigurable

Helpers that require async initialization implement `IConfigurable`:

```typescript
interface IConfigurable<Options, Result> {
  configure(opts?: Options): ValueOrPromise<Result>;
}
```

---

## Integration with IGNIS Core

The helpers package is designed to integrate with the IGNIS framework's IoC container. Here is how helpers are typically used within an IGNIS application:

**Binding helpers in the application lifecycle:**

```typescript
import { BaseApplication, BootMixin } from '@venizia/ignis';
import { RedisSingleHelper, Logger } from '@venizia/ignis-helpers';

class MyApplication extends BootMixin(BaseApplication) {
  async preConfigure() {
    // Register Redis as a singleton binding
    this.container.bind('datasources.Redis').to(
      new RedisSingleHelper({
        name: 'main',
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT),
        password: process.env.REDIS_PASSWORD,
      })
    );

    // Register other helpers...
    await super.preConfigure();
  }
}
```

**Injecting helpers in services:**

```typescript
import { inject } from '@venizia/ignis-inversion';
import { RedisHelper } from '@venizia/ignis-helpers';

export class CacheService {
  constructor(
    @inject({ key: 'datasources.Redis' }) private redis: RedisHelper,
  ) {}

  async getCached(key: string) {
    return this.redis.getObject({ key });
  }
}
```

**Using helpers in controllers:**

```typescript
import { controller, get } from '@venizia/ignis';
import { inject } from '@venizia/ignis-inversion';

@controller({ path: '/health' })
export class HealthController extends BaseController {
  constructor(
    @inject({ key: 'datasources.Redis' }) private redis: RedisHelper,
  ) { super(); }

  @get('/')
  async check() {
    const ping = await this.redis.ping();
    return { redis: ping === 'PONG' ? 'up' : 'down' };
  }
}
```

---

## Environment Variables Reference

Complete table of all environment variables used across all helpers modules.

### Logger

| Variable                            | Default        | Module  | Description                              |
| ----------------------------------- | -------------- | ------- | ---------------------------------------- |
| `APP_ENV_LOGGER_FOLDER_PATH`        | `./`           | Logger  | Directory for log files                  |
| `APP_ENV_LOGGER_FORMAT`             | `text`         | Logger  | Log format: `json` or `text`             |
| `APP_ENV_LOGGER_FILE_FREQUENCY`     | `1h`           | Logger  | File rotation frequency                  |
| `APP_ENV_LOGGER_FILE_MAX_SIZE`      | `100m`         | Logger  | Max file size before rotation            |
| `APP_ENV_LOGGER_FILE_MAX_FILES`     | `5d`           | Logger  | Max retention period                     |
| `APP_ENV_LOGGER_FILE_DATE_PATTERN`  | `YYYYMMDD_HH`  | Logger  | Date pattern for filenames               |
| `APP_ENV_LOGGER_DGRAM_HOST`         | --             | Logger  | UDP transport host                       |
| `APP_ENV_LOGGER_DGRAM_PORT`         | --             | Logger  | UDP transport port                       |
| `APP_ENV_LOGGER_DGRAM_LABEL`        | --             | Logger  | UDP transport label                      |
| `APP_ENV_LOGGER_DGRAM_LEVELS`       | --             | Logger  | Comma-separated UDP levels               |
| `DEBUG`                             | --             | Logger  | Enable debug level output                |
| `APP_ENV_EXTRA_LOG_ENVS`            | --             | Logger  | Extra NODE_ENV values for debug          |

### Application

| Variable                     | Default            | Module          | Description                           |
| ---------------------------- | ------------------ | --------------- | ------------------------------------- |
| `APP_ENV_APPLICATION_NAME`   | `APP`              | Logger/Defaults | Application name prefix               |
| `APP_ENV_APPLICATION_TIMEZONE` | `Asia/Ho_Chi_Minh` | Date utility  | Default timezone for dayjs            |
| `APPLICATION_ENV_PREFIX`     | `APP_ENV`          | Environment     | Prefix for ApplicationEnvironment     |
| `NODE_ENV`                   | `development`      | Environment     | Runtime environment name              |

---

## Error Handling Patterns

### Connection-based Helpers (Redis, MQTT, TCP, etc.)

All connection helpers use lifecycle hooks for error handling. Errors are never swallowed -- they are logged and forwarded to your callback:

```typescript
const redis = new RedisSingleHelper({
  // ...
  onError: ({ name, helper, error }) => {
    // Log to external monitoring
    monitoring.reportError('redis', error);

    // Check if connection is recoverable
    if (helper.client.status === 'end') {
      // Connection is permanently closed
      process.exit(1);
    }
    // Otherwise, ioredis will auto-reconnect per retryStrategy
  },
});
```

### Queue Helpers

BullMQ worker failures are handled per-job:

```typescript
const worker = BullMQHelper.newInstance({
  // ...
  onWorkerDataFail: async (job, error) => {
    // job may be undefined if the failure happened before job was fetched
    if (job) {
      console.error(`Job ${job.id} failed (attempt ${job.attemptsMade}):`, error);
    }
    // BullMQ automatically retries based on job options (attempts, backoff)
  },
});
```

### Kafka Helpers

Kafka helpers use try/catch with re-throw. All operations log the error before throwing:

```typescript
try {
  await producer.send({ messages: [...] });
} catch (error) {
  // The helper already logged:
  // "[send] Failed to send messages: <error> | ID: <identifier>"
  // The onError callback was also invoked
  // The error is re-thrown for your handling
}
```

### Storage Helpers

Storage operations throw `ApplicationError` for validation failures and missing resources:

```typescript
try {
  await storage.upload({ bucket: 'nonexistent', files: [...] });
} catch (error) {
  // ApplicationError: "[upload] Bucket does not exist | name: nonexistent"
}

try {
  await storage.createBucket({ name: '../etc/passwd' });
} catch (error) {
  // ApplicationError: "[createBucket] Invalid name to create bucket!"
}
```

---

## Performance Tips

### Redis Connection Pooling

- `RedisHelper` creates a single IoRedis connection by default. For high-throughput, consider multiple `RedisHelper` instances with different roles (read vs write).
- BullMQ calls `.duplicate()` automatically -- it does not share your main connection.
- The `maxRetriesPerRequest: null` setting prevents blocking on failed requests.
- Use `autoConnect: false` (lazy connect) when you need to control connection timing.

### Logger Performance

- `Logger.get()` caching avoids creating new Winston loggers per call.
- The `debug()` method has zero overhead when `DEBUG` is not set (check is pre-computed at module load).
- For hot paths (>10k calls/sec), use `HfLogger` instead of Winston (~100--300ns vs ~1--10us).
- Consider disabling file transports in development for faster startup.

### Queue Optimization

- In-memory `QueueHelper` processes one item at a time (sequential). For parallel processing, use BullMQ with `numberOfWorker > 1`.
- BullMQ default job options (`removeOnComplete: true`, `removeOnFail: true`) prevent Redis memory growth.
- For high-throughput Kafka, tune `highWaterMark` and `maxWaitTime` based on your message sizes.

### Storage

- MinIO `listObjects` returns a stream internally -- the helper collects all results. Use `maxKeys` to limit memory usage.
- Disk storage validates names before I/O operations, preventing unnecessary filesystem calls.
- Use `normalizeNameFn` to control file naming and avoid repeated sanitization.

### Crypto

- AES-256-GCM is recommended over CBC for new code (built-in authentication).
- RSA key generation is expensive (~50--200ms for 2048-bit). Generate keys once and store them.
- ECDH uses Web Crypto API (`crypto.subtle`) which is hardware-accelerated on most platforms.
- Pre-encode HfLogger messages and ECDH keys at initialization time, not in hot paths.

### Network

- `NodeFetchNetworkRequest` has zero dependencies but no interceptor support.
- `AxiosNetworkRequest` supports interceptors but adds the `axios` dependency.
- TCP clients with `reconnect: true` use a 5-second fixed delay between reconnection attempts.

---

## About IGNIS

IGNIS brings together the structured, enterprise development experience of **LoopBack 4** with the blazing speed and simplicity of **Hono** -- giving you the best of both worlds.

## Documentation

- [IGNIS Repository](https://github.com/VENIZIA-AI/ignis)
- [Getting Started](https://github.com/VENIZIA-AI/ignis/blob/main/docs/wiki/content/get-started/index.md)
- [Helpers Reference](https://github.com/VENIZIA-AI/ignis/blob/main/docs/wiki/content/references/helpers/index.md)

## License

[MIT](./LICENSE.md)
