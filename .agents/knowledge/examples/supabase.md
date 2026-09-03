---
type: Example
title: supabase
description: A Postgres example on the postgres-js driver proving Supabase is a driver and identity convention, not a separate connector, with Row Level Security enforced by the database.
resource: examples/supabase
tags: [examples, postgres, supabase]
---

`supabase-example` runs on `postgres-js` (`SupabaseDataSource`) with no `pg` anywhere in the directory, deliberately proving the connector-versus-driver distinction: Supabase is unmodified PostgreSQL, so it varies the driver, not the SQL dialect. The repository, filter syntax, transactions, and controllers are otherwise identical to `examples/vert`.

## What it demonstrates

- **The driver seam is real** - `src/datasources/supabase.datasource.ts` declares `@datasource({ driver: PostgresJsDriver })` and its `configure()` builds only the client, `this.client = postgres(url, buildPostgresJsOptions({ mode, max }))`. The framework constructs the `PostgresJsDriver` over that client and its pooled connector lazily on first use, through its own internal `useDriver()` call - no such call appears in the example. `getClient()` is typed as postgres-js's `Sql`, not `pg.Pool`.
- **Pooler mode as a correctness switch** - `buildPostgresJsOptions({ mode })` sets `prepare: false` only for `TRANSACTION` mode, because Supavisor rebinds the backend per transaction and a server-side prepared statement from one backend won't exist on the next.
- **RLS lives in the model** - `pgPolicy` on the `note` entity, using re-exported `authenticatedRole`/`authUid`; drizzle-kit generates the policies and `ENABLE ROW LEVEL SECURITY`.
- **`withAuthContext` makes `auth.uid()` resolve** - every `NoteService` call opens a transaction and sets the caller's claims with `SET LOCAL`/`set_config(..., true)` inside it, which is transaction-scoped and therefore pooler-safe (a plain `SET` would leak identity to the next connection borrower).
- **Ownership cannot be forged** - `ownerId` defaults to `auth.uid()` at the table level; the app never sends an owner in the request body.
- **The control group** - `GET /notes/unscoped` runs the identical repository call with no auth context and returns every row, isolating `withAuthContext` as the only variable.
- **Claims-shape reconciliation** - IGNIS's `IJWTTokenPayload` uses `userId`/`roles`; GoTrue issues `sub`/`role`. The controller's `getClaims` reconciles them at the boundary rather than assuming they coincide.
- **Grants are hand-written** - drizzle-kit emits the table and policies but not the schema or `GRANT`s the policies depend on; `migration/0000_purple_calypso.sql` adds those by hand, because a policy is only consulted after the role clears table privileges.

## How to run it

```bash
bun install
bun run migrate:dev      # drizzle-kit migrate - schema, table, policies, grants
bun run seed              # give two real auth.users rows some notes to own
bun run server:dev
```

Then, per the README's curl walkthrough: sign in via GoTrue (`POST /api/auth/sign-in`), call `GET /api/notes` (scoped, only the caller's notes) versus `GET /api/notes/unscoped` (every row, same repository, same table).

## Notable / non-obvious

- `AuthenticateComponent` here uses `JOSEStandards.JWS` with `JWSAuthenticationStrategy`, not the JWKS-issuer strategy `vert` uses - because GoTrue signs HS256 tokens with a shared secret, IGNIS only needs the secret, not a JWKS endpoint.
- `preConfigure()` explicitly comments that manual registration is used because "the booter cannot discover .ts files when running from source" - the same convention every other example follows.

## Related
- [vert](/examples/vert.md)
- [DataSource hierarchy](/architecture/datasource-hierarchy.md)
- [Repository hierarchy](/architecture/repository-hierarchy.md)
