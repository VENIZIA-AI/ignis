# grpc-test

The reference gRPC application of IGNIS. One controller serves a notes service over Connect, gRPC-Web and native gRPC,
with all four call kinds, JWT authentication, a role policy, a row scope on the database and a graceful shutdown.

## Run it

From the repository root, once: `bun install && make build`. Then, in `examples/grpc-test`:

```bash
cp .env.example .env
bun run server:dev
```

`server:dev` bundles the browser page and starts two servers on `127.0.0.1`. The database is PGlite in memory, so it
needs no Postgres and starts empty each time.

| Port  | Serves                  | Calls                               | Address of the service           |
| ----- | ----------------------- | ----------------------------------- | -------------------------------- |
| 3000  | Connect, gRPC-Web, REST | unary, server stream, client stream | `http://127.0.0.1:3000/api/grpc` |
| 50051 | native gRPC over HTTP/2 | all four, bidirectional included    | `127.0.0.1:50051`, no path       |

Two demo users sign in with the password `APP_ENV_DEMO_PASSWORD` from your `.env`:

| User    | Role     | May                                  |
| ------- | -------- | ------------------------------------ |
| `alice` | `editor` | read and create notes                |
| `bob`   | `viewer` | read notes; owns one note, `Welcome` |

In a second terminal:

```bash
bun run client:connect              # Connect protocol, application port
bun run client:connect --grpc-web   # gRPC-Web, application port
bun run client:connect --native     # native gRPC, bidi included
bun run client:grpc-js              # @grpc/grpc-js, native port
```

Open <http://127.0.0.1:3000/demo> for the browser client: sign in as `alice`, then watch the notes (server stream) or get
one by id (unary). A new note of hers appears while you watch: run a client above to make one.

Without any client library, Connect speaks JSON over HTTP/1.1:

```bash
curl -s -X POST http://127.0.0.1:3000/api/grpc/notes.v1.NotesService/SignIn \
  -H 'content-type: application/json' -d '{"username":"bob","password":"example-only-password"}'
```

## The service

[`proto/notes/v1/notes.proto`](proto/notes/v1/notes.proto) is the contract.

| RPC           | Kind          | Needs            | Shows                                                             |
| ------------- | ------------- | ---------------- | ----------------------------------------------------------------- |
| `SignIn`      | unary         | nothing (public) | issuing a JWT                                                     |
| `GetNote`     | unary         | `note:read`      | request and response headers, `not_found`                         |
| `WatchNotes`  | server stream | `note:read`      | `rpc.signal`, a trailer, a followed stream                        |
| `ImportNotes` | client stream | `note:create`    | validating a stream, one write for all                            |
| `SyncNotes`   | bidirectional | `note:create`    | one answer per message, a refused item that does not end the call |

## Where things are

| File                                                                                 | What it does                                                                 |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| [`src/controllers/notes.controller.ts`](src/controllers/notes.controller.ts)         | The four call kinds: validate, call a service, build the answer              |
| [`src/controllers/note.schemas.ts`](src/controllers/note.schemas.ts)                 | Zod rules for what a client sends                                            |
| [`src/services/note.service.ts`](src/services/note.service.ts)                       | The use cases and the followed streams                                       |
| [`src/services/auth.service.ts`](src/services/auth.service.ts)                       | Password check and token                                                     |
| [`src/security/role-policy.enforcer.ts`](src/security/role-policy.enforcer.ts)       | Which role may do what                                                       |
| [`src/models/note.model.ts`](src/models/note.model.ts)                               | The table and its row scope                                                  |
| [`src/application.ts`](src/application.ts)                                           | Authentication, authorization, the gRPC options, the seed, the shutdown hook |
| [`src/common/grpc-native-settings.ts`](src/common/grpc-native-settings.ts)           | The native port from the environment: TLS, stream limit, shutdown timeout    |
| [`src/interceptors/rpc-log.interceptor.ts`](src/interceptors/rpc-log.interceptor.ts) | One log line per RPC                                                         |
| [`clients/`](clients)                                                                | connect-es, grpc-js and browser clients                                      |

## Take these into your project

