# Search & Typesense

IGNIS ships a **typesense connector** under `@venizia/ignis/typesense` for full-text and faceted search. It plugs into the same `@model`/`@repository`/`@datasource` decorators as the PostgreSQL connector, but documents replace Drizzle tables and the query surface is intentionally narrower - search engines are not relational databases.

> [!IMPORTANT] Subpath-only import
> `typesense` is an **optional peer dependency** - the typesense connector is not re-exported from the `@venizia/ignis` root barrel (unlike `postgres`/`memory`), so apps that don't use search never pull in the `typesense` client. Always import from `@venizia/ignis/typesense`:
>
> ```typescript
> import {
>   TypesenseDataSource,
>   BaseSearchEntity,
>   defineSearchCollection,
>   field,
> } from '@venizia/ignis/typesense';
> ```
>
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
export class ArticleDocument extends BaseSearchEntity<typeof ArticleDocument.schema> {
  static override schema = defineSearchCollection({
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

`field.*` covers the scalar and array wire types plus a `vector` builder for semantic search - there is no date or object builder:

| Builder                        | Wire type                       | Notes                                                                                                                                                                                 |
| ------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `field.id()`                   | `string`                        | Takes no arguments; hardcoded `{ name: 'id', type: 'string' }`. Auto-prepended if you omit it.                                                                                        |
| `field.string(name, flags?)`   | `string`                        |                                                                                                                                                                                       |
| `field.strings(name, flags?)`  | `string[]`                      |                                                                                                                                                                                       |
| `field.number(name, flags?)`   | `number`                        |                                                                                                                                                                                       |
| `field.numbers(name, flags?)`  | `number[]`                      |                                                                                                                                                                                       |
| `field.boolean(name, flags?)`  | `boolean`                       |                                                                                                                                                                                       |
| `field.booleans(name, flags?)` | `boolean[]`                     |                                                                                                                                                                                       |
| `field.geopoint(name, flags?)` | `geopoint` (`[number, number]`) |                                                                                                                                                                                       |
| `field.vector(name, opts)`     | `float[]`                       | Embedding vector for semantic/hybrid search. Its `opts` carry `dimensions`/`distance`/`embed` rather than the shared flags - see [Vector Fields](#vector-fields-for-semantic-search). |

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

## Vector Fields for Semantic Search

`field.vector(name, opts)` declares a `float[]` embedding column. There are two ways to populate it.

**Server-side auto-embedding** - Typesense builds the vector from other fields at index time, so your app never computes an embedding. Point `embed.from` at the source fields and name an embedding model:

```typescript
// Local built-in model - runs on the Typesense server, no API key, no external calls:
field.vector('embedding', {
  embed: { from: ['title', 'content'], model: { name: 'ts/all-MiniLM-L6-v2' } },
});

// Remote provider - the API key is read from env, never hardcoded. This example is Gemini via
// Google's OpenAI-compatible endpoint (Typesense's `openai/` provider plus a custom `url`):
field.vector('embedding', {
  embed: {
    from: ['title', 'content'],
    model: {
      url: 'https://generativelanguage.googleapis.com/v1beta/openai',
      name: 'openai/gemini-embedding-001',
      apiKey: process.env.APP_ENV_GOOGLE_API_KEY,
    },
  },
});
```

The `model` config is camelCase and maps to Typesense's snake_case `model_config` at compile time (`name` becomes `model_name`, `apiKey` becomes `api_key`, `accessToken` becomes `access_token`, and so on); any provider field not modeled is passed through unchanged. Never hardcode `apiKey` into a committed schema - source it from an environment variable.

**Client-provided vectors** - you compute the embedding yourself and send it with each document. Declare `dimensions` and a distance metric instead of `embed`:

```typescript
import { VectorDistances } from '@venizia/ignis/typesense';

field.vector('embedding', { dimensions: 384, distance: VectorDistances.COSINE });
// VectorDistances: COSINE ('cosine'), INNER_PRODUCT ('ip'), L2 ('l2')
```

An auto-embedded field (one with `embed`) is **omitted from `TSearchDocument`** - the server owns it, so it never appears in your create/update payloads. A client-provided vector field (dimensions only, no `embed`) stays in the document type as `number[]`.

See [Searching](#searching-with-search-mode) for querying these fields with `mode: 'semantic'` and `mode: 'hybrid'`.

## Synonyms

Declare synonym sets on the collection; they are provisioned alongside it at `configure()`:

```typescript
static override schema = defineSearchCollection({
  name: 'articles',
  fields: [ /* ... */ ],
  synonyms: [
    // Multi-way (no `root`): every term matches the others.
    { id: 'ml', synonyms: ['ml', 'machine learning', 'deep learning'] },
    // One-way (`root` set): a query for the root also matches the synonyms, not the reverse.
    { id: 'js', root: 'javascript', synonyms: ['js', 'ecmascript', 'nodejs'] },
  ],
});
```

Declarative `synonyms` are provisioned as one **synonym set** per collection (named `<collection>_synonyms`) and linked to it - matching Typesense v30+'s global synonym-sets model (the pre-v30 per-collection synonyms API was removed). For runtime management outside the declarative schema, the connector exposes the synonym-set verbs through the raw client escape hatch:

```typescript
const connector = repository.dataSource.getConnector();
await connector.upsertSynonymSet({
  name: 'articles_synonyms',
  items: [{ id: 'db', synonyms: ['db', 'database', 'datastore'] }],
});
await connector.linkSynonymSets({ collection: 'articles', synonymSets: ['articles_synonyms'] });
// getSynonymSet({ name }) / listSynonymSets() / deleteSynonymSet({ name }) round out the set.
```

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

On `configure()`, the datasource auto-provisions every discovered collection (`ensureCollection()` per definition, plus any declared `synonyms`) unless constructed with `autoProvision: false`.

`getCapabilities()` reports what the engine supports so callers can probe before relying on a feature across engines:

```typescript
dataSource.getCapabilities();
// { transactions: false, search: { vector: true, multi: true, union: true, synonyms: true } }
```

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

|                                            | PostgreSQL repositories                             | Search repositories                                                                                                                            |
| ------------------------------------------ | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Range queries                              | Extra `COUNT(*)` query for `shouldQueryRange: true` | Single search call already returns `found` - no second query needed                                                                            |
| `updateAll`/`deleteAll` with empty `where` | Requires `force: true`                              | `updateAll` **refuses** an unfiltered bulk update outright (throws); `deleteAll` with no effective filter performs a full **truncate** instead |
| Returning updated/deleted rows             | Native SQL `RETURNING`                              | No `RETURNING` equivalent - the repository re-`find()`s the same filter (or snapshots before delete) to populate `data`                        |
| `createAll`                                | Native bulk insert, returns each row                | Delegates to Typesense's bulk import; "created" rows are the input rows whose per-row response didn't report `success: false`                  |

## Searching with `search({ mode })`

Beyond the `find()` tier (filter-only reads that return documents), `search()` is the search-engine entry point. It is one method whose shape is selected by `mode`, so TypeScript narrows the options to just that mode's fields - you never juggle every parameter at once. `mode` defaults to `keyword`.

The `keyword`/`semantic`/`hybrid` modes reuse the same filter translation as `find()` (`@model defaultFilter`, `hiddenProperties`, `where`/`order`/`limit`), then layer the search term or vector on top. The `raw` mode is a full passthrough with no translation.

**`keyword`** - full-text search:

```typescript
await repository.search({
  mode: 'keyword',
  query: 'renewable energy',
  queryBy: ['title', 'content'], // which fields to match
  filter: { where: { published: true }, limit: 20 }, // optional, same TFilter as find()
});
```

**`semantic`** - vector search. Supply a precomputed vector, or `queryText` against a server-side auto-embed field:

```typescript
// Client-provided vector:
await repository.search({ mode: 'semantic', vectorField: 'embedding', nearVector: [0.12, ...], k: 10 });

// Server-side auto-embed (the field was declared with `embed`) - Typesense embeds the text for you:
await repository.search({ mode: 'semantic', vectorField: 'embedding', queryText: 'renewable energy', k: 10 });
```

**`hybrid`** - keyword and vector blended. `alpha` weights vector against text (0 to 1):

```typescript
await repository.search({
  mode: 'hybrid',
  query: 'renewable energy',
  queryBy: ['title'],
  vectorField: 'embedding',
  alpha: 0.5,
  k: 10,
});
```

> [!NOTE]
> `semantic` and `hybrid` default `prefix=false`: prefix matching is meaningless for vector search, and remote embedders (OpenAI/Google/...) reject it (`Prefix search is not supported for remote embedders`). Pass `prefix` explicitly to override.

**`raw`** - native Typesense params, no `TFilter`/`defaultFilter`/`hiddenProperties` translation. Use it for any engine feature the modes above do not model:

```typescript
await repository.search({
  mode: 'raw',
  params: { q: '*', filter_by: 'price:>100', vector_query: 'embedding:([...], k:10)' },
});
```

> [!NOTE]
> `raw` skips `@model defaultFilter`, so it can surface documents the `find()`/`keyword` tiers would hide (for example non-`published` articles). Apply any tenant or visibility filtering explicitly in `params.filter_by` when exposing raw search over HTTP.

All non-`raw` modes accept the same optional camelCase tuning fields, mapped to Typesense's snake_case at the dialect boundary: faceting (`facetBy`, `facetQuery`, `maxFacetValues`), highlighting (`highlightFields`, `highlightFullFields`, `highlightStartTag`/`highlightEndTag`, `snippetThreshold`), grouping (`groupBy`, `groupLimit`, `groupMissingValues`), and matching/ranking (`numTypos`, `prefix`, `infix`, `queryByWeights`, `prioritizeExactMatch`, `dropTokensThreshold`, `useCache`, `cacheTtl`, `exhaustiveSearch`, `pinnedHits`, `hiddenHits`, `preset`).

```typescript
await repository.search({
  mode: 'keyword',
  query: 'shoes',
  queryBy: ['name'],
  facetBy: ['brand', 'color'], // faceted counts
  highlightFields: ['name'], // marked matches
  groupBy: ['brand'],
  groupLimit: 3, // grouped results
});
```

`mode` values are also available as the `SearchModes` const (`SearchModes.KEYWORD`/`SEMANTIC`/`HYBRID`/`RAW`) if you prefer named constants over string literals.

### The result envelope

`search()` returns the engine's search envelope (unlike `find()`, which returns documents):

```typescript
interface ISearchResult<TDocument extends object = object> {
  found: number;
  hits?: Array<{ document: TDocument; highlight?: unknown; textMatch?: number }>;
  facetCounts?: unknown[];
  groupedHits?: unknown[];
}
```

## Cross-Collection Multi-Search

A single search targets one collection, so it lives on the repository. Searching **many** collections in one round trip lives on the **datasource**:

```typescript
await repository.dataSource.multiSearch({
  searches: [
    { collection: 'products', query: 'shoes', queryBy: ['name'] },
    { collection: 'brands', query: 'shoe' },
  ],
  commonParams: { perPage: 20 }, // optional defaults applied to every search
});
```

Federated by default - the result is one entry per search, side by side. Pass `union: true` to merge them into a single ranked result set instead:

```typescript
await repository.dataSource.multiSearch({
  searches: [
    /* ... */
  ],
  union: true,
});
```

Both `searches` entries and `commonParams` are camelCase (`filterBy`, `queryBy`, `perPage`); the datasource maps them to Typesense's snake_case wire format the same way single-collection `search()` does. For native snake_case access, `getConnector().multiSearch(...)` takes the engine's own params.

## Search Controller Factory

`SearchControllerFactory.defineSearchController` generates turnkey search endpoints, mirroring how `ControllerFactory.defineCrudController` generates CRUD endpoints:

```typescript
// src/controllers/search.controller.ts
import { ArticleDocument } from '@/models/entities';
import { ArticleRepository } from '@/repositories';
import { SearchControllerFactory } from '@venizia/ignis/typesense/controllers';

const _SearchController = SearchControllerFactory.defineSearchController({
  entity: ArticleDocument,
  repository: { name: ArticleRepository.name },
  controller: { name: 'ArticleSearchController', basePath: '/articles' },
  // routes: { multiSearch: { enabled: false } },  // each route is customizable / disable-able
});

export const ArticleSearchController = _SearchController;
```

It registers `POST /search` (request body is the mode-discriminated schema, so validation and OpenAPI come for free and the handler dispatches to `repository.search`) and `POST /multi-search` (dispatches to `dataSource.multiSearch`). For anything the factory does not cover, write a custom `BaseRestController` calling `repository.search()` or `getClient()` directly.

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
