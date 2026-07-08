# Search & Typesense

IGNIS ships a **typesense connector** under `@venizia/ignis/typesense` for full-text and faceted search. It plugs into the same `@model`/`@repository`/`@datasource` decorators as the PostgreSQL connector, but documents replace Drizzle tables and the query surface is intentionally narrower - search engines are not relational databases.

> [!IMPORTANT] Subpath-only import
> `typesense` is an **optional peer dependency** - the typesense connector is not re-exported from the `@venizia/ignis` root barrel (unlike `postgres`/`memory`), so apps that don't use search never pull in the `typesense` client. Always import from `@venizia/ignis/typesense`:
> ```typescript
> import { TypesenseDataSource, BaseSearchEntity, defineSearchCollection, field } from '@venizia/ignis/typesense';
> ```
> See [Connectors](/references/base/connectors) for the full dual-door export model.

## Defining a Search Collection

Instead of a Drizzle `pgTable`, define a collection with `defineSearchCollection` and the `field` DSL:

```typescript
// src/models/entities/article.model.ts
import { model } from '@venizia/ignis';
import {
  BaseSearchEntity,
  defineSearchCollection,
  field,
  TSearchDocument,
} from '@venizia/ignis/typesense';

@model({
  type: 'entity',
  settings: {
    hiddenProperties: ['internalNote'],
    defaultFilter: { where: { status: 'published' } },
    defaultLimit: 20,
  },
})
export class ArticleDocument extends BaseSearchEntity {
  static override definition = defineSearchCollection({
    name: 'articles',
    fields: [
      field.id(),
      field.string('title', { searchable: true, sortable: true }),
      field.string('content', { searchable: true }),
      field.string('category', { facet: true }),
      field.string('status', { facet: true }),
      field.number('views', { sortable: true, filterable: true }),
      field.number('publishedAt', { sortable: true, filterable: true }),
      field.strings('tags', { facet: true, optional: true }),
      field.string('internalNote', { optional: true }),
    ],
    defaultSort: 'publishedAt',
  });
}

export type TArticleDocument = TSearchDocument<typeof ArticleDocument.schema>;
```

The same `@model` settings you use with Drizzle entities - `hiddenProperties`, `defaultFilter`, `defaultLimit` - work identically here. `hiddenProperties` compiles to Typesense's `exclude_fields`; `defaultFilter.where` is AND-merged into every read's `filter_by` unless the caller passes `shouldSkipDefaultFilter: true`.

### The `field` DSL

`field.*` covers seven wire types - there is no date, object, or vector builder:

| Builder | Wire type | Notes |
|---|---|---|
| `field.id()` | `string` | Takes no arguments; hardcoded `{ name: 'id', type: 'string' }`. Auto-prepended if you omit it. |
| `field.string(name, flags?)` | `string` | |
| `field.strings(name, flags?)` | `string[]` | |
| `field.number(name, flags?)` | `number` | |
| `field.numbers(name, flags?)` | `number[]` | |
| `field.boolean(name, flags?)` | `boolean` | |
| `field.booleans(name, flags?)` | `boolean[]` | |
| `field.geopoint(name, flags?)` | `geopoint` (`[number, number]`) | |