| Topic                    | Do this                                                                                | Why                                                                          |
| ------------------------ | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Transport                | `transports: [REST, GRPC]` in the application config                                   | without `GRPC` the controller is never mounted                               |
| Auth                     | `authenticate` and `authorize` on each RPC; leave them off only for a public one       | an RPC with neither is open to everyone                                      |
| Deny by default          | `defaultDecision: 'deny'` in the authorize options                                     | a permission nobody listed is refused                                        |
| Ownership                | put `access.resolve` on the model                                                      | every query and write is limited to the caller, a forgotten `where` included |
| Boot work on scoped data | `Execution.run({ mode: SYSTEM, reason })`                                              | nobody is signed in, so the scope would refuse the write                     |
| Validation               | check content in the controller                                                        | Protobuf checks types only; an empty string is the default                   |
| Errors                   | `getError({ statusCode })`                                                             | a 4xx keeps its message and maps to a gRPC code; a 5xx is hidden             |
| Cancel and deadline      | pass `rpc.signal` to anything that waits                                               | the framework does not stop your handler                                     |
| Deadlines                | set one on every client call                                                           | a signed-in call has no idle limit on the server                             |
| Limits                   | `limits.messageSize`, `native.limits.concurrentStreams`, and your own count per stream | a stream has no total size limit on the native port                          |
| Shutdown                 | end long streams in a post-stop hook registered in `preConfigure`                      | on the application port `stop()` waits for open streams                      |

Errors this service answers:

| Cause                                    | Thrown         | The client reads     |
| ---------------------------------------- | -------------- | -------------------- |
| No token, a bad token, a wrong password  | 401            | `unauthenticated`    |
| The role may not                         | 403            | `permission_denied`  |
| Invalid input                            | 400            | `invalid_argument`   |
| A note that is absent, or another user's | 404            | `not_found`          |
| A followed stream read too slowly        | 429            | `resource_exhausted` |
| The server stops                         | `ConnectError` | `unavailable`        |

### Request id and logs

Each answer carries `x-request-id`; send your own and it is kept. The interceptor logs the RPC, its outcome, its
duration and that id. Set `APP_ENV_LOGGER_FOLDER_PATH` to also write log files (`server:dev` writes `app_data/logs`).

### Shutdown

`installShutdownSignals` in [`src/index.ts`](src/index.ts) handles `SIGTERM` and `SIGINT`: followed streams end with
`unavailable`, the native port waits `APP_ENV_GRPC_SHUTDOWN_TIMEOUT_MS` for the calls in flight, then both servers and
the database close.

## TLS on the native port

```bash
bun run certs                          # writes certs/server.crt and certs/server.key (gitignored, 30 days)
APP_ENV_GRPC_TLS=true bun run server:dev
bun run client:connect --native --tls
bun run client:grpc-js --tls
```

The certificate is self-signed, for this machine only. Without TLS the port speaks clear text (h2c): keep it on
loopback, or behind a mesh or a TLS-terminating proxy. The application port has no TLS here; put it behind a proxy.

## grpcurl

Install [grpcurl](https://github.com/fullstorydev/grpcurl), or name the binary in `GRPCURL`. The server has no
reflection, so the script passes the `.proto`.

```bash
bun run client:grpcurl                 # server in clear text
bun run client:grpcurl --tls           # server with APP_ENV_GRPC_TLS=true
```

## Test it

```bash
bun run test
```

[`src/__tests__/notes.e2e.test.ts`](src/__tests__/notes.e2e.test.ts) boots the application on free ports and covers
Connect, gRPC-Web and native gRPC: each call kind, refusal and permission, the row scope, deadline, cancel, headers,
trailers, the three Node and browser client classes, and shutdown. It does not cover TLS or grpcurl.

```bash
bun run typecheck
bun run lint
```

## Change the contract

```bash
bun run proto:lint
bun run proto:gen                      # writes src/generated, which is committed
```

After a change to a model, `bun run migrate:generate` writes the next SQL file in `migration/`; the application applies
it at start.

## Settings

All of them are in [`.env.example`](.env.example). The two secrets there are examples: replace them anywhere but on your
own machine.

## Limits of this example

| Limit                                              | In a real service                                            |
| -------------------------------------------------- | ------------------------------------------------------------ |
| Followed streams are held in one process           | share new notes between instances (Redis, Postgres `LISTEN`) |
| `WatchNotes` lists at most 100 notes               | page through them                                            |
| The role policy is in code, users are seeded       | `CasbinAuthorizationEnforcer` and your own user store        |
| Sign-in has no rate limit                          | add one                                                      |
| Tokens cannot be revoked                           | short lifetimes, or a session store                          |
| No reflection or health service on the native port | REST `/api/health` answers on the application port           |
| No `compile` script                                | a compiled binary does not carry PGlite's data file          |

## Next

- [gRPC controllers guide](../../docs/wiki/content/guides/core-concepts/grpc-controllers.md)
- [`rpc-api-server`](../rpc-api-server) - REST with sign-up and sign-in on the same stack

---

<p align="center">
  <a href="https://venizia.ai">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://venizia.ai/assets/logo-white.svg">
      <img src="https://venizia.ai/assets/logo.svg" alt="VENIZIA" height="28">
    </picture>
  </a>
  <br>
  <sub>IGNIS is built and maintained by <a href="https://venizia.ai">VENIZIA</a>.</sub>
</p>
