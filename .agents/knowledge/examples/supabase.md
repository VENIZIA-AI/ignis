---
type: Example
title: supabase
description: A Postgres example on the postgres-js driver proving Supabase is a driver and identity convention, not a separate connector, with Row Level Security enforced by the database.
resource: examples/supabase
tags: [examples, postgres, supabase]
---

`supabase-example` runs on `postgres-js` (`SupabaseDataSource`) with no `pg` anywhere in the directory, deliberately proving the connector-versus-driver distinction: Supabase is unmodified PostgreSQL, so it varies the driver, not the SQL dialect. The repository, filter syntax, transactions, and controllers are otherwise identical to `examples/vert`.

## What it demonstrates

- **The driver seam is real** - `src/datasources/supabase.datasource.ts` declares `@datasource({ driver: PostgresJsDriver })` and its `configure()` builds only the client, `this.client = postgres(url, SupabasePooler.buildPostgresJsOptions({ mode, max }))`. The framework constructs the `PostgresJsDriver` over that client and its pooled connector lazily on first use, through its own internal `useDriver()` call - no such call appears in the example. `getClient()` is typed as postgres-js's `Sql`, not `pg.Pool`.
- **Pooler mode as a correctness switch** - `SupabasePooler.buildPostgresJsOptions({ mode })` sets `prepare: false` only for `TRANSACTION` mode, because Supavisor rebinds the backend per transaction and a server-side prepared statement from one backend won't exist on the next.
- **RLS lives in the model** - `pgPolicy` on the `note` entity, using re-exported `authenticatedRole`/`authUid`; drizzle-kit generates the policies and `ENABLE ROW LEVEL SECURITY`.
- **`SupabaseRls.withAuthContext` makes `auth.uid()` resolve** - every `NoteService` call opens a transaction and sets the caller's claims with `SET LOCAL`/`set_config(..., true)` inside it, which is transaction-scoped and therefore pooler-safe (a plain `SET` would leak identity to the next connection borrower).
- **Ownership cannot be forged** - `ownerId` defaults to `auth.uid()` at the table level; the app never sends an owner in the request body.
- **The control group** - `GET /notes/unscoped` runs the identical repository call with no auth context and returns every row, isolating `SupabaseRls.withAuthContext` as the only variable.
- **Claims are the verified payload** - GoTrue issues `sub` and `role`, IGNIS's own token shape is `userId` and `roles`. This app verifies a token shaped like Supabase's, so the controller's `getClaims` hands the payload on as it is and refuses a token with no `sub`, because `auth.uid()` would then resolve to null.
- **Grants are hand-written** - drizzle-kit emits the table and policies but not the `GRANT`s they depend on; `migration/0000_first_garia.sql` adds those by hand, because a policy is only consulted after the role clears table privileges. `db/init/01-auth-shim.sql` stands in for the `authenticated` role and `auth.uid()` that a real Supabase project already has.

## How to run it

```bash
docker compose up -d
bun install
cp .env.example .env
bun run server:dev
```

The datasource applies the migration folder at boot, so there is no separate migrate step. `bun run token -- <user-uuid>` mints a test token with the app's own secret, standing in for one Supabase Auth would issue. Then, per the README's curl walkthrough: `GET /api/notes` with a token (only the caller's notes) versus `GET /api/notes/unscoped` (every row, same repository, same table). `bun test` runs a smoke test against the docker database and skips when it is unreachable.

## Notable / non-obvious

- `AuthenticateComponent` here uses `JOSEStandards.JWS` with `JWSAuthenticationStrategy`, not the JWKS-issuer strategy `vert` uses - because GoTrue signs HS256 tokens with a shared secret, IGNIS only needs the secret, not a JWKS endpoint.
- `src/index.ts` passes `artifacts: AutoArtifacts` from `@venizia/ignis-boot/auto`, so every decorated class under `src` is registered by the scanner and `preConfigure()` registers only the two components (API reference, health check).

## Related
- [vert](/examples/vert.md)
- [DataSource hierarchy](/architecture/datasource-hierarchy.md)
- [Repository hierarchy](/architecture/repository-hierarchy.md)
