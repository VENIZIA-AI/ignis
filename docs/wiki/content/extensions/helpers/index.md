# Helpers

Standalone utility classes for infrastructure concerns - extend `BaseHelper` for scoped logging, and inject them wherever you need them.

Every peer dependency below is optional. You install one only when you use the helper that needs it.

| Helper | What it does | When you reach for it | Peer dependency |
|---|---|---|---|
| [Types](./types/) | Shared utility types | You need IGNIS's shared TypeScript utility types | None |
| [Cron](./cron/) | Scheduled tasks | You run code on a cron schedule | `cron` |
| [Crypto](./crypto/) | Encryption and signing | You hash, encrypt, or sign data | None |
| [Environment](./env/) | Env var management | You need typed, validated env var access | None |
| [Error](./error/) | Error utilities | You throw or handle an error | None |
| [Secrets & Vault](./secrets/) | Secrets and credentials | You read config or credentials from Vault or a vaulted `.env` | `node-vault` or `@dotenvx/dotenvx` |
| [Inversion](./inversion/) | DI container | You build custom bindings or providers | None |
| [Logger](./logger/) | Logging | You need scoped, leveled logging | `winston` or `pino` |
| [Network](./network/) | HTTP/TCP/UDP clients | You call another service over HTTP, TCP, or UDP | `axios`, for the Axios client only |
| [Kafka](./kafka/) | Kafka messaging | You publish or consume Kafka topics | `@platformatic/kafka` |
| [Queue](./queue/) | Job queues | You need background or delayed work | `bullmq` or `mqtt` |
| [Redis](./redis/) | Redis client | You need a Redis connection - cache, pub/sub, locks | None - `ioredis` ships with the package |
| [Socket.IO](./socket-io/) | Socket.IO server | You build a custom real-time feature | `socket.io` |
| [WebSocket](./websocket/) | WebSocket server | You build a custom real-time feature | None |
| [Storage](./storage/) | File storage | You read/write files to MinIO or disk directly | `minio`, for the MinIO backend only |
| [UID](./uid/) | Snowflake IDs | You need unique, sortable IDs | None |
| [Worker Thread](./worker-thread/) | Worker pools | You move CPU-heavy work off the main thread | None |

## Subpath imports

A helper with an optional peer dependency ships from its own subpath, so a bundler never pulls in a peer you don't use.

| Import from | Requires |
|---|---|
| `@venizia/ignis-helpers/cron` | `cron` |
| `@venizia/ignis-helpers/axios` | `axios` |
| `@venizia/ignis-helpers/kafka` | `@platformatic/kafka` |
| `@venizia/ignis-helpers/bullmq` | `bullmq` |
| `@venizia/ignis-helpers/mqtt` | `mqtt` |
| `@venizia/ignis-helpers/socket-io` | `socket.io`, `socket.io-client` |
| `@venizia/ignis-helpers/minio` | `minio` |
| `@venizia/ignis-helpers/bun-s3` | none - Bun native |
| `@venizia/ignis-helpers/hashicorp-vault` | `node-vault` |
| `@venizia/ignis-helpers/dotenv-vault` | `@dotenvx/dotenvx` |
| `@venizia/ignis-helpers/winston` | `winston` |
| `@venizia/ignis-helpers/pino` | `pino` |

`@venizia/ignis-helpers/common` is a subpath of a different kind. It isolates nothing - it exposes the
part of this package that is already browser-safe: `HTTP`, `TConstValue`, and the constant and
redaction tables. Import it when your code has to bundle for a browser.

The root barrel cannot: it re-exports every module, so reaching one constant through it pulls in 14
node builtins and 27 packages, `winston` and `ioredis` among them. A guard test bundles both entry
points for a browser target and fails if that ever changes.

```typescript
import { HTTP } from '@venizia/ignis-helpers/common';
```

## See also

- [Services](/guides/core-concepts/services) - using helpers in the service layer
- [Controllers](/guides/core-concepts/rest-controllers) - using helpers in controllers
- [Utilities](/references/utilities/) - pure utility functions
- [Components](/extensions/components/) - framework components
