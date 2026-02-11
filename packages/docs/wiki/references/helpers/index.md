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
| [Inversion](./inversion/) | Dependency injection | DI container implementation |
| [Logger](./logger/) | Logging | Winston-based, multiple transports, scopes |
| [Network](./network/) | Network requests | HTTP, TCP, UDP helpers |
| [Queue](./queue/) | Message queues | BullMQ, MQTT support |
| [Redis](./redis/) | Redis operations | Single/cluster, key-value, hashes, JSON, pub/sub |
| [Socket.IO](./socket-io/) | Real-time communication | Socket.IO client/server helpers |
| [WebSocket](./websocket/) | Real-time communication | Bun native WebSocket server/emitter, Redis scaling |
| [Storage](./storage/) | File storage | In-memory, Minio object storage |
| [Testing](./testing/) | Test utilities | Test plan runner, base test classes |
| [UID](./uid/) | Unique ID generation | Snowflake IDs, Base62 encoding |
| [Worker Thread](./worker-thread/) | Worker threads | Node.js worker management |

## See Also

- **Related Concepts:**
  - [Services](/guides/core-concepts/services) - Using helpers in service layer
  - [Controllers](/guides/core-concepts/controllers) - Using helpers in controllers

- **References:**
  - [Utilities](/references/utilities/) - Pure utility functions
  - [Components](/references/components/) - Framework components

- **Best Practices:**
  - [Code Style Standards](/best-practices/code-style-standards/) - Helper usage patterns
