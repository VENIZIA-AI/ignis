# vert - the IGNIS production reference

An IGNIS API on Postgres with everything a production service needs: JWT sign-in signed by your own
key pair (JWKS), scoped Casbin RBAC cached in Redis, CRUD routes from one factory call, transactions,
row locks, relations and file uploads.

```bash
docker compose up -d        # Postgres on 15434, Redis on 16382
cp .env.example .env
mkdir -p keys               # the ES256 key pair that signs tokens
[ -f keys/private.pem ] || {
  openssl ecparam -name prime256v1 -genkey -noout | openssl pkcs8 -topk8 -nocrypt -out keys/private.pem
  openssl ec -in keys/private.pem -pubout -out keys/public.pem
}
bun run migrate:dev
bun run server:dev
```

The app listens on `http://localhost:1190/v1/api`. Browse the API at
`http://localhost:1190/v1/api/doc/explorer`.

## Run it

1. Start Postgres and Redis:

   ```bash
   docker compose up -d
   ```

2. Copy the settings. Every value in `.env.example` matches `docker-compose.yml`:

   ```bash
   cp .env.example .env
   ```

3. Make the ES256 key pair that signs tokens (skipped when `keys/private.pem` exists; `keys/` is
   gitignored):

   ```bash
   mkdir -p keys
   [ -f keys/private.pem ] || {
     openssl ecparam -name prime256v1 -genkey -noout | openssl pkcs8 -topk8 -nocrypt -out keys/private.pem
     openssl ec -in keys/private.pem -pubout -out keys/public.pem
   }
   ```

4. Create the tables, then start the server:

   ```bash
   bun run migrate:dev
   bun run server:dev
   ```

To stop the services and drop their data, run `docker compose down -v`.

## Feature map

| Feature | Where to look |
|---|---|
| Models | `src/models/entities/*.model.ts` - a table first, then `ModelFactory.defineEntity({ table, relations })` |
| Relations | `sale-channel-product.model.ts`: `one(productTable)` reads its columns off the foreign key. `configuration.model.ts`: `modifier` names its columns, because `modified_by` has no foreign key |
| Hidden columns, default filter | `user.model.ts` (`hiddenProperties`), `product.model.ts` (`defaultFilter`) |
| Repositories | `src/repositories/*.repository.ts` - `@repository({ model, dataSource })` over an empty class, plus custom queries |
| CRUD routes | `src/controllers/configuration.controller.ts` - `ControllerFactory.defineCrudController` with per-route authentication, a custom create body, and two overridden handlers |
| Hand-written routes | `src/controllers/test/` (`defineRoute`, `bindRoute`, `@get`, `@post`) and `src/controllers/authorization-example/` |
| Sign-in, sign-up, change password | `src/services/authentication.service.ts` behind the framework's `/auth` routes |
| JWKS, Basic auth, upload and health options | `src/components/platform.component.ts` - one `@provide` method per option key |
| Scoped Casbin RBAC | `application.ts` (`registerAuthorizationEnforcer`) and `authorizeOptions` in `platform.component.ts`: the domain is the user's organization |
| File uploads | `/assets` (writes a MetaLink row per upload) and `/resources`, both on disk under `app_data/` |
| Transactions and row locks | `src/services/tests/transaction/` and `src/services/tests/row-locking/` |
| Registration | `src/generated/artifacts.ts`, passed as `artifacts` in `application.ts`. After adding a decorated class, run `bun run generate:artifacts`; `bun run lint` fails while the file is stale |

## Endpoints

Every route sits under `/v1/api`.

| Method | Path | Authentication |
|---|---|---|
| `GET` | `/health-check` | none |
| `POST` | `/auth/sign-up`, `/auth/sign-in` | none |
| `POST` | `/auth/change-password` | JWT |
| `GET` | `/auth/who-am-i` | JWT |
| `GET` | `/auth/me` | JWT; answers "not supported", because this service implements no `getUserInformation` |
| `GET` | `/configurations/count` | none |
| `GET` | `/configurations`, `/configurations/{id}`, `/configurations/find-one` | JWT or Basic |
| `POST` | `/configurations` | Basic |
| `PATCH` | `/configurations/{id}`, `/configurations` | JWT or Basic |
| `DELETE` | `/configurations/{id}`, `/configurations?where={...}` | JWT |
| `GET` | `/authz-example/public` | none |
| `GET` | `/authz-example/profile` | JWT |
| `GET` | `/authz-example/configurations` | JWT + Casbin `read` on `configuration` |
| `POST` | `/authz-example/users` | JWT + Casbin `create` on `user` |
| `GET` | `/authz-example/admin/dashboard` | JWT + role `999_super-admin` or `900_admin` |
| `GET`, `POST` | `/test/1` to `/test/5` | route examples, off in production |
| `GET`, `POST`, `DELETE` | `/assets/...`, `/resources/...` | upload, list, download, delete |
| `GET` | `/doc/openapi.json`, `/doc/explorer` | none |

## Sign in and call a route

```bash
curl -s -X POST localhost:1190/v1/api/auth/sign-up \
  -H 'content-type: application/json' -d '{"username":"alice","credential":"alice-password"}'

curl -s -X POST localhost:1190/v1/api/auth/sign-in \
  -H 'content-type: application/json' \
  -d '{"identifier":{"scheme":"username","value":"alice"},"credential":{"scheme":"basic","value":"alice-password"}}'
# {"userId":"01a0...","roles":[],"token":{"value":"eyJ...","type":"Bearer"}}

curl -s localhost:1190/v1/api/configurations -H 'authorization: Bearer <the token>'
```

Alice has no role yet, so `GET /authz-example/configurations` answers `403`. A role and its grants
are rows in `PolicyDefinition`; `scripts/seed-authz-test-data.ts` and
`scripts/seed-user-policies.ts` show how to write them.

> [!WARNING]
> `seed-authz-test-data.ts` (run by `bun run seed:authz` and `bun run test:authz`) first deletes every row
> in `PolicyDefinition`, `Permission`, `Role` and `Organization`. The seed scripts set
> `NODE_ENV=development`, so a `.env.development` overrides `.env`: check which database it points at first.

## Test it

| Command | What it runs | Needs |
|---|---|---|
| `bun test` | `src/__tests__/smoke.test.ts`: boots the app on a free port, signs in, creates and reads a configuration, and checks Casbin answers `200` for a granted user and `403` for another. Skips when Postgres or Redis is down | `docker compose up -d` |
| `bun run test:authz` | `scripts/test-authorization.sh`: 25 authorization cases over HTTP, against a running server | a running `server:dev`, `jq` |
| `APP_ENV_RUN_REPOSITORY_TESTS=true bun run server:dev` | The repository suites in `src/services/tests` (listed in `TEST_CASES.md`) at boot; each case logs `PASSED` or `FAILED` | `docker compose up -d`, `migrate:dev` |

The smoke test applies the migrations itself and signs with a key pair it makes for the run, so it
needs no `.env` and no `keys/`.

## Change the schema

Edit a model in `src/models/entities/`, then generate and apply a migration:

```bash
bun run migrate:generate   # writes migration/NNNN_*.sql from src/migration-schema.ts
bun run migrate:dev
```

`src/migration-schema.ts` lists every table drizzle-kit reads, including the static-asset
component's `MetaLink` table.

## Next

- [PGlite quickstart](../pglite-quickstart) - the same models, repositories and CRUD factory in one small app
