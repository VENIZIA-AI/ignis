# IGNIS examples

Runnable projects for IGNIS. Each folder has its own README.

| Example | What it shows | Smoke test |
| :--- | :--- | :--- |
| [5-mins-qs](5-mins-qs/) | The single-file hello world | Its own `bun test` |
| [pglite-quickstart](pglite-quickstart/) | CRUD and a relation on PGlite - PostgreSQL in-process, no database server | Its own `bun test` |
| [sqlite-quickstart](sqlite-quickstart/) | The same CRUD and relation on SQLite through libsql | Its own `bun test` |
| [browser-bff](browser-bff/) | The same controllers answering from PGlite inside a browser Worker, with no server | Its own `bun test` (Bun Worker) |
| [grpc-test](grpc-test/) | gRPC (ConnectRPC) and REST controllers on one application | Its own `bun test` |
| [rpc-api-server](rpc-api-server/) | A REST API with JWT sign-up/sign-in, CRUD behind the token, and server-rendered JSX pages, on PGlite | Its own `bun test` |
| [rpc-client-app](rpc-client-app/) | The React client for `rpc-api-server`, with hooks generated from its OpenAPI document | none - client only |
| [typesense-search](typesense-search/) | A search API on Typesense alone, no PostgreSQL | Local (`docker compose up -d`) |
| [socket-io-test](socket-io-test/) | Socket.IO with Redis-backed rooms behind a mandatory authentication handshake | Local (docker) |
| [websocket-test](websocket-test/) | The same over Bun's native WebSocket, no Socket.IO protocol | Local (docker) |
| [vert](vert/) | The production reference: PostgreSQL CRUD, JWT/JWKS authentication, scoped Casbin authorization, transactions, relations, a generated artifact index | Local (docker) |
| [supabase](supabase/) | The postgres-js driver with Row Level Security driven by the request's user | Not done - blocked on a framework defect |

The examples run against the local packages, so build those first:

```bash
bun install && make core boot
cd examples/vert
docker compose up -d               # Postgres and Redis
cp .env.example .env
bun run migrate:dev && bun run server:dev
```

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
