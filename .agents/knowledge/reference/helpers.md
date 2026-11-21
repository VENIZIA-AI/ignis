---
type: Reference
title: Helpers catalog
description: Every helper module and utility in packages/helpers (generated).
resource: packages/helpers/src
tags: [reference, helpers, catalog]
generated:
  by: process:okf-gen
---

> Generated from source - do not edit; run `make okf-gen`. Package: [helpers](/packages/helpers.md).

**45 helper classes across 18 modules, 14 utilities.**

## Modules

| Module | Classes |
|---|---|
| `cron/` | `CronHelper` |
| `crypto/` | _(see source)_ |
| `env/` | _(see source)_ |
| `error/` | _(see source)_ |
| `logger/` | _(see source)_ |
| `network/` | `AbstractNetworkFetchableHelper` |
| `pool/` | `AbstractPoolHelper` · `BasePoolHelper` |
| `queue/` | `BaseKafkaHelper` · `BullMQHelper` · `HfQueueHelper` · `KafkaAdminHelper` · `KafkaConsumerHelper` · `KafkaProducerHelper` · `KafkaSchemaRegistryHelper` · `MQTTClientHelper` · `SequentialQueueHelper` |
| `redis/` | `AbstractRedisHelper` · `RedisClusterHelper` · `RedisSentinelHelper` · `RedisSingleHelper` |
| `retry/` | _(see source)_ |
| `secrets/` | `AbstractSecretsHelper` · `DotenvVaultHelper` · `HashiCorpVaultHelper` · `SystemEnvsHelper` |
| `slug/` | _(see source)_ |
| `socket/` | `SocketIOClientHelper` · `SocketIOServerHelper` · `WebSocketDeliveryHelper` · `WebSocketServerHelper` |
| `storage/` | `BaseStorageHelper` · `BunS3Helper` · `DiskHelper` · `MemoryStorageHelper` |
| `temporal/` | `AbstractTemporalHelper` · `TemporalHelper` |
| `tree/` | _(see source)_ |
| `uid/` | `NumericUidHelper` · `OpaqueUidHelper` · `SnowflakeUidHelper` · `TokenUidHelper` · `UuidHelper` |
| `worker-thread/` | `AbstractWorkerBusHelper` · `AbstractWorkerHelper` · `AbstractWorkerMessageBusHandlerHelper` · `AbstractWorkerThreadHelper` · `BaseWorkerBusHelper` · `BaseWorkerHelper` · `BaseWorkerMessageBusHandlerHelper` · `BaseWorkerThreadHelper` · `WorkerPoolHelper` |

## Utilities

`build-info` · `echo` · `error` · `form-body` · `hr-time` · `module` · `parse` · `performance` · `project-root` · `promise` · `record` · `request` · `retry` · `slug`
