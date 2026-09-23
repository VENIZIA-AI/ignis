# Socket.IO test

IGNIS's Socket.IO component - Redis-backed rooms behind a mandatory authentication handshake,
running on Bun via `@socket.io/bun-engine`.

```bash
bun install
docker compose up -d
bun run start
```

The app listens on `http://localhost:3000` (set `PORT` to change it). Browse the API at
`http://localhost:3000/api/doc/explorer`.

## What it shows

| File | What it does |
|---|---|
| `src/application.ts` | Binds `REDIS_CONNECTION` + `AUTHENTICATE_HANDLER`, registers `SocketIOComponent`, and shuts the socket server and Redis down on stop |
| `src/controllers/chat.controller.ts` | One REST route that pushes a message into the room every authenticated client joins |
| `src/index.ts` | Starts the server |
| `docker-compose.yml` | Redis - the only external dependency |

## Authentication

A Socket.IO client sends its token as an `Authorization: Bearer <token>` header at connect time,
then emits `authenticate`. The server checks it against `APP_ENV_AUTH_TOKEN` (`demo-token` by
default) and either authenticates the client - joining it to the default rooms `io-default` and
`io-notification` - or emits `unauthenticated` and disconnects the socket.

## Events

| Event | Direction | Payload | Description |
|---|---|---|---|
| `authenticate` | client -> server | - | Starts the handshake, using the headers sent at connect time |
| `authenticated` | server -> client | `{ id, time }` | Sent once authentication succeeds |
| `unauthenticated` | server -> client | `{ message, time }` | Sent on failure, before the socket disconnects (see the note below) |
| `chat:message` | server -> client | `{ message, time }` | Pushed to `io-default` by `POST /chat/messages` |

## Endpoints

Every route sits under `/api`.

| Method | Path | Does |
|---|---|---|
| `GET` | `/health` | Liveness check |
| `POST` | `/chat/messages` | Pushes `{ message }` to the room every authenticated client joins |
| `GET` | `/doc/openapi.json` | The OpenAPI document |

## Try it

```bash
curl -s -X POST localhost:3000/api/chat/messages \
  -H 'content-type: application/json' -d '{"message":"hello lobby"}'
# {"sent":true,"room":"io-default"}
```

Any client connected with a valid token receives it on `chat:message` - no explicit room join
needed, since authentication already joined it to `io-default`.

## Test it

```bash
docker compose up -d
bun test
docker compose down -v
```

The smoke test boots the same `Application` on a free port, connects real Socket.IO clients over
the wire, and checks: an authenticated client joins the default room and receives a message pushed
through `POST /chat/messages`; an unauthenticated client gets disconnected. It is skipped, not
failed, when Redis is unreachable.

## A race in the framework's `unauthenticated` delivery

The server's rejection path (`registerAuthHandler` in `SocketIOServerHelper`) publishes
`unauthenticated` through the Redis emitter, then disconnects the socket right after via
`setImmediate` - without waiting for that publish to round-trip back through the adapter. The
disconnect wins every time measured, so the client never actually receives the `unauthenticated`
event; only the disconnect (`reason: 'io server disconnect'`) is reliable. This example's smoke test
asserts on the disconnect for that reason. Not fixed here - it is a framework behavior, out of scope
for an example.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | The port the HTTP server listens on |
| `APP_ENV_REDIS_HOST` / `APP_ENV_REDIS_PORT` | `localhost` / `16380` | Where Redis is - `docker-compose.yml` maps it to host port `16380` |
| `APP_ENV_REDIS_PASSWORD` | unset | Redis auth, if the instance needs it |
| `APP_ENV_AUTH_TOKEN` | `demo-token` | The token every client must send as `Bearer <token>` |

## Next

- [WebSocket test](../websocket-test) - the same shape on Bun's native WebSocket, no Socket.IO protocol
- [`vert`](../vert) - the production reference: authentication, authorization, transactions
