# Supabase

An IGNIS API that shows [Row Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
(RLS) driven by the request's user, on the `postgres-js` driver Supabase deployments use. Two people
call the same endpoint; each sees only their own rows - Postgres decides that, not a `where` clause.

```bash
docker compose up -d
bun install
cp .env.example .env
bun run start
```

The app listens on `http://localhost:3000` (set `PORT` to change it). It applies its own schema at
boot, so there is no separate migrate step. Browse the API at `http://localhost:3000/api/doc/explorer`.

## What it shows

| File | What it does |
|---|---|
| `src/models/note.model.ts` | The table, its four RLS policies, and `owner_id default auth.uid()` |
| `src/datasources/supabase.datasource.ts` | `postgres-js` instead of `pg`; pooler-mode presets from `@venizia/ignis/postgres/supabase` |
| `src/services/note.service.ts` | `withAuthContext` - opens a transaction, stamps the caller's claims into it, then issues an ordinary repository call |
| `src/controllers/note.controller.ts` | Reads the verified token as claims and hands them to the service; no `where owner_id = ...` anywhere |
| `src/token.ts` | Mints a test token with the app's own secret, standing in for a token Supabase Auth would issue |
| `db/init/01-auth-shim.sql` | The `authenticated` role and `auth.uid()` function a real Supabase project already has |

## Endpoints

Every route sits under `/api`. `/notes` needs `Authorization: Bearer <token>`; `/notes/unscoped`
deliberately accepts none - it is the control group.

| Method | Path | Does |
|---|---|---|
| `GET` | `/health` | Liveness check |
| `GET` | `/notes` | The caller's own notes, scoped by RLS |
| `POST` | `/notes` | Create a note; `ownerId` is not in the body |
| `DELETE` | `/notes/{id}` | Delete one note; someone else's id matches nothing |
| `GET` | `/notes/unscoped` | Every note in the table - the control group, no auth context |
| `GET` | `/doc/openapi.json` | The OpenAPI document |

## Prove that RLS is doing the work

Mint two tokens for two different users - no sign-in, no Supabase Auth, just the app's own secret:

```bash
TOKEN_A=$(bun run token -- 11111111-1111-1111-1111-111111111111)
TOKEN_B=$(bun run token -- 22222222-2222-2222-2222-222222222222)

curl -sX POST localhost:3000/api/notes -H "Authorization: Bearer $TOKEN_A" \
  -H 'Content-Type: application/json' -d '{"title":"A'"'"'s note"}'

curl -sX POST localhost:3000/api/notes -H "Authorization: Bearer $TOKEN_B" \
  -H 'Content-Type: application/json' -d '{"title":"B'"'"'s note"}'

# Only A's note. There is no `where owner_id = ...` anywhere in the codebase.
curl -s localhost:3000/api/notes -H "Authorization: Bearer $TOKEN_A"

# Every note in the table. Same repository, same table, no auth context.
curl -s localhost:3000/api/notes/unscoped
```

## Test it

```bash
docker compose up -d
bun test
docker compose down -v
```

The smoke test boots the same `Application` on a free port against the docker database, mints tokens
for two users the same way, and checks each sees only their own notes. It skips cleanly
(`describe.skipIf`) when the database is unreachable, so it never runs in CI.

## Plain Postgres, not the Supabase image

`docker-compose.yml` runs `postgres:16`, not `supabase/postgres`. `withAuthContext` needs exactly two
things a real Supabase project provisions: a role it can `SET LOCAL ROLE` into, and an `auth.uid()`
function that reads the claims `withAuthContext` sets. `db/init/01-auth-shim.sql` creates both in four
lines. Nothing in IGNIS calls GoTrue, PostgREST, Kong or any other Supabase service - the JWT is
verified locally, symmetrically, with a shared secret - so none of them need to run for this example
to prove the point.

## The claims shapes do not coincide

Supabase Auth issues `sub` + `role`; IGNIS's own token shape is `userId` + `roles`. The controller
reads the verified payload as-is (`getClaims`) rather than pretending they are the same thing -
`auth.uid()` reads `sub`, and nothing else.

## Nothing else here is Supabase-specific

Everything above except `withAuthContext`, `PoolerModes`, and the Supabase role re-exports is ordinary
IGNIS. The repository, the filter syntax, transactions, the controller - all the same as any other
Postgres example. Supabase is Postgres with a driver preference and an identity convention, and IGNIS
treats it as exactly that.

## Next

- [PGlite quickstart](../pglite-quickstart) - the same repository and controller shapes, no RLS
- [`vert`](../vert) - the production reference: authentication, authorization, transactions
