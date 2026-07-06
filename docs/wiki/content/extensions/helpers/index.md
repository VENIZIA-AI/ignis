# Helpers

Reusable classes and functions providing common functionality - designed for easy injection and configuration.

## Available Helpers

| Helper | Purpose | Key Features |
|--------|---------|--------------|
| [Common Types](./types/) | Utility types | Nullable, resolvers, class types |
| [Cron](./cron/) | Job scheduling | Cron expressions, task management |
| [Crypto](./crypto/) | Cryptographic operations | AES/RSA/ECDH encryption, key exchange, hashing |
| [Environment](./env/) | Environment variables | Centralized config access |
| [Error](./error/) | Error handling | `ApplicationError`, consistent responses |
| [Inversion](./inversion/) | Dependency injection | IoC container - separate package `@venizia/ignis-inversion` |
| [Logger](./logger/) | Logging | Winston-based, multiple transports, scopes |
| [Network](./network/) | Network requests | HTTP, TCP, UDP helpers |
| [Kafka](./kafka/) | Event streaming | Apache Kafka producer/consumer/admin/schema registry |
| [Queue](./queue/) | Message queues | BullMQ, MQTT support |
| [Redis](./redis/) | Redis operations | Single/cluster, key-value, hashes, JSON, pub/sub |
| [Socket.IO](./socket-io/) | Real-time communication | Socket.IO client/server helpers |
| [WebSocket](./websocket/) | Real-time communication | Bun native WebSocket server/emitter, Redis scaling |
| [Storage](./storage/) | File storage | In-memory, disk, MinIO, Bun S3 object storage |
| [Testing](./testing/) | Test utilities | Test plan runner, base test classes |
| [UID](./uid/) | Unique ID generation | Snowflake IDs, Base62 encoding |
| [Worker Thread](./worker-thread/) | Worker threads | Node.js worker management |

### Subpath Imports

Some helpers with optional peer dependencies are only available via subpath imports to ensure proper tree-shaking:

| Subpath | Peer Dependency | Description |
|---------|-----------------|-------------|
| `@venizia/ignis-helpers/kafka` | `@platformatic/kafka` | Kafka producer/consumer/admin/schema registry |
| `@venizia/ignis-helpers/bullmq` | `bullmq` | BullMQ job queue |
| `@venizia/ignis-helpers/mqtt` | `mqtt` | MQTT pub/sub client |
| `@venizia/ignis-helpers/socket-io` | `socket.io`, `socket.io-client` | Socket.IO server/client |
| `@venizia/ignis-helpers/minio` | `minio` | MinIO S3-compatible storage |
| `@venizia/ignis-helpers/bun-s3` | -- | Bun native S3 storage |
| `@venizia/ignis-helpers/cron` | `cron` | Cron job scheduling |
| `@venizia/ignis-helpers/axios` | `axios` | Axios HTTP client |

## See Also

- **Related Concepts:**
  - [Services](/guides/core-concepts/services) - Using helpers in service layer
  - [Controllers](/guides/core-concepts/rest-controllers) - Using helpers in controllers

- **References:**
  - [Utilities](/references/utilities/) - Pure utility functions
  - [Components](/extensions/components/) - Framework components
