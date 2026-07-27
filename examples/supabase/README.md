# Supabase Example

Reference example for IGNIS on Supabase. Supabase is unmodified PostgreSQL, so it is **not** a
separate connector - it varies the **driver**, not the SQL dialect. This app is where that claim gets
tested: it runs on `postgres-js` and there is no `pg` anywhere in this directory.

The other half of the example is Row Level Security. Nothing else in the repo shows a query whose
result set is decided by the database rather than by a `where` clause.

## What this demonstrates

- **The driver seam is real** (`src/datasources/supabase.datasource.ts`) - `useDriver()` wires a
  `PostgresJsDriver` and builds the pooled connector in one step, so the half-wired state (driver set,
  connector forgotten) cannot exist. `getClient()` is typed as postgres-js's `Sql`, not `pg.Pool`,
  because the fourth type parameter says so.
- **Pooler mode is a correctness switch, not a tuning knob** - `buildPostgresJsOptions({ mode })`
  emits `prepare: false` for `TRANSACTION` mode only. Supavisor rebinds the backend per transaction,
  so a server-side prepared statement created on one backend is not there on the next.
- **RLS policies live in the model** (`src/models/entities/note.model.ts`) - `pgPolicy` with the
  submodule's re-exported `authenticatedRole` and `authUid`. drizzle-kit generates them, `ENABLE ROW
  LEVEL SECURITY` included.
- **`withAuthContext` is what makes `auth.uid()` resolve** (`src/services/note.service.ts`) - every
  call opens a transaction, establishes the caller's claims inside it, then issues an ordinary
  repository query. The transaction is not decoration: `SET LOCAL` / `set_config(..., true)` is
  transaction-scoped, and that is exactly what makes it safe behind a pooler. A plain `SET` would leak
  the caller's identity to the next borrower of the connection.
- **Ownership cannot be forged** - `ownerId` defaults to `auth.uid()` in the table, so a client that
  lies in its request body changes nothing. The app never sends an owner.
- **The control group** - `GET /notes/unscoped` runs the same repository against the same table
  through the pooled connector, with no auth context. It returns every row. The only difference
  between it and `GET /notes` is `withAuthContext`.

## Prerequisites

- Bun >= 1.3
- A Supabase project (hosted or self-hosted) you can reach on Postgres, and its `JWT_SECRET`

## Configure

```bash
cp .env.example .env.development
```

Fill in:

| Variable | Where it comes from |
| :--- | :--- |
| `APP_ENV_SUPABASE_DATABASE_URL` | Supabase's connection string |
| `APP_ENV_SUPABASE_POOLER_MODE` | `direct` \| `session` \| `transaction` - see below |
| `APP_ENV_SUPABASE_URL` | project URL; GoTrue lives at `${url}/auth/v1` |
| `APP_ENV_SUPABASE_ANON_KEY` | project anon key |
| `APP_ENV_JWT_SECRET` | the project's JWT secret - GoTrue signs with it, IGNIS verifies with it |

`.env.development` is gitignored. Do not commit credentials.

### Which pooler mode?

| Mode | Port | Prepared statements | When |
| :--- | :--- | :--- | :--- |
| `direct` | 5432 | yes | long-lived server, straight to the database |
| `session` | 5432 / 5433 (pooler) | yes | pooled, one backend per client session |
| `transaction` | 6543 | **no** | serverless, many short-lived connections |

If you are unsure which one your endpoint is, run the same prepared statement three times and watch
`pg_backend_pid()`: if it stays on one backend and does not error, you are in session or direct mode.

## Run it

```bash
# 1. Install (from the repo root - this is a workspace package)
bun install

# 2. Create the schema, the table, its policies, and the grants
bun run migrate:dev

# 3. Give two real auth.users rows some notes to own
bun run seed

# 4. Start
bun run server:dev
```

The example owns the `ignis_example` schema. It never touches `public`, which on a real project is
where your application lives.

## Prove that RLS is doing the work

```bash
# Sign in as a real Supabase user - the token comes from GoTrue, not from this app
curl -sX POST localhost:3000/api/auth/sign-in \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"..."}'

TOKEN=<accessToken from above>

# Only your notes. There is no `where owner_id = ...` anywhere in the codebase.
curl -s localhost:3000/api/notes -H "Authorization: Bearer $TOKEN"

# Every note in the table. Same repository, same table, no auth context.
curl -s localhost:3000/api/notes/unscoped

# ownerId is not in the body - the database stamps it from auth.uid()
curl -sX POST localhost:3000/api/notes \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"mine"}'

# Deleting someone else's note is not rejected. It matches no row: {"count":0}
curl -sX DELETE localhost:3000/api/notes/<someone-elses-id> -H "Authorization: Bearer $TOKEN"
```

That last one is the point worth internalising. The application does not check ownership anywhere.
`count: 0` is Postgres declining to show a row that exists.

## Two things the example does not hide

**The claims shapes do not coincide.** IGNIS's `IJWTTokenPayload` speaks `userId` + `roles`; GoTrue
issues `sub` + `role`. The controller reconciles them at the boundary (`getClaims`) rather than
pretending they are the same thing - `auth.uid()` reads `sub`, and nothing else.

**drizzle-kit does not manage grants.** It emits the table and its policies, but neither the schema
that holds them nor the `GRANT`s the policies depend on. Those are hand-added at the top and bottom of
`migration/0000_purple_calypso.sql`, with a comment saying why: a policy is consulted only *after* the
role clears table privileges, so without the grants `authenticated` is refused before RLS is ever
reached - and RLS would appear to "work" for entirely the wrong reason.

## Postgres, not Supabase

Everything above except `withAuthContext`, `PoolerModes`, and the Supabase role re-exports is
ordinary IGNIS. The repository, the filter syntax, transactions, the controller - all identical to
`examples/vert`. That is the design: Supabase is Postgres with a driver preference and an identity
convention, and IGNIS treats it as exactly that.
