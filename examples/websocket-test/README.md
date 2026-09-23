# WebSocket test

IGNIS's WebSocket component - Bun-native, Redis-backed rooms behind a mandatory authentication
handshake, with no Socket.IO protocol involved.

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
| `src/application.ts` | Binds `REDIS_CONNECTION` + `AUTHENTICATE_HANDLER`, registers `WebSocketComponent`, and shuts the WebSocket server and Redis down on stop |
| `src/controllers/chat.controller.ts` | One REST route that pushes a message into the room every authenticated client joins |
| `src/index.ts` | Starts the server |
| `docker-compose.yml` | Redis - the only external dependency |

## Authentication

A client opens the WebSocket connection, then sends an `authenticate` message carrying its token.
The server checks it against `APP_ENV_AUTH_TOKEN` (`demo-token` by default) and either authenticates
the client - joining it to the default room `ws-default` - or closes the connection with code `4003`.
Every message on the wire is a JSON envelope: `{ "event": "...", "data": {...} }`.

## Events

| Event | Direction | Payload | Description |
|---|---|---|---|
| `authenticate` | client -> server | `{ token }` | Starts the handshake |
| `connected` | server -> client | `{ id, userId, time }` | Sent once authentication succeeds |
| `error` | server -> client | `{ message }` | Sent on failure, right before the socket closes with code `4003` |
| `chat:message` | server -> client | `{ message, time }` | Pushed to `ws-default` by `POST /chat/messages` |

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
# {"sent":true,"room":"ws-default"}
```

Any client connected with a valid token receives it on `chat:message` - no explicit room join
needed, since authentication already joined it to `ws-default`.

## Test it

```bash
docker compose up -d
bun test
docker compose down -v
```

The smoke test boots the same `Application` on a free port, connects raw `WebSocket` clients over
the wire, and checks: an authenticated client joins the default room and receives a message pushed
through `POST /chat/messages`; an unauthenticated client is closed with code `4003`. It is skipped,
not failed, when Redis is unreachable.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | The port the HTTP server listens on |
| `APP_ENV_REDIS_HOST` / `APP_ENV_REDIS_PORT` | `localhost` / `16381` | Where Redis is - `docker-compose.yml` maps it to host port `16381` |
| `APP_ENV_REDIS_PASSWORD` | unset | Redis auth, if the instance needs it |
| `APP_ENV_AUTH_TOKEN` | `demo-token` | The token every client must send in its `authenticate` message |

## Next

- [Socket.IO test](../socket-io-test) - the same shape over the Socket.IO protocol, with Node.js support
- [`vert`](../vert) - the production reference: authentication, authorization, transactions
