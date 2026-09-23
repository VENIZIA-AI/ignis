# @venizia/ignis-connectors

The datasources, drivers, entity bases and repositories IGNIS uses to reach a backing engine: SQL
through Drizzle (Postgres, PGlite, SQLite), search engines (Typesense, Meilisearch), and another
IGNIS server over HTTP.

Server applications get these through `@venizia/ignis` and its sub-paths. Install this package
directly when you use the connectors without the server, for example in a browser Worker.

## Install

For Postgres through `pg`:

```bash
bun add @venizia/ignis-connectors @venizia/ignis-kernel drizzle-orm drizzle-zod hono @hono/zod-openapi pg
```

Every peer is optional. Each entry point needs its own set - see the table in
[Entry points](#entry-points).

## Example

Declare the tables with Drizzle first. `ModelFactory.defineEntity` turns each table into an entity,
and a relation points at a table, not at another entity class:

```typescript
import { datasource, model, repository } from '@venizia/ignis-kernel';
import {
  BasePostgresDataSource,
  DefaultCRUDRepository,
  generateIdColumnDefs,
  many,
  ModelFactory,
  one,
  type TEntityObject,
} from '@venizia/ignis-connectors/postgres';
import { NodePostgresDriver } from '@venizia/ignis-connectors/postgres/node-postgres';
import { pgTable, text } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';

export const authorTable = pgTable('Author', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  name: text('name').notNull(),
});

export const postTable = pgTable('Post', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  authorId: text('author_id').notNull().references(() => authorTable.id),
  title: text('title').notNull(),
});

@model({ type: 'entity' })
export class Author extends ModelFactory.defineEntity({
  table: authorTable,
  relations: () => ({ posts: many(postTable, { relationName: 'author' }) }),
}) {}

@model({ type: 'entity' })
export class Post extends ModelFactory.defineEntity({
  table: postTable,
  relations: () => ({ author: one(authorTable) }),
}) {}

@datasource({ driver: NodePostgresDriver })
export class BlogDataSource extends BasePostgresDataSource<{ connectionString: string }> {
  constructor() {
    super({ name: BlogDataSource.name, config: { connectionString: 'postgres://localhost/blog' } });
  }

  override configure(): void {
    this.client = new Pool(this.settings);
  }

  override getConnectionString(): string {
    return this.settings.connectionString;
  }
}

@repository({ model: Author, dataSource: BlogDataSource })
export class AuthorRepository extends DefaultCRUDRepository<typeof authorTable> {}

@repository({ model: Post, dataSource: BlogDataSource })
export class PostRepository extends DefaultCRUDRepository<typeof postTable> {}

const dataSource = new BlogDataSource();
dataSource.configure();

const authors = new AuthorRepository(dataSource);
const found = await authors.find<TEntityObject<typeof Author>>({
  filter: { where: { name: 'Ada' }, include: [{ relation: 'posts' }] },
});
console.log(found[0]?.posts?.map(post => post.title));
```

Notice what you did not write:

- `one(authorTable)` has no `fields` or `references`. It reads them off the one foreign key from
  `Post` to `Author`. With two keys to the same table, it throws and names them, so you write
  `fields`/`references` for that relation.
- `many(postTable, { relationName: 'author' })` pairs with the `one()` named `author` on `Post`.
- The datasource has no schema. It collects the tables from every `@repository` bound to it.
- `generateIdColumnDefs({ id: { dataType: 'string' } })` gives a text primary key filled with a UUID v7.

A class that extends `BaseRelationalEntity` with a hand-written static `schema` still works. Both
styles can live in one application.

## Entry points

| Import | What it gives | Extra peers |
|---|---|---|
| `@venizia/ignis-connectors` | The engine-neutral tiers: `BaseRelationalDataSource`, `BaseRelationalEntity`, `ModelFactory`, the relational repository chain, `RelationalMigrationRunner`, `RecursiveTreeSql`, and the search tier | `drizzle-orm`, `drizzle-zod`, `hono`, `@hono/zod-openapi` |
| `/relational` | The engine-neutral SQL tier alone | `drizzle-orm`, `drizzle-zod`, `hono`, `@hono/zod-openapi` |
| `/postgres` | `BasePostgresDataSource`, `DefaultCRUDRepository` and its chain, `ModelFactory`, `one`, `many`, the column helpers, `IsolationLevels`, `RecursiveTreeSql` | `drizzle-orm`, `drizzle-zod`, `hono`, `@hono/zod-openapi` |
| `/postgres/node-postgres` | `NodePostgresDriver` | `drizzle-orm`, `pg` |
| `/postgres/postgres-js` | `PostgresJsDriver` | `drizzle-orm`, `postgres` |
| `/postgres/pglite` | `PGliteDriver` - Postgres in WASM, in memory or in the browser's OPFS | `drizzle-orm`, `@electric-sql/pglite` |
| `/postgres/supabase` | `withAuthContext`, `PoolerModes`, `buildPostgresJsOptions`, and the Supabase role and table helpers | `drizzle-orm` |
| `/sqlite` | `BaseSqliteDataSource`, `DefaultSqliteRepository` and its chain, `ModelFactory`, `RecursiveTreeSql` | `drizzle-orm`, `drizzle-zod`, `hono`, `@hono/zod-openapi` |
| `/sqlite/libsql` | `LibSqlDriver` | `drizzle-orm`, `drizzle-zod`, `hono`, `@hono/zod-openapi`, `@libsql/client` |
| `/search` | The engine-neutral search tier: `BaseSearchDataSource`, `BaseSearchEntity`, `DefaultSearchRepository` and its chain | none |
| `/search/controllers` | `AbstractSearchController`, `SearchControllerFactory` | `hono`, `@hono/zod-openapi` |
| `/typesense` | `TypesenseDataSource`, `TypesenseConnector`, `TypesenseQueryDialect`, plus everything in `/search` | `typesense` |
| `/typesense/controllers` | The same search controllers as `/search/controllers` | `hono`, `@hono/zod-openapi` |
| `/meilisearch` | `MeilisearchDataSource`, `MeilisearchConnector`, `MeilisearchQueryDialect` | `meilisearch` |
| `/http` | `HttpDataSource` and `HttpRepository` - read another IGNIS server's REST routes with the same filter vocabulary | none |

The root entry imports no driver and no engine client. A driver loads only when you import its
entry and name its class in `@datasource({ driver })`.

## Where it sits

Depends on `@venizia/ignis-kernel`, `@venizia/ignis-filter`, `@venizia/ignis-helpers` and
`@venizia/ignis-inversion`. Used by `@venizia/ignis`, which re-exports every sub-path under the same
name (`@venizia/ignis/postgres`, ...) except `/http`. Its root re-exports `/postgres`.

## Links

- [Connectors](https://ignis.venizia.ai/references/base/connectors)
- [Models](https://ignis.venizia.ai/guides/core-concepts/persistent/models) and [relations](https://ignis.venizia.ai/references/base/repositories/relations)
- [Postgres drivers and Supabase](https://ignis.venizia.ai/guides/core-concepts/persistent/postgres-drivers), [PGlite](https://ignis.venizia.ai/guides/core-concepts/persistent/pglite), [SQLite](https://ignis.venizia.ai/guides/core-concepts/persistent/sqlite)
- [Typesense](https://ignis.venizia.ai/guides/core-concepts/persistent/search-typesense), [Meilisearch](https://ignis.venizia.ai/guides/core-concepts/persistent/search-meilisearch)
- [Changelog: define an entity from its table](https://ignis.venizia.ai/changelogs/2026-09-19-define-entity)
- [Changelog: an HTTP connector](https://ignis.venizia.ai/changelogs/2026-09-17-an-http-connector)
- [All changelogs](https://ignis.venizia.ai/changelogs/)

MIT licensed - see [LICENSE.md](https://github.com/VENIZIA-AI/ignis/blob/main/LICENSE.md).
