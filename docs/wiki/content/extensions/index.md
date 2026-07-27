# Extensions

Optional pieces you add on top of IGNIS core: components you register once, helpers you inject where you need them.

## Components

| Component | What it does | When you reach for it |
|---|---|---|
| [Authentication](./components/authentication/) | Verifies who is calling - JWT, Basic, JWKS strategies | A route needs to know who the caller is |
| [Authorization](./components/authorization/) | Casbin-based RBAC, per-route policies | A route needs a permission check beyond authentication |
| [Health Check](./components/health-check) | `GET /health` and `POST /health/ping` | A load balancer or Kubernetes needs a liveness probe |
| [Mail](./components/mail/) | Sends email via Nodemailer, Mailgun, or a queue | The app sends transactional or templated email |
| [Request Tracker](./components/request-tracker) | Tags every request with an ID, logs method/path/timing | Always on - registered automatically, nothing to configure |
| [Socket.IO](./components/socket-io/) | Real-time messaging over Socket.IO, Redis adapter | Clients need rooms or Socket.IO-specific features |
| [Static Asset](./components/static-asset/) | Upload/download files - MinIO, disk, or Bun S3 | The app stores or serves user-uploaded files |
| [API Reference](./components/api-reference) | Interactive OpenAPI docs, Scalar UI by default | You want a browsable UI for your REST routes |
| [WebSocket](./components/websocket/) | Native Bun WebSocket, Redis pub/sub, heartbeat | Clients need a raw WebSocket without Socket.IO |

## Helpers

Every peer dependency below is optional. You install one only when you use the helper that needs it.

| Helper | What it does | When you reach for it | Peer dependency |
|---|---|---|---|
| [Cron](./helpers/cron/) | Scheduled tasks | You run code on a cron schedule | `cron` |
| [Crypto](./helpers/crypto/) | Encryption and signing | You hash, encrypt, or sign data | None |
| [Environment](./helpers/env/) | Env var management | You need typed, validated env var access | None |
| [Error](./helpers/error/) | Error utilities | You throw or handle an error | None |
| [Inversion](./helpers/inversion/) | DI container | You build custom bindings or providers | None |
| [Logger](./helpers/logger/) | Logging | You need scoped, leveled logging | `winston` or `pino` |
| [Network](./helpers/network/) | HTTP/TCP/UDP clients | You call another service over HTTP, TCP, or UDP | `axios`, for the Axios client only |
| [Kafka](./helpers/kafka/) | Kafka messaging | You publish or consume Kafka topics | `@platformatic/kafka` |
| [Queue](./helpers/queue/) | Job queues | You need background or delayed work | `bullmq` or `mqtt` |
| [Redis](./helpers/redis/) | Redis client | You need a Redis connection - cache, pub/sub, locks | None - `ioredis` ships with the package |
| [Secrets](./helpers/secrets/) | Secret loading and rotation | You read secrets from Vault, dotenv, or the environment | `node-vault` or `@dotenvx/dotenvx` |
| [Socket.IO](./helpers/socket-io/) | Socket.IO server | You build a custom real-time feature | `socket.io` |
| [Storage](./helpers/storage/) | File storage | You read/write files to MinIO or disk directly | `minio`, for the MinIO backend only |
| [Types](./helpers/types/) | Shared types | You need IGNIS's shared TypeScript utility types | None |
| [UID](./helpers/uid/) | Snowflake IDs | You need unique, sortable IDs | None |
| [WebSocket](./helpers/websocket/) | WebSocket server | You build a custom real-time feature | None |
| [Worker Thread](./helpers/worker-thread/) | Worker pools | You move CPU-heavy work off the main thread | None |

## See also

- [Core API](/references/) - Base framework abstractions
- [Guides](/guides/) - Getting started and tutorials
