# 5-minute quickstart

The IGNIS hello world in one file: one controller, one route and generated API docs. `src/index.ts`
is the code from the [5-Minute Quickstart](../../docs/wiki/content/guides/get-started/5-minute-quickstart.md)
page, word for word.

```bash
bun install
bun run start
```

The app listens on `http://localhost:3000` (set `PORT` to change it).

## Endpoints

Every route sits under `/api`.

| Method | Path | Does |
|---|---|---|
| `GET` | `/hello` | Answers `{"message":"Hello from IGNIS!"}` |
| `GET` | `/doc/explorer` | The interactive API reference |

## Test it

```bash
bun test
```

The smoke test runs `src/index.ts` as the page tells you to, on a free port, and calls both
endpoints.

## Next

- Add a database: [`pglite-quickstart`](../pglite-quickstart) - CRUD and a relation with no
  database server.
