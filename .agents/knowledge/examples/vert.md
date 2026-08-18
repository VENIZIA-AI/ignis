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
- **Repository correctness** - `src/services/tests/` is a battery of `*-test.service.ts` files (transactions, row locking, JSON filters, JSON order-by, JSON update, array operators, default filters, field selection, hidden properties, inclusion, user audit, advanced filter queries), orchestrated by `RepositoryTestService`. Only the row-locking suite runs today: `postConfigure()` registers and invokes `RowLockingTestService.run()` directly, while `RepositoryTestService` - the class that injects and wires up every other suite - is referenced nowhere in `application.ts`, so the rest of the battery sits unexercised by the running app.
- **Health checks and API reference** - `HealthCheckComponent` at `/health-check` and `ApiReferenceComponent` for interactive docs, registered the same way every other example registers them.

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

- `preConfigure()` registers datasources, repositories, and controllers manually with an explicit comment: "booter can't discover .ts files when running from source" - the convention-based boot system in `@venizia/ignis-boot` is deliberately bypassed here in favor of explicit wiring, same as every other example.
- Several controllers (`TestController`, `AuthorizationExampleController`) and the MinIO/static-asset component block are present in source but commented out in `application.ts` - left in place as reference material rather than deleted.
- The Casbin policy cache's `keyFn` and `expiresIn` show the concrete shape of the cached-enforcer options that `CasbinAuthorizationEnforcer` expects.

## Related
- [Application lifecycle](/architecture/application-lifecycle.md)
- [Repository hierarchy](/architecture/repository-hierarchy.md)
- [core package](/packages/core-server.md)
