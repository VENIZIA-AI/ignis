# Helpers

Reusable classes and functions providing common functionality - designed for easy injection and configuration.

## Available Helpers

| Helper | Purpose | Key Features |
|--------|---------|--------------|
| [Common Types](./types.md) | Utility types | Nullable, resolvers, class types |
| [Cron](./cron.md) | Job scheduling | Cron expressions, task management |
| [Crypto](./crypto.md) | Cryptographic operations | Hashing, AES/RSA encryption/decryption |
| [Environment](./env.md) | Environment variables | Centralized config access |
| [Error](./error.md) | Error handling | `ApplicationError`, consistent responses |
| [Inversion](./inversion.md) | Dependency injection | DI container implementation |
| [Logger](./logger.md) | Logging | Winston-based, multiple transports, scopes |
| [Network](./network.md) | Network requests | HTTP, TCP, UDP helpers |
| [Queue](./queue.md) | Message queues | BullMQ, MQTT support |
| [Redis](./redis.md) | Redis operations | Single/cluster, key-value, hashes, JSON, pub/sub |
| [Socket.IO](./socket-io.md) | Real-time communication | Socket.IO client/server helpers |
| [Storage](./storage.md) | File storage | In-memory, Minio object storage |
| [Testing](./testing.md) | Test utilities | Test plan runner, base test classes |
| [UID](./uid.md) | Unique ID generation | Snowflake IDs, Base62 encoding |
| [Worker Thread](./worker-thread.md) | Worker threads | Node.js worker management |

## See Also

- **Related Concepts:**
  - [Services](/guides/core-concepts/services) - Using helpers in service layer
  - [Controllers](/guides/core-concepts/controllers) - Using helpers in controllers

- **References:**
  - [Utilities](/references/utilities/) - Pure utility functions
  - [Components](/references/components/) - Framework components

- **Best Practices:**
  - [Code Style Standards](/best-practices/code-style-standards) - Helper usage patterns
