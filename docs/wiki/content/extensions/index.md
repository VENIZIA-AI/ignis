# Extensions

Extensions are optional packages and built-in modules that add functionality on top of the IGNIS core framework. They are organized into two categories:

## Components

Components are self-contained feature modules that plug into your application via the `this.component()` registration method. Each component encapsulates its own bindings, controllers, and configuration.

| Component | Description | Key Features |
| :--- | :--- | :--- |
| [Authentication](./components/authentication/) | Identity verification | JWT, Basic, JWKS strategies |
| [Authorization](./components/authorization/) | Access control | Casbin-based RBAC, per-route policies |
| [Health Check](./components/health-check) | Liveness check | `GET /health`, `POST /health/ping` |
| [Mail](./components/mail/) | Email delivery | Nodemailer, Mailgun, queue support |
| [Request Tracker](./components/request-tracker) | Request tracing | `x-request-id` header, body parsing |
| [Socket.IO](./components/socket-io/) | Real-time (Socket.IO) | Redis adapter, room-based messaging |
| [Static Asset](./components/static-asset/) | File management | Upload/download, MinIO, Disk, BunS3 |
| [Swagger](./components/api-reference) | API docs | OpenAPI UI, Swagger UI, Scalar UI |
| [WebSocket](./components/websocket/) | Real-time (native) | Bun native WebSocket, encryption |

## Helpers

Helpers are standalone utility classes for infrastructure concerns. They extend `BaseHelper` for scoped logging and are typically used via dependency injection.

| Helper | Description | Peer Dependencies |
| :--- | :--- | :--- |
| [Cron](./helpers/cron/) | Scheduled tasks | `cron` |
| [Crypto](./helpers/crypto/) | Encryption/signing | Built-in |
| [Environment](./helpers/env/) | Env var management | Built-in |
| [Error](./helpers/error/) | Error utilities | Built-in |
| [Inversion](./helpers/inversion/) | DI container | Built-in |
| [Logger](./helpers/logger/) | Logging | `winston` |
| [Network](./helpers/network/) | HTTP/TCP/UDP clients | `axios` (optional) |
| [Kafka](./helpers/kafka/) | Kafka messaging | `@platformatic/kafka` |
| [Queue](./helpers/queue/) | Job queues | `bullmq`, `mqtt` (optional) |
| [Redis](./helpers/redis/) | Redis client | `ioredis` |
| [Socket.IO](./helpers/socket-io/) | Socket.IO server | `socket.io` |
| [Storage](./helpers/storage/) | File storage | `minio` (optional) |
| [Types](./helpers/types/) | Shared types | Built-in |
| [UID](./helpers/uid/) | Snowflake IDs | Built-in |
| [WebSocket](./helpers/websocket/) | WebSocket server | Built-in |
| [Worker Thread](./helpers/worker-thread/) | Worker pools | Built-in |

## See Also

- [Core API](/references/) -- Base framework abstractions
- [Guides](/guides/) -- Getting started and tutorials
