# Browser BFF

An IGNIS application running inside a browser Worker. The notes and comments controllers from
[`pglite-quickstart`](../pglite-quickstart) answer from PGlite stored in the browser, and no server
runs anywhere - the page reaches them over `postMessage`.

```bash
bun install
bun run dev
# open http://localhost:5173, create a note, then reload the page
```

The note is still there after the reload. The database lives in the origin private file system
(OPFS), under `ignis-browser-bff/`.

## What it shows

| File | What it does |
|---|---|
| `src/worker/models`, `repositories`, `controllers` | The `pglite-quickstart` files, with `@venizia/ignis-kernel` and `@venizia/ignis-connectors` in place of `@venizia/ignis` |
| `src/worker/datasources/pglite.datasource.ts` | Opens PGlite on OPFS and applies the migrations, inlined by `?raw` |
| `src/worker/application.ts` | `WorkerApplication` in place of `BaseApplication`; `discoverArtifacts: true` registers the imported classes |
| `src/worker/index.ts` | The Worker entry: `listen()` in place of `start()` |
| `src/bff.ts` | The page side: a `SharedBffTransport` that starts the Worker |
| `src/main.tsx` | `installBffFetch` routes `fetch('/api/...')` to the Worker, then renders the react-admin page |

The react-admin page uses the stock `DefaultRestDataProvider` pointed at `/api`. Nothing in it knows
a Worker answers. The page shows notes only; comments are reachable through the API below.

## Endpoints

The Worker answers these under `/api`. Health and the OpenAPI document are server components, so the
Worker has neither.

| Method | Path | Does |
|---|---|---|
| `GET` | `/notes`, `/comments` | List rows; takes a `filter` query |
| `GET` | `/notes/count?where={...}` | Count rows matching `where` (required; `{}` counts all) |
| `GET` | `/notes/find-one` | First row matching `filter` |
| `GET` | `/notes/{id}` | One row |
| `POST` | `/notes`, `/comments` | Create a row |
| `PATCH` | `/notes/{id}` | Update one row |
| `DELETE` | `/notes/{id}` | Delete one row |
| `PATCH` | `/notes?where={...}` | Update every row matching `where` |
| `DELETE` | `/notes?where={...}` | Delete every row matching `where` |

`/comments` has the same routes as `/notes`. CRUD routes answer `{ count, data }`; `/count` answers
`{ count }`.

## Read a note with its comments

There is no port to `curl`. Call the API from the page's devtools console instead - `fetch` there
already goes to the Worker:

```js
const post = (path, body) =>
  fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then(response => response.json());

const { data: note } = await post('/notes', { title: 'First note' });
await post('/comments', { noteId: note.id, text: 'A comment' });

const filter = encodeURIComponent(JSON.stringify({ include: [{ relation: 'comments' }] }));
await fetch(`/api/notes?filter=${filter}`).then(response => response.json());
// { count: 1, data: [{ id: '01a0cd7e-...', title: 'First note', ..., comments: [{ noteId: '01a0cd7e-...', text: 'A comment', ... }] }] }
```

## Test it

```bash
bun test
```

The smoke test starts `src/worker/index.ts` in a Bun Worker with an in-memory database, then calls
the controllers through `WorkerBffTransport` - the same envelope the page sends.

## Where the data goes

| Variable | Set by | Meaning |
|---|---|---|
| `APP_ENV_PGLITE_DATA_DIR` | `bun run dev` and `bun run build`, to `opfs-ahp://ignis-browser-bff` | Unset: an in-memory database that dies with the Worker |

Vite exposes the variable to the Worker as `import.meta.env.APP_ENV_PGLITE_DATA_DIR`; `bun test`
leaves it unset.

To clear the database, open devtools > Application > Storage and clear the site data.

## Change the schema

The models are the `pglite-quickstart` models. Generate the migration there, copy the new
`migration/NNNN_*.sql` file here, and add it to `MIGRATIONS` in
`src/worker/datasources/pglite.datasource.ts`.

## Many tabs, one database

PGlite on OPFS holds an access handle that is exclusive per origin. A second tab starting its own
Worker could not open the database.

`SharedBffTransport` fixes that. It elects one tab with the Web Locks API to run the Worker, and the
other tabs forward their requests to it over a `BroadcastChannel`. Close the leading tab and another
tab takes over, with no reload.

## Production build

```bash
bun run build
bun run preview
```

The preview runs on a different port, so it is a different origin: it does not see the database
the dev server wrote.

## Limits

- **Chrome is measured. Firefox is untested.** Desktop Safari caps OPFS access handles below what
  PGlite needs, so `opfs-ahp://` does not work there.
- **No sync.** The database starts empty and stays in the browser.
- `vite.config.ts` excludes `@electric-sql/pglite` from `optimizeDeps`: pre-bundling breaks how
  PGlite finds its WASM files.

## Next

- [`@venizia/ignis-worker`](../../packages/core-worker) - the Worker host and transports
- [PGlite quickstart](../pglite-quickstart) - the same controllers behind an HTTP server
