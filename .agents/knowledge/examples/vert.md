---
type: Example
title: vert
description: The production-ready reference application exercising the full IGNIS stack - Postgres, authentication, scoped Casbin authorization, and repository correctness suites.
resource: examples/vert
tags: [examples, reference-app]
---

`vert` (`@nx/vert`) is the largest and most complete example in the repository - not a toy, a reference implementation exercising nearly every framework capability at once. Its entities (`Organization`, `User`, `Role`, `Permission`, `PolicyDefinition`, `Product`, `SaleChannel`, `SaleChannelProduct`, `Configuration`) model a multi-tenant commerce domain with scoped RBAC.

## What it demonstrates

- **Authentication** - JWKS-issuer JWT strategy plus Basic auth, both registered through `AuthenticationStrategyRegistry`, backed by a custom `AuthenticationService` and the built-in `AuthenticateComponent` (sign-in/sign-up/change-password wired via `TAuthenticationRestOptions`).
- **Scoped multi-tenant authorization** - `ScopedCasbinAdapter` over `PostgresDataSource`, the domain-scoped RBAC model (`CASBIN_RBAC_DOMAIN_SCOPED_MODEL`), a `domainResolver` that derives the request's organization from the authenticated user, an `alwaysAllowRoles` bypass, and a Redis-backed policy cache with a 5-minute TTL.
- **Repository correctness** - `src/services/tests/` is a battery of repository test suites (CRUD, transactions, row locking, JSON filters, JSON order-by, JSON update, array operators, comprehensive operators, default filters, field selection, hidden properties, inclusion, user audit, advanced filter queries), orchestrated by `RepositoryTestService`. Twelve of the fourteen suites live in their own folder. A thin runner `service.ts` owns the run order. One `<group>.cases.ts` file per case group holds a class extending `BaseTestCases`, built from the shared `ITestCaseContext`. An optional `support.ts` holds shared fixtures. The other two suites stay one file each - `field-selection-test.service.ts` and `json-orderby-test.service.ts` - small enough that splitting would not help. Only the row-locking suite runs today: `RowLockingTestService` is the one suite in `GeneratedArtifacts.services`, and `postConfigure()` resolves it from the container and calls `run()`, while `RepositoryTestService` - the class that injects and wires up every other suite - is referenced nowhere in `application.ts`, so the rest of the battery sits unexercised by the running app.
- **Health checks and API reference** - `HealthCheckComponent` at `/health-check` and `ApiReferenceComponent` for interactive docs, both turned on through the `artifacts` config in `beConfigs`, with their options coming from `PlatformComponent`'s `@provide()` methods - not the `preConfigure()` `this.component()` / `this.bind()` calls every other example uses.

## How to run it

```bash
bun install                      # from repo root - workspace package
bun run migrate:dev               # drizzle-kit migrate
bun run seed:authz                # scripts/seed-authz-test-data.ts
bun run server:dev                # NODE_ENV=development bun .
bash scripts/test-authorization.sh   # 25-case authorization test suite (needs jq, a running server)
```

`build` also runs `cp -r src/security dist/`, because the Casbin model file (`rbac_with_domains_deny.conf`) is a plain-text resource, not compiled TypeScript, and must be copied into `dist/` by hand.

## Notable / non-obvious

- Registration runs entirely through `beConfigs.artifacts` - `[GeneratedArtifacts, { components: [HealthCheckComponent, ApiReferenceComponent, AuthenticateComponent, AuthorizeComponent] }]`. No datasource, repository, or controller is wired by hand; `preConfigure()` only registers the authentication strategies.
- `src/generated/artifacts.ts` comes from `bun run generate:artifacts`, the `@venizia/ignis-boot` CLI that scans every `@datasource` / `@repository` / `@service` / `@controller` class under `src/`. `TestController` and `AuthorizationExampleController` are both live in it - `scripts/test-authorization.sh` drives the `/authz-example/*` routes that exist only because the latter is registered.
- `PlatformComponent`, listed in `GeneratedArtifacts.components`, supplies every framework option lazily through `@provide()` methods, so it needs no particular position in the boot order.
- Only the MinIO/static-asset block is commented out in `application.ts` - left in place as reference material rather than deleted.
- The Casbin policy cache's `keyFn` and `expiresIn` show the concrete shape of the cached-enforcer options that `CasbinAuthorizationEnforcer` expects.

## Related
- [Application lifecycle](/architecture/application-lifecycle.md)
- [Repository hierarchy](/architecture/repository-hierarchy.md)
- [core package](/packages/core-server.md)
