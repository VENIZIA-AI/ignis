---
type: Example
title: vert
description: The production-ready reference application - JWKS-signed JWT, scoped Casbin RBAC cached in Redis, CRUD from ControllerFactory, transactions, row locks, relations and file uploads, on a generated artifact index.
resource: examples/vert
tags: [examples, reference-app]
---

`vert` is the largest and most complete example in the repository - not a toy, a reference
implementation exercising nearly every framework capability at once, on real Postgres and Redis.
Its models (`src/models/entities/*.model.ts`) are `ModelFactory.defineEntity({ table, relations })`
over a `pgTable` defined first, the same shape every other example uses; `vert` is where relations,
hidden columns, a default filter and per-route authentication all show up together.

## What it demonstrates

- **JWT signed by your own key pair** - `JWKSIssuerAuthenticationStrategy` plus
  `BasicAuthenticationStrategy`, both registered through `AuthenticationStrategyRegistry` in
  `preConfigure()`; `src/services/authentication.service.ts` handles sign-up, sign-in and
  change-password behind the framework's `/auth` routes.
- **Scoped multi-tenant Casbin RBAC** - `registerAuthorizationEnforcer()` builds a
  `ScopedCasbinAdapter` over `PostgresDataSource` (`PolicyDefinition`, `Permission`, `Role`,
  `Organization` as the domain type) and registers a `CasbinAuthorizationEnforcer` with a
  Redis-backed policy cache (5-minute TTL, keyed per user). `src/controllers/authorization-example/`
  is the controller these routes are drawn from.
- **CRUD from one factory call, with overrides** - `src/controllers/configuration.controller.ts`
  calls `ControllerFactory.defineCrudController` with per-route `authenticate`, a custom create
  body, then overrides `create` and `deleteById` to add logging around the generated handler.
- **Relations two ways** - `sale-channel-product.model.ts`: `one(productTable)` reads its columns
  off the foreign key. `configuration.model.ts`: `modifier` names its columns by hand, because
  `modified_by` has no foreign key.
- **Transactions and row locks** - `src/services/tests/transaction/` and
  `src/services/tests/row-locking/` are repository correctness suites, run only on request: set
  `APP_ENV_RUN_REPOSITORY_TESTS=true` and start the server (refused outright in production), and
  `postConfigure()` resolves `RepositoryTestService` and calls `runAllTests()`.
- **Registration is a generated static index, not `discoverArtifacts`** - `src/generated/artifacts.ts`
  (from `bun run generate:artifacts`, the `ignis-artifacts` CLI) is passed as `artifacts` in
  `beConfigs`. `bun run lint` runs `check:artifacts` first and fails while the file is stale relative
  to the decorated classes on disk.
- **File uploads** - `/assets` (writes a MetaLink row per upload) and `/resources`, both on disk
  under `app_data/`.

## How to run it

```bash
docker compose up -d        # Postgres on 15434, Redis on 16382
cp .env.example .env
mkdir -p keys && openssl ecparam -name prime256v1 -genkey -noout | openssl pkcs8 -topk8 -nocrypt -out keys/private.pem
openssl ec -in keys/private.pem -pubout -out keys/public.pem
bun run migrate:dev
bun run server:dev            # http://localhost:1190/v1/api, explorer at /v1/api/doc/explorer
bun test                       # smoke test: applies migrations and signs its own key pair, needs docker
```

`examples/vert/scripts/seed-authz-test-data.ts` (`bun run seed:authz`) and
`examples/vert/scripts/test-authorization.sh` (`bun run test:authz`, needs `jq` and a running
server) exercise 25 authorization cases against `/authz-example/*`. The seed script first deletes
every row in `PolicyDefinition`, `Permission`, `Role` and `Organization`, and runs with
`NODE_ENV=development` - check which database `.env.development` points at before running it.

## Notable / non-obvious

- A fresh Alice has no role: `GET /authz-example/configurations` answers `403` until a
  `PolicyDefinition` row grants one.
- `GET /auth/me` answers "not supported" - this service implements no `getUserInformation`; use
  `GET /auth/who-am-i` for the token's payload instead.
- `src/migration-schema.ts` lists every table drizzle-kit reads, including the static-asset
  component's `MetaLink` table - a table missing there is a table `migrate:generate` never sees.
- This example needs `docker compose up -d` first; it is not in the root Makefile's
  `EXAMPLES_SMOKE` list, so its `bun test` runs locally, not in CI.

## Related
- [pglite-quickstart](/examples/pglite-quickstart.md)
- [Application lifecycle](/architecture/application-lifecycle.md)
- [Repository hierarchy](/architecture/repository-hierarchy.md)
- [core package](/packages/core-server.md)