Each `flags` object may set `searchable`, `filterable`, `facet`, `sortable`, `optional` (all `boolean`). Note: `searchable`/`filterable` have no direct Typesense wire equivalent (Typesense indexes every field by default) and are dropped at compile time - only `facet`, `optional`, and `sortable` (mapped to Typesense's `sort`) actually reach the compiled collection schema. They're still worth setting for documentation/intent and for future engines that do distinguish them.

`defineSearchCollection` validates at call time: throws on an empty `name`, empty `fields`, duplicate field names, a non-`string` `id` field, or an unknown `defaultSort` field reference.

### `TSearchDocument<T>`

Derives the document's TypeScript shape directly from the collection definition - no hand-maintained duplicate type:

```typescript
export type TArticleDocument = TSearchDocument<typeof ArticleDocument.schema>;
// {
//   id: string;
//   title: string;
//   content: string;
//   category: string;
//   status: string;
//   views: number;
//   publishedAt: number;
//   tags?: string[];       // optional: true -> optional property
//   internalNote?: string; // optional: true -> optional property
// }
```

`id` is always `string` and required. Every non-`optional` field is required; every `optional: true` field becomes an optional property.

## Configuring a DataSource

```typescript
// src/datasources/search.datasource.ts
import { DataSourceDrivers, datasource } from '@venizia/ignis';
import { TypesenseDataSource } from '@venizia/ignis/typesense';
import { applicationEnvironment, int } from '@venizia/ignis-helpers';

@datasource({ driver: DataSourceDrivers.TYPESENSE })
export class SearchDataSource extends TypesenseDataSource {
  constructor() {
    super({
      name: SearchDataSource.name,
      config: {
        nodes: [
          {
            host: applicationEnvironment.get<string>('APP_ENV_TYPESENSE_HOST'),
            port: int(applicationEnvironment.get<string>('APP_ENV_TYPESENSE_PORT')),
            protocol: applicationEnvironment.get<string>('APP_ENV_TYPESENSE_PROTOCOL'),
          },
        ],
        apiKey: applicationEnvironment.get<string>('APP_ENV_TYPESENSE_API_KEY'),
      },
      // NO schema property - collections auto-discovered from @repository bindings, same convention as postgres.
    });
  }
}
```

`TypesenseDataSource` extends `BaseSearchDataSource` (adds auto-discovery/provisioning) which extends `AbstractSearchDataSource` (engine contract: `getDriver()`, `getQueryDialect()`, `compileCollection()`, `ensureCollection()`) which extends the engine-neutral `AbstractDataSource`. Since `TypesenseDataSource` never overrides `beginTransaction()`, it inherits the neutral `NotSupported` default - see [Connectors](/references/base/connectors).

On `configure()`, the datasource auto-provisions every discovered collection (`ensureCollection()` per definition) unless constructed with `autoProvision: false`.

## Repository Tiers

Mirrors the PostgreSQL connector's ladder, but for documents instead of rows:

```
AbstractRepository (engine-neutral)
  -> TypesenseBaseRepository (narrows dataSource/entity to TypesenseDataSource/BaseSearchEntity)
    -> ReadableSearchRepository (count, existsWith, find, findOne, findById, search<TResult>())
      -> PersistableSearchRepository (create, createAll, updateById, updateAll, import)
        -> DefaultSearchRepository (+ deleteById, deleteAll)
```

```typescript
// src/repositories/article.repository.ts
import { SearchDataSource } from '@/datasources/search.datasource';
import { ArticleDocument, TArticleDocument } from '@/models/entities';
import { repository } from '@venizia/ignis';
import { DefaultSearchRepository } from '@venizia/ignis/typesense';

@repository({ model: ArticleDocument, dataSource: SearchDataSource })
export class ArticleRepository extends DefaultSearchRepository<TArticleDocument> {
  findByCategory(opts: { category: string }) {
    return this.find({ filter: { where: { category: opts.category } } });
  }
}
```

`find()`/`findOne()`/`findById()`/`count()`/`existsWith()` accept the same `TFilter`/`TWhere` shape as PostgreSQL repositories - the `TypesenseQueryDialect` translates `where` into Typesense's `filter_by` syntax, `order` into `sort_by` (max 3 fields - a Typesense limit), `limit`/`skip` into `per_page`/`page`, and `fields` into `include_fields`. `filter.include` is **not supported** and throws - there is no relation model for documents.

### Envelope differences vs. PostgreSQL

| | PostgreSQL repositories | Search repositories |
|---|---|---|
| Range queries | Extra `COUNT(*)` query for `shouldQueryRange: true` | Single search call already returns `found` - no second query needed |
| `updateAll`/`deleteAll` with empty `where` | Requires `force: true` | `updateAll` **refuses** an unfiltered bulk update outright (throws); `deleteAll` with no effective filter performs a full **truncate** instead |
| Returning updated/deleted rows | Native SQL `RETURNING` | No `RETURNING` equivalent - the repository re-`find()`s the same filter (or snapshots before delete) to populate `data` |
| `createAll` | Native bulk insert, returns each row | Delegates to Typesense's bulk import; "created" rows are the input rows whose per-row response didn't report `success: false` |

## Raw `search()` - Escaping the Filter DSL

For full-text queries, facets, or any Typesense-native search parameter the `TFilter` dialect doesn't model, use `search<TResult>()` - a raw passthrough with **no** `TFilter`/`@model defaultFilter` translation:

```typescript
search<TResult = ISearchResult<TDocument>>(opts: {
  params: object;
  options?: object;
}): Promise<TResult>
```

```typescript
interface ISearchResult<TDocument extends object = object> {
  found: number;
  hits?: Array<{ document: TDocument }>;
}
```

Because `search()` bypasses the dialect, build `filter_by` yourself when you need to combine free-text search with structured filtering - reuse the datasource's query dialect directly:

```typescript
// src/controllers/search.controller.ts
import type { TWhere } from '@venizia/ignis';

const where: TWhere = {};
if (category) { where.category = category; }
if (minViews !== undefined) { where.views = { gte: minViews }; }

const params: Record<string, unknown> = { q, query_by: ['title', 'content'] };
if (Object.keys(where).length > 0) {
  params.filter_by = this.repository.dataSource.getQueryDialect().translateWhere({ where });
}
if (facetBy) { params.facet_by = facetBy; }
if (sortBy) { params.sort_by = sortBy; }

const result = await this.repository.search({ params });
return context.json({ found: result.found, hits: result.hits ?? [] });
```

> [!NOTE]
> Because `search()` skips `@model defaultFilter`, it will surface documents the `find()`/`findOne()` tier would normally hide (e.g. non-`published` articles). Apply any tenant/visibility filtering explicitly in `params.filter_by` when exposing raw search over HTTP.

## Transactions and Locking

The typesense connector has no transaction or row-level-locking model. Passing a `transaction` or `lock` option to any repository method throws:

```typescript
await articleRepository.updateById({
  id: '123',
  data: { title: 'New' },
  options: { transaction: tx }, // throws: 501, messageCode 'core.not_supported'
});
```

This is the same `throwNotSupported` convention used everywhere in the framework for capabilities an engine doesn't implement - see [Connectors](/references/base/connectors) and [Transactions](./transactions).

## See Also

- **Related Concepts:**
  - [Connectors](/references/base/connectors) - Base-vs-connectors architecture, dual-door exports
  - [DataSources](/references/base/datasources) - Engine-neutral DataSource contract + PostgreSQL connector
  - [Memory Connector](./memory-connector) - The zero-dependency in-memory connector
  - [Repositories](/references/base/repositories/) - PostgreSQL connector repository reference (for comparison)
  - [Models](./models) - `@model` settings shared across connectors

- **Example App:**
  - `examples/typesense-search/` - Full end-to-end app (model, datasource, repository, CRUD + search controllers, seed script)
