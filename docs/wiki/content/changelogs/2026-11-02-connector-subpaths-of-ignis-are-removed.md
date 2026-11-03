---
title: The connector sub-paths of @venizia/ignis are removed, and one codemod moves your imports
description: "@venizia/ignis/postgres, /relational, /sqlite, /search, /typesense, /meilisearch and their driver and controller sub-paths are removed; import them from @venizia/ignis-connectors, which your app must list as a dependency, and run devz codemod connector-imports."
packages: ['@venizia/ignis', '@venizia/ignis-connectors', '@venizia/dev-configs']
---

# Changelog - 2026-11-02

## The connector sub-paths of @venizia/ignis are removed, and one codemod moves your imports

<Badge type="warning" text="Breaking Change" />

**In one line.** Import the connector sub-paths from `@venizia/ignis-connectors`, add that package to your dependencies, and run `devz codemod connector-imports` to rewrite the specifiers.

## What changed

- **13 sub-paths are removed from `@venizia/ignis`.** Each one was a re-export of the same name in `@venizia/ignis-connectors`:

| Removed | Use instead |
|---|---|
| `@venizia/ignis/postgres` | `@venizia/ignis-connectors/postgres` |
| `@venizia/ignis/postgres/node-postgres` | `@venizia/ignis-connectors/postgres/node-postgres` |
| `@venizia/ignis/postgres/postgres-js` | `@venizia/ignis-connectors/postgres/postgres-js` |
| `@venizia/ignis/postgres/pglite` | `@venizia/ignis-connectors/postgres/pglite` |
| `@venizia/ignis/postgres/supabase` | `@venizia/ignis-connectors/postgres/supabase` |
| `@venizia/ignis/relational` | `@venizia/ignis-connectors/relational` |
| `@venizia/ignis/sqlite` | `@venizia/ignis-connectors/sqlite` |
| `@venizia/ignis/sqlite/libsql` | `@venizia/ignis-connectors/sqlite/libsql` |
| `@venizia/ignis/search` | `@venizia/ignis-connectors/search` |
| `@venizia/ignis/search/controllers` | `@venizia/ignis-connectors/search/controllers` |
| `@venizia/ignis/meilisearch` | `@venizia/ignis-connectors/meilisearch` |
| `@venizia/ignis/typesense` | `@venizia/ignis-connectors/typesense` |
| `@venizia/ignis/typesense/controllers` | `@venizia/ignis-connectors/typesense/controllers` |

- **List `@venizia/ignis-connectors` as a dependency of your app.** `@venizia/ignis` depends on it, but your app now imports it by name, so it must be in your own `package.json`.
- **Nothing else moves.** The root of `@venizia/ignis` still re-exports the Postgres connector, and `@venizia/ignis/mail`, `/static-asset`, `/testing`, `/websocket`, `/grpc` and `/socket-io` stay.
- **A new command: `devz codemod connector-imports [paths...] [--write | --check]`.** It rewrites the specifier of an import, an export from, a dynamic `import()`, a `require()`, an `import()` type and a `mock.module()` call. It is a dry run unless `--write`; `--check` exits 1 while a file would change; `--write` refuses a file with local changes. It names each `package.json` that does not list `@venizia/ignis-connectors`.

## Who is affected

- **Apps that import a removed sub-path.** The import no longer resolves. Run the codemod and add the dependency.
- **Apps that import only from `@venizia/ignis` and the sub-paths that stay.** No action needed.

## Breaking changes

> [!WARNING]
> An import of a removed sub-path fails to compile or to load after the update.

**Before:**

```typescript
import { BasePostgresDataSource } from '@venizia/ignis/postgres';
import { NodePostgresDriver } from '@venizia/ignis/postgres/node-postgres';
import { TypesenseDataSource } from '@venizia/ignis/typesense';
```

**After:**

```typescript
import { BasePostgresDataSource } from '@venizia/ignis-connectors/postgres';
import { NodePostgresDriver } from '@venizia/ignis-connectors/postgres/node-postgres';
import { TypesenseDataSource } from '@venizia/ignis-connectors/typesense';
```

To upgrade:

1. Commit your work, so git can undo the codemod.
2. Add `@venizia/ignis-connectors` to your `dependencies`, at the version `@venizia/ignis` depends on.
3. Dry run: `bunx devz codemod connector-imports` lists every file it would change.
4. Apply: `bunx devz codemod connector-imports --write`.
5. Run your formatter and your typecheck.

## Details

- The codemod changes the quoted specifier and nothing else, so import order and formatting are yours to fix with your formatter.
- A string that is not in an import position, a comment, and a name that only starts like a removed one (`@venizia/ignis/postgres-extra`) are not touched.
- `devz codemod namespace-functions` and `devz codemod connector-imports` can run in either order: the function table still lists the old `@venizia/ignis/<sub-path>` modules next to the `@venizia/ignis-connectors` ones.
