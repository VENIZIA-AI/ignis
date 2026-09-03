---
type: Reference
title: Helpers catalog
description: Every helper module and utility in packages/helpers (generated).
resource: packages/helpers/src
tags: [reference, helpers, catalog]
---

> Generated from source - do not edit; run `make okf-gen`. Package: [helpers](/packages/helpers.md).

**43 helper classes across 17 modules, 7 utilities.**

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
| `retry/` | `RetryHelper` |
| `secrets/` | `AbstractSecretsHelper` · `DotenvVaultHelper` · `HashiCorpVaultHelper` · `SystemEnvsHelper` |
| `slug/` | `SlugHelper` |
| `socket/` | `SocketIOClientHelper` · `SocketIOServerHelper` · `WebSocketDeliveryHelper` · `WebSocketServerHelper` |
| `storage/` | `BaseStorageHelper` · `BunS3Helper` · `DiskHelper` · `MemoryStorageHelper` · `MinioHelper` |
| `tree/` | _(see source)_ |
| `uid/` | `OpaqueUidHelper` · `SnowflakeUidHelper` |
| `worker-thread/` | `AbstractWorkerBusHelper` · `AbstractWorkerHelper` · `AbstractWorkerMessageBusHandlerHelper` · `AbstractWorkerThreadHelper` · `BaseWorkerBusHelper` · `BaseWorkerHelper` · `BaseWorkerMessageBusHandlerHelper` · `BaseWorkerThreadHelper` · `WorkerPoolHelper` |

## Utilities

`date` · `module` · `parse` · `performance` · `promise` · `request` · `sleep`
