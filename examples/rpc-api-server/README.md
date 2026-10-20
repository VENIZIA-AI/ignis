# RPC API server

An IGNIS REST API with JWT sign-up and sign-in, CRUD routes that demand the token, and pages
rendered on the server with JSX. It runs on [PGlite](https://pglite.dev), so it needs no database
server. [`rpc-client-app`](../rpc-client-app) is the React client for it.

```bash
bun install
APP_ENV_JWT_SECRET=$(openssl rand -hex 32) bun run start
```

The app listens on `http://localhost:3000` (set `PORT` to change it). Open `http://localhost:3000/api`
for the JSX home page, or `http://localhost:3000/api/doc/explorer` for the API.

The secret signs every token. A new secret on each start signs every user out; put a fixed one in
`.env` to keep tokens valid across restarts.

## What it shows

| File | What it does |
|---|---|
| `src/application.ts` | Binds the JWT options, mounts the auth routes, registers the `jwt` strategy |
| `src/services/authentication.service.ts` | Sign-up, sign-in and change-password: hashes with `Bun.password`, signs with `JWSTokenService` |
| `src/controllers/configuration.controller.ts` | CRUD routes from `ControllerFactory.defineCrudController`, all behind `authenticate: { strategies: [Authentication.STRATEGY_JWT] }` |
| `src/controllers/view.controller.tsx` | Two HTML pages declared with `defineJSXRoute`; the pages live in `src/views` |
| `src/models/*.ts` | The `users` and `configurations` tables and their entities |
| `src/models/auth.schema.ts` | Response schemas of the auth routes, which type the generated client |
| `src/datasources/pglite.datasource.ts` | Opens PGlite and applies migrations |

## Endpoints

Every route sits under `/api`. A lock marks a route that needs `Authorization: Bearer <token>`.

| Method | Path | Does |
|---|---|---|
| `GET` | `/`, `/about` | JSX pages |
| `POST` | `/auth/sign-up` | Create a user: `{ username, credential }`, 8 characters or more each |
| `POST` | `/auth/sign-in` | Answer `{ token }` for a valid username and password |
| `GET` | `/auth/who-am-i` (lock) | The token's payload |
| `POST` | `/auth/change-password` (lock) | Change the signed-in user's password |
| `GET` | `/configurations` (lock) | List rows; takes a `filter` query |
| `POST` | `/configurations` (lock) | Create a row; `createdBy` is always the signed-in user, and the body cannot set it |
| `GET` | `/configurations/{id}` (lock) | One row |
| `PATCH` | `/configurations/{id}` (lock) | Update one row |
| `DELETE` | `/configurations/{id}` (lock) | Delete one row |
| `GET` | `/health` | Liveness check |
| `GET` | `/doc/openapi.json` | The OpenAPI document the client generates its types from |

`/configurations` also has `/count`, `/find-one` and the bulk `PATCH` / `DELETE` with `where`, as in
[`pglite-quickstart`](../pglite-quickstart).

## Sign in and call a protected route

Create a user, then sign in:

```bash
curl -s -X POST localhost:3000/api/auth/sign-up \
  -H 'content-type: application/json' -d '{"username":"first_user","credential":"first-password"}'
# {"id":"01a0cd...","username":"first_user"}

curl -s -X POST localhost:3000/api/auth/sign-in -H 'content-type: application/json' \
  -d '{"identifier":{"scheme":"username","value":"first_user"},"credential":{"scheme":"basic","value":"first-password"}}'
# {"token":"eyJhbGciOiJIUzI1NiJ9...."}
```

Send the token as a Bearer header. Without the header the route answers 401:

```bash
TOKEN=<the token>
curl -s -X POST localhost:3000/api/configurations -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"code":"THEME","group":"UI"}'
# {"count":1,"data":{"id":"01a0cd...","createdBy":"<your user id>","modifiedBy":"<your user id>","code":"THEME","group":"UI","description":null}}
```

## Test it

```bash
bun test
```

The smoke test boots the same `Application` on a free port with an in-memory database and its own
secret. It signs up, signs in, checks the 401, runs create - update - read - delete with the token,
and loads a JSX page.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `APP_ENV_JWT_SECRET` | none - required | Signs and verifies tokens. Never commit a real value |
| `APP_ENV_JWT_EXPIRES_IN` | `86400` | Token lifetime in seconds |
| `APP_ENV_PGLITE_DATA_DIR` | set to `./app_data/database/pgdata` by `bun run start` | Unset: an in-memory database |
| `APP_ENV_LOGGER_FOLDER_PATH` | set to `./app_data/logs` by `bun run start` | Unset: console logging only |
| `PORT` | `3000` | The port the server listens on |

`.env.example` lists them. To change the schema, edit `src/models/*.ts` and run
`bun run migrate:generate`; the app applies pending migrations at boot.

## Next

- [`rpc-client-app`](../rpc-client-app) - the React client with hooks generated from `/doc/openapi.json`
- [`vert`](../vert) - the production reference: JWKS, scoped Casbin authorization, transactions
