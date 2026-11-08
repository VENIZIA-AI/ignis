# Search & Typesense

IGNIS ships a **typesense connector** under `@venizia/ignis-connectors/typesense` for full-text and faceted search. It plugs into the same `@model`/`@repository`/`@datasource` decorators as the PostgreSQL connector. Documents replace Drizzle tables, and the query surface is intentionally narrower - search engines are not relational databases.

> [!IMPORTANT] Subpath-only import
> `typesense` is an **optional peer dependency**. Unlike `postgres`, the typesense connector is not re-exported from the `@venizia/ignis` root barrel, so apps that don't use search never pull in the `typesense` client. Always import from `@venizia/ignis-connectors/typesense`:
>
> ```typescript
> import {
>   TypesenseDataSource,
>   BaseSearchEntity,
>   SearchCollectionFactory,
>   field,
> } from '@venizia/ignis-connectors/typesense';
> ```
>
> See [Connectors](/references/base/connectors) for the full dual-door export model.

## Defining a Search Collection

Instead of a Drizzle `pgTable`, define a collection with `SearchCollectionFactory.define` and the `field` DSL:

```typescript
// src/models/entities/article.model.ts
import { model } from '@venizia/ignis';
import {
  BaseSearchEntity,
  SearchCollectionFactory,
  field,
  TSearchDocument,
} from '@venizia/ignis-connectors/typesense';

@model({
  settings: {
    properties: { hidden: ['internalNote'] },
    query: {
      filter: { where: { status: 'published' } },
      limit: { default: 20 },
    },
  },
})
export class ArticleDocument extends BaseSearchEntity<typeof ArticleDocument.schema> {
  static override schema = SearchCollectionFactory.define({
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

The same `@model` settings you use with Drizzle entities - `properties.hidden`, `query.filter`, `query.limit.default` - work identically here. `properties.hidden` compiles to Typesense's `exclude_fields`; `query.filter.where` is AND-merged into every read's `filter_by` unless the caller passes `shouldSkipDefaultFilter: true`.

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

Each `flags` object may set `searchable`, `filterable`, `facet`, `sortable`, `optional` and `nullable` (all `boolean`; `nullable` needs `optional: true`, see [Nullable fields](#nullable-fields)). Note: `searchable`/`filterable` have no direct Typesense wire equivalent - Typesense indexes every field by default - so they're dropped at compile time. Only `facet`, `optional`, and `sortable` (mapped to Typesense's `sort`) actually reach the compiled collection schema. They're still worth setting for documentation/intent and for future engines that do distinguish them.

`SearchCollectionFactory.define` validates at call time: throws on an empty `name`, empty `fields`, duplicate field names, a non-`string` `id` field, an unknown `defaultSort` field reference, or a `nullable` field that is not `optional`.

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

### Nullable fields

Typesense keeps no null. A document written with `note: null` comes back without the `note` key, so a schema that says `note` is `string | null` rejects the row. Declare the field `nullable`:

```typescript
field.string('note', { optional: true, nullable: true }),
field.string('nickname', { optional: true }),
```

| Field | Document type | Read when the key is absent |
|---|---|---|
| `{ optional: true, nullable: true }` | `note?: string \| null` | `null` |
| `{ optional: true }` | `nickname?: string` | absent |

A read returns `null` for a nullable field whose key is absent: `find`, `findOne`, `findById`, `search` (keyword, semantic and hybrid hits) and `suggest`. So do the documents that `create`, `createAll` and `updateById` return, so a created document and a found one have the same shape. `mode: 'raw'` and the cross-collection `multiSearch` are passthrough and fill nothing. A field selection (`filter.fields`, `includeFields`) limits the fill to the selected fields, so a field you did not select stays absent. Select with `filter.fields`: a selection set only through `engineParams` (`include_fields`, `exclude_fields`) is not seen by the fill, and neither is a dotted path, so a nullable field it leaves out still reads as `null`. A hidden field stays hidden. Writes are unchanged: `nullable` is never sent to Typesense.

A stored `null` and a field that was never set look the same after a round trip: both come back `null`. If the two must differ, store a sentinel value instead.

`SearchCollectionFactory.deriveDocumentSchema` follows the flag. The `select` schema accepts `null` or an absent key and gives `null` for an absent one. The `create` and `update` schemas accept `null`, a value or an absent key, and leave an absent key absent.

The fill lives in the engine-neutral repository, so it applies on Meilisearch too: a nullable field always reads as `T | null`, never absent. Meilisearch keeps nulls, so a stored `null` stays `null`, and a field that was never set also becomes `null`. The compiled index is the same with or without the flag.

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

The `model` config is camelCase and maps to Typesense's snake_case `model_config` at compile time (`name` becomes `model_name`, `apiKey` becomes `api_key`, `accessToken` becomes `access_token`, and so on). Any provider field not modeled is passed through unchanged. Never hardcode `apiKey` into a committed schema - source it from an environment variable.

**Client-provided vectors** - you compute the embedding yourself and send it with each document. Declare `dimensions` and a distance metric instead of `embed`:

```typescript
import { VectorDistances } from '@venizia/ignis-connectors/typesense';

field.vector('embedding', { dimensions: 384, distance: VectorDistances.COSINE });
// VectorDistances: COSINE ('cosine'), INNER_PRODUCT ('ip'), L2 ('l2')
```

An auto-embedded field (one with `embed`) is **omitted from `TSearchDocument`** - the server owns it, so it never appears in your create/update payloads. A client-provided vector field (dimensions only, no `embed`) stays in the document type as `number[]`.

See [Searching](#searching-with-search-mode) for querying these fields with `mode: 'semantic'` and `mode: 'hybrid'`.

## Synonyms

Declare synonym sets on the collection; they are provisioned alongside it at `configure()`:

```typescript
static override schema = SearchCollectionFactory.define({
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

Declarative `synonyms` are provisioned as one **synonym set** per collection (named `<collection>_synonyms`) and linked to it. That matches Typesense v30+'s global synonym-sets model - the pre-v30 per-collection synonyms API was removed. For runtime management outside the declarative schema, the connector exposes the synonym-set verbs through the raw client escape hatch:

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
import { datasource } from '@venizia/ignis';
import { TypesenseDataSource } from '@venizia/ignis-connectors/typesense';
import { applicationEnvironment, ParseUtility } from '@venizia/ignis-helpers';

@datasource()
export class SearchDataSource extends TypesenseDataSource {
  constructor() {
    super({
      name: SearchDataSource.name,
      config: {
        nodes: [
          {
            host: applicationEnvironment.get<string>('APP_ENV_TYPESENSE_HOST'),
            port: ParseUtility.toInt({ input: applicationEnvironment.get<string>('APP_ENV_TYPESENSE_PORT') }),
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

No `driver` in the decorator, and that is not an omission. A relational datasource has to name one, because a single `BasePostgresDataSource` runs on either `pg` or `postgres` and something must pick. A search datasource has already picked: `extends TypesenseDataSource` **is** the engine reference, and it is what carries the `typesense` package into your bundle. Naming the engine twice would just be a second chance to disagree with yourself.

`TypesenseDataSource` extends `BaseSearchDataSource` (adds auto-discovery/provisioning) which extends `AbstractSearchDataSource` (engine contract: `getConnector()`, `getQueryDialect()`, `compileCollection()`, `ensureCollection()`, `multiSearch()`) which extends the engine-neutral `AbstractDataSource`. Since `TypesenseDataSource` never overrides `beginTransaction()`, it inherits the neutral `NotSupported` default - see [Connectors](/references/base/connectors).

Auto-provisioning is **off by default**. Turn it on by constructing the datasource with `autoProvision: true`, or by setting `APP_ENV_AUTO_PROVISION_COLLECTION=true`. With it on, `configure()` provisions every discovered collection (`ensureCollection()` per definition, plus any declared `synonyms`).

`getCapabilities()` reports what the engine supports so callers can probe before relying on a feature across engines:

```typescript
dataSource.getCapabilities();
// { transactions: false, search: { vector: true, multi: true, union: true, synonyms: true } }
```

## Repository Tiers

Mirrors the PostgreSQL connector's ladder, but for documents instead of rows:

```
AbstractRepository (engine-neutral)
  -> SearchBaseRepository (narrows dataSource/entity to AbstractSearchDataSource/BaseSearchEntity)
       also exported as TypesenseBaseRepository
    -> ReadableSearchRepository (count, existsWith, find, findOne, findById, search<TResult>(),
                                 searchCount, facets, suggest)
      -> PersistableSearchRepository (create, createAll, updateById, updateBy,
                                      deleteById, deleteBy, import)
        -> DefaultSearchRepository (convenience alias, adds nothing)
```

```typescript
// src/repositories/article.repository.ts
import { SearchDataSource } from '@/datasources/search.datasource';
import { ArticleDocument, TArticleDocument } from '@/models/entities';
import { repository } from '@venizia/ignis';
import { DefaultSearchRepository } from '@venizia/ignis-connectors/typesense';

@repository({ model: ArticleDocument, dataSource: SearchDataSource })
export class ArticleRepository extends DefaultSearchRepository<TArticleDocument> {
  findByCategory(opts: { category: string }) {
    return this.find({ filter: { where: { category: opts.category } } });
  }
}
```

`find()`/`findOne()`/`findById()`/`count()`/`existsWith()` accept the same `TFilter`/`TWhere` shape as PostgreSQL repositories. The `TypesenseQueryDialect` translates `where` into Typesense's `filter_by` syntax, `order` into `sort_by` (max 3 fields - a Typesense limit), `limit`/`skip` into `per_page`/`page`, and `fields` into `include_fields`. `filter.include` is **not supported** and throws - there is no relation model for documents.

One repository per collection is the intended shape: the repository knows its model, its default filter and its hidden fields. When the collection is only known at runtime, such as a registry that picks it by name, call the connector instead. Its methods take `collection`: `dataSource.getConnector().search({ collection, params })`. The connector applies no model, so no default filter and no hidden fields.

Search engines index asynchronously, so a document can be missing right after a write. `find()`/`findOne()`/`findById()` accept the same `options.retry` as PostgreSQL - re-read until the document shows up:

```typescript
const article = await articleRepository.findById({
  id,
  options: { retry: { maxAttempts: 4 } },
});
```

Same options, same rules as PostgreSQL - see [Read Retry](/references/base/repositories/advanced#read-retry-replica-lag). The only difference is moot: retry skips inside a transaction, and search has no transactions to begin with.

### Envelope differences vs. PostgreSQL

|                                            | PostgreSQL repositories                             | Search repositories                                                                                                                            |
| ------------------------------------------ | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Range queries                              | Extra `COUNT(*)` query for `shouldQueryRange: true` | Single search call already returns `found` - no second query needed                                                                            |
| `updateBy`/`deleteBy` with empty `where` | Requires `force: true`                              | `updateBy` **refuses** an unfiltered bulk update outright (throws, no override). `deleteBy` with no effective filter (no `where` and no `@model` `query.filter`) also throws. Passing `options.force: true` truncates the whole collection instead |
| Returning updated/deleted rows             | Native SQL `RETURNING`                              | No `RETURNING` equivalent - `updateBy`/`deleteBy` are **count-only**: `data` is always `null` and `shouldReturn` is rejected at the type level (no hidden engine read is bolted on). Read the affected documents explicitly before the write when you need them |
| `createAll`                                | Native bulk insert, returns each row                | Delegates to Typesense's bulk import; "created" rows are the input rows whose per-row response didn't report `success: false`                  |

### Write error semantics (shared by both search engines)

- **`create()` with a duplicate id throws `409`** (`normalized.code: 'core.search_engine.already_exists'`) on both Typesense and Meilisearch. A duplicate is a conflict, never a silent overwrite.
- For last-write-wins, drop to the connector. There is no repository `upsert()`: `this.connector.document.upsert({ collection: this.collectionName, document })` is the call.
- On Meilisearch, the duplicate pre-check is not atomic, so two concurrent creates of the same id can both pass it. See the [Meilisearch guide](./search-meilisearch) and use the connector upsert when that's possible.
- **`updateById()` against a missing id throws `404` (`normalized.code: 'core.search_engine.not_found'`)** on both engines. This is the deliberate divergence from the PostgreSQL connector, where a missing-id `updateById` is a silent `{ count: 0 }`.
- **`deleteById()` against a missing id is silent** (`{ count: 0, data: null }`), matching the relational connectors.
- **A request the engine rejects is a 4xx, not a 503.** A 400 or 422 throws that status with the engine message kept, a 404 the verb does not tolerate throws `404 core.search_engine.not_found`, and a 409 throws `409 core.search_engine.already_exists`. Only a transport failure, a 5xx, a 401/403, a 408 or a 429 throws the sanitized `503 core.search_engine.dependency_unavailable`.
- **Typesense `import` does not throw `ImportError`.** The connector passes `throwOnFail: false`, so a rejected row is in `count.fail` and `responses` of the result.

## Searching with `search({ mode })`

Beyond the `find()` tier (filter-only reads that return documents), `search()` is the search-engine entry point. It is one method whose shape is selected by `mode`, so TypeScript narrows the options to just that mode's fields. You never juggle every parameter at once. `mode` defaults to `keyword`.

The `keyword`/`semantic`/`hybrid` modes reuse the same filter translation as `find()` (`@model` `query.filter`, `properties.hidden`, `where`/`order`/`limit`), then layer the search term or vector on top. The `raw` mode is a full passthrough with no translation.

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
> `semantic` and `hybrid` default `prefix=false`: prefix matching is meaningless for vector search. Remote embedders (OpenAI/Google/...) reject it too (`Prefix search is not supported for remote embedders`). Pass `engineParams: { prefix: true }` to override.

**`raw`** - native Typesense params, no `TFilter`/`query.filter`/`properties.hidden` translation. Use it for any engine feature the modes above do not model:

```typescript
await repository.search({
  mode: 'raw',
  params: { q: '*', filter_by: 'price:>100', vector_query: 'embedding:([...], k:10)' },
});
```

> [!NOTE]
> `raw` skips `@model` `query.filter`, so it can surface documents the `find()`/`keyword` tiers would hide (for example non-`published` articles). Apply any tenant or visibility filtering explicitly in `params.filter_by` when exposing raw search over HTTP.

All non-`raw` modes accept the same optional camelCase tuning fields, mapped to Typesense's snake_case at the dialect boundary. That covers faceting (`facetBy`, `facetQuery`, `maxFacetValues`), highlighting (`highlightFields`, `highlightFullFields`, `highlightStartTag`/`highlightEndTag`, `snippetThreshold`), grouping (`groupBy`, `groupLimit`, `groupMissingValues`), and `queryByWeights`. These are the ENGINE-NEUTRAL fields - every search engine supports them.

Typesense-specific tuning goes through `engineParams`, because the neutral input schema carries no knob that only one engine understands. Thirteen of those knobs have a camelCase name, typed by `ITypesenseTuning`: `numTypos`, `dropTokensThreshold`, `typoTokensThreshold`, `infix`, `prioritizeExactMatch`, `prioritizeTokenPosition`, `prioritizeNumMatchingFields`, `textMatchType`, `rerankHybridMatches`, `useCache`, `cacheTtl`, `maxCandidates` and `sortBy` (see [Sorts `filter.order` cannot name](#sorts-filter-order-cannot-name)). A list sets `numTypos` or `infix` per `queryBy` field. The numeric ones must be non-negative integers (`maxCandidates` a positive one), under either spelling; anything else throws before a request, and so does giving one param twice (`numTypos` and `num_typos`). `useCache` and `cacheTtl` are sent as multi-search query parameters, where Typesense reads them. Every other knob (`prefix`, `exhaustive_search`, `pinned_hits`, `hidden_hits`, `preset`, ...) keeps its wire name, and wire names are passed verbatim:

```typescript
import type { ITypesenseTuning } from '@venizia/ignis-connectors/typesense';

const tuning: ITypesenseTuning = { numTypos: 1, infix: 'fallback' };

await repository.search({
  mode: 'keyword',
  query: 'shoes',
  queryBy: ['name'],
  engineParams: { ...tuning, preset: 'listing' },
});
```

`engineParams` is the one door to the engine's own parameters, so over HTTP every search controller refuses it, scoped or not (`400`), unless the controller lists the parameters a caller may send: see [Engine parameters over HTTP](#engine-parameters-over-http). A repository call from server code takes it as shown here.

Sorting by a declared field is `filter.order` in the neutral input, and the dialect sends it as `sort_by` (at most three fields, each one the collection declares; a string field also needs `sortable: true`, which Typesense checks). `suggest()` takes no `order`, so its documents come back in relevance order unless you pass `sortBy`.

### Sorts `filter.order` cannot name

`filter.order` accepts declared fields only, so `_text_match` and `_eval(...)` get a `400`. Give Typesense's own `sort_by` string as `sortBy` in `engineParams`:

```typescript
await repository.search({
  mode: 'keyword',
  query: 'shoes',
  queryBy: ['name'],
  engineParams: {
    sortBy: '_text_match:desc,_eval([(status:=ACTIVATED):1]):desc,createdAt:desc',
  },
});
```

`search()`, `searchCount()`, `facets()` and `suggest()` take it. The dialect checks three things before a request, and nothing else:

| Rule | Why |
|---|---|
| A non-empty, balanced string | An empty `sort_by` is a mistake, not "no sort"; a stray bracket or backtick would hide the entry count |
| At most three top-level entries | Typesense's limit; `_eval(...)` counts as one, however many commas it holds |
| Given once | `sortBy` with `filter.order`, or with `sort_by`, throws instead of letting one win |

Field names and the inside of an `_eval` expression are Typesense's to check. A search controller refuses `engineParams` over HTTP, `sortBy` included. Meilisearch has no `sortBy` equivalent. Its neutral `order` also accepts declared fields only: an undeclared one gets the same `400` before the engine is called.

`searchCount()`, `facets()` and `suggest()` take the same `engineParams`, checked and sent the same way, so they match what a `search()` with that tuning matches. Without it, a count, a facet or a suggestion can differ from the search beside it (an accented query that finds unaccented names in `search()` finds none in `suggest()`). Repository methods are not routes, so the scoped-controller refusal is unchanged: a search controller's routes call `search()` and `multiSearch()` only, and a scoped one still answers `400` to `engineParams` on `/search`.

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

A keyword search also takes `highlight: false`, which returns no highlight markup (Typesense `highlight_fields: none`) and wins over `highlightFields`.

### Vietnamese and other diacritics

A query typed without diacritics can miss text that has them. Typesense documents the fold only for a field with no `locale`, which it treats as English: "diacritics (accent marks) are automatically removed from European accented characters". A field with a non-English `locale` keeps its diacritics, so a `locale` is not the fix. It also sits outside the `field` DSL, which takes no `locale`.

The letters outside that fold are the ones to check on your own data. For Vietnamese, a collection indexed as English was measured to fold `à`, `á`, `ê` and `đ` but not `ơ`, `ư` or the dotted and hooked vowels (`ạ`, `ả`, `ị`, `ọ`, `ở`, `ứ`): `sữa` found 325 documents and `sua` found 1. Typesense's docs do not list the letters, so treat that as a measurement, not a guarantee, and repeat it on your version.

The recipe is a folded shadow field. Strip the diacritics when you write the document, store the result in a second field and put both in `queryBy`:

```typescript
class Diacritics {
  static fold(text: string): string {
    return text
      .normalize('NFD')
      .replace(/\p{M}+/gu, '') // the combining marks, horns included
      .replaceAll('đ', 'd')
      .replaceAll('Đ', 'D')
      .normalize('NFC');
  }
}

// in the collection: field.string('title', { searchable: true }), field.string('titleFolded', { searchable: true })
await repository.create({
  data: { title: 'Sữa tươi', titleFolded: Diacritics.fold('Sữa tươi') }, // 'Sua tuoi'
});

await repository.search({
  mode: 'keyword',
  query: 'sua',
  queryBy: ['title', 'titleFolded'],
  queryByWeights: [2, 1], // an exact accented match ranks first
});
```

`đ` has no decomposition, so it is replaced by hand; every other letter above decomposes into a base letter and combining marks. A query typed with diacritics still matches `title`, so the query needs no folding. Two things to know:

- **Leave the shadow field visible.** `search()` refuses a field the model hides (`properties.hidden`) in `queryBy`, so hiding `titleFolded` would block it. Choose the fields you return with `filter.fields` (`includeFields` in `suggest()`) instead.
- **Index it from the same write.** A folded field that is not updated with `title` goes stale; compute it in the one place that writes the document, and fold again when you re-import.

### Count a search with `searchCount()`

`count({ where })` counts by filter only, and it is always exact. `searchCount()` counts what a text query matches:

```typescript
const { count, isFoundExact } = await articleRepository.searchCount({
  query: 'renewable',
  queryBy: ['title', 'content'], // omit it to use the model's defaultQueryBy
  where: { published: true },
});
```

It is a search with a page of 0, so `count` is the engine's `found`. When the engine stops early (`search_cutoff`), `isFoundExact` is `false` and `count` is an estimate. A `where` that matches nothing answers `{ count: 0, isFoundExact: true }` without calling the engine, and so does a collection that does not exist yet.

### Facets without hits with `facets()`

`facets()` returns the counts of one or more fields and no documents:

```typescript
const { facets, found } = await articleRepository.facets({
  facetBy: ['category', 'author'],
  query: 'renewable', // optional, '*' when omitted
  queryBy: ['title'],
  where: { published: true },
  maxFacetValues: 20, // values per field
  facetQuery: 'category:ener', // narrow one field's values by a prefix
});
```

`facetBy` must name at least one field and `maxFacetValues` must be a positive integer; either breach throws before a request. A field the model hides (`properties.hidden`) cannot be named in `facetBy`, in `facetQuery`, in `queryBy`, in `groupBy` or in `highlightFields` / `highlightFullFields`, here or in `search()`, because a count, a match, a group key or a highlight on it would tell the caller what it holds. `facets` is empty when the engine returned none. Meilisearch refuses `maxFacetValues` and `facetQuery`.

### Autocomplete with `suggest()`

`suggest()` is the call behind a search box: the documents that match what the user has typed so far.

```typescript
const articles = await articleRepository.suggest({
  query: 'renew',
  queryBy: ['title'], // omit it to use the model's defaultQueryBy
  limit: 5, // 8 when omitted
  includeFields: ['id', 'title'],
  where: { published: true },
});
```

It is a keyword search, never semantic, with highlighting off and a small page. The last word matches as a prefix, which both engines do by default. A blank `query` answers `[]` without calling the engine. `limit` must be a positive integer and stays under the model's `settings.query.limit.max`.

### The result envelope

`search()` returns the engine's search envelope (unlike `find()`, which returns documents):

```typescript
interface ISearchResult<TDocument extends object = object> {
  found: number;
  isFoundExact: boolean;
  outOf?: number;
  searchTimeMs?: number;
  hits?: Array<{
    document: TDocument;
    highlight?: unknown;
    highlights?: unknown[];
    score?: number;
    rankFusionScore?: number;
    vectorDistance?: number;
  }>;
  facetCounts?: ISearchFacetCount[];
  groupedHits?: unknown[];
}

interface ISearchFacetCount {
  fieldName: string;
  counts: Array<{ value: string; count: number; highlighted?: string }>;
  sampled?: boolean;
  stats?: { avg?: number; max?: number; min?: number; sum?: number; totalValues?: number };
}
```

`isFoundExact` is required, and it is the field to read before trusting `found`. There is no `textMatch` field; the per-hit relevance number is `score`, and it is the keyword match score in every mode, hybrid included. A hybrid or vector hit also carries `rankFusionScore` and `vectorDistance`. Facet `value` is always a string, numbers included; `stats` is set only for a numeric field.

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

> [!NOTE]
> `multiSearch` injects each collection's `@model properties.hidden` into that entry's `excludeFields` automatically. Hidden fields never leak on the multi-search route, just as they don't on single-collection `search()`. An entry naming a collection IGNIS did not discover (not a bound `@repository` model) passes through untouched: the **caller owns exclusion** for unknown collections. The raw `getConnector().multiSearch(...)` escape hatch performs no injection at all.

## Search Controller Factory

`SearchControllerFactory.defineSearchController` generates turnkey search endpoints, mirroring how `ControllerFactory.defineCrudController` generates CRUD endpoints:

```typescript
// src/controllers/search.controller.ts
import { ArticleDocument } from '@/models/entities';
import { ArticleRepository } from '@/repositories';
import { controller } from '@venizia/ignis';
import { SearchControllerFactory } from '@venizia/ignis-connectors/typesense/controllers';

const BaseSearchController = SearchControllerFactory.defineSearchController({
  entity: ArticleDocument,
  repository: { name: ArticleRepository.name },
  controller: { name: 'ArticleSearchController', basePath: '/articles' },
  // routes: { multiSearch: { enabled: false } },  // each route is customizable / disable-able
});

@controller({ path: '/articles' })
export class ArticleSearchController extends BaseSearchController {}
```

The subclass needs no constructor. The factory injects the repository bound under `repository.name`, the same way `defineCrudController` does. To inject a different repository, declare your own constructor with `@inject` on its first parameter - that wins.

Import the factory from `@venizia/ignis-connectors/typesense/controllers` (or `@venizia/ignis-connectors/search/controllers`), never from `@venizia/ignis-connectors/typesense`. That entry loads without `hono`, so it carries no controller.

It registers `POST /search` (request body is the mode-discriminated schema, so validation and OpenAPI come for free, and the handler dispatches to `repository.search`). It also registers `POST /multi-search`, which dispatches to `dataSource.multiSearch`. `mode: 'raw'` and multi-search answer `400` until the controller opts in: see [Raw mode and multi-search over HTTP](#raw-mode-and-multi-search-over-http). For anything the factory does not cover, write a custom `BaseRestController` calling `repository.search()` or `getClient()` directly.

### Scope the search per request

Search repositories ignore the `@model` `access` setting (a model that sets it refuses to boot), so a search route sees every document unless you scope it. Give the factory a `scope`: a function of the request context that returns the filter this caller may search within.

```typescript
import { Authentication, ScopeFilters } from '@venizia/ignis';

const ScopedSearchController = SearchControllerFactory.defineSearchController({
  entity: ArticleDocument,
  repository: { name: ArticleRepository.name },
  controller: { name: 'ArticleSearchController', basePath: '/articles' },
  routes: { multiSearch: { enabled: false } }, // a scoped controller cannot serve multi-search
  scope: ({ context }) => {
    const user = context.get(Authentication.CURRENT_USER);

    if (user?.isAdmin) {
      return ScopeFilters.UNRESTRICTED;
    }

    return user?.merchantId ? { merchantId: user.merchantId } : null; // null refuses the request (403)
  },
});
```

| `scope` returns | The request |
|---|---|
| A `where` | The server ANDs it into `input.filter.where`. The client's own `where` sits inside the AND, so it can narrow the scope and never widen or remove it |
| `ScopeFilters.UNRESTRICTED` | No scope for this call (an admin, a system job) |
| `null`, `undefined`, or it throws | Refused with `403`; nothing is searched |

A scope is a `where` ANDed into a filter, so the three inputs that carry the engine's own filter string cannot take one. A scoped controller therefore refuses `mode: 'raw'` (`400`), and `defineSearchController` throws unless `routes.multiSearch.enabled` is `false`. Every controller refuses `mode: 'raw'`, multi-search and `engineParams` unless it opts in, see below.

### Engine parameters over HTTP

A search request's `engineParams` hands the engine its own wire parameters. It could replace the controller's own `filter_by` and name fields the model hides, so a search controller, scoped or not, refuses a request that carries it with `400 engineParams is not available on this search controller`, in `search` and in every entry of `multi-search`. The key alone is the request: an empty `engineParams: {}` is refused too.

A controller that wants callers to tune something lists the parameters:

```typescript
SearchControllerFactory.defineSearchController({
  entity: ProductDocument,
  repository: { name: ProductSearchRepository.name },
  controller: { name: 'ProductSearchController', basePath: '/products' },
  engineParams: { allow: ['typo_tokens_threshold', 'num_typos'] },
});
```

- **Names compare in one spelling.** `num_typos`, `numTypos` and `NUM_TYPOS` are one name.
- **Anything else is a `400`**, naming the parameters it refused.
- **A parameter that selects rows or fields, or orders them, can never be listed.** `filter_by`, `include_fields`, `exclude_fields`, `query_by`, `facet_by`, `group_by`, `highlight_fields`, `sort_by`, `preset`, `pinned_hits`, `vector_query` and their Meilisearch counterparts (`filter`, `attributesToRetrieve`, `facets`, `sort`, ...). `defineSearchController` throws when the list holds one.
- **Server code is not affected.** `repository.search({ ..., engineParams })` takes any parameter, as before.

### Raw mode and multi-search over HTTP

`mode: 'raw'` and a multi-search entry hand the engine their parameters as they are. The model's default filter and its hidden fields are not applied to them, and a multi-search entry can name any collection. So every generated search controller answers `400` to both, scoped or not, until it opts in:

```typescript
SearchControllerFactory.defineSearchController({
  entity: ProductDocument,
  repository: { name: ProductSearchRepository.name },
  controller: { name: 'ProductSearchController', basePath: '/products' },
  modes: { raw: { allow: true } },
});
```

> [!WARNING]
> `modes.raw.allow: true` exposes the whole collection to every caller the route admits, including the fields the model hides and the rows its default filter leaves out. Opt in only for a route that only trusted callers reach (an internal tool behind its own authorization).

- **A scoped controller cannot opt in.** The scope cannot be applied to the engine's own parameters, so `defineSearchController` throws when `scope` and `modes.raw.allow` are both set.
- **Server code is not affected.** `repository.search({ mode: 'raw' })` and `dataSource.multiSearch()` work as before.

## Big collections: streaming export, timeouts and import errors

These are methods of the connector (`dataSource.getConnector()`), not of the repository.

**Stream an export instead of building one string.** `exportDocuments` returns the whole export as one string, which breaks past the string limit (on Bun a string holds at most 2^31 - 1 characters, about 2 GiB of ASCII text). `streamDocuments` is an async iterable of NDJSON lines, one document per line without its newline, read as the engine sends them; memory stays at one chunk and one partial line, so you can write to disk as it arrives:

```typescript
const connector = dataSource.getConnector();
const file = Bun.file('products.ndjson').writer();

for await (const line of connector.streamDocuments({
  collection: 'products',
  excludeFields: ['embedding'],
  timeoutMs: 30 * 60 * 1000,
})) {
  file.write(`${line}\n`);
}

await file.end();
```

A failure before the first line throws as `exportDocuments` does; one in the middle throws from the loop, after the lines you already have.

**`excludeFields` next to `includeFields`.** Both `exportDocuments` and `streamDocuments` take `filterBy`, `includeFields` and `excludeFields`. A copy job drops its vector fields with `excludeFields: ['embedding']`. `search()` already takes `excludeFields` (and the model's `properties.hidden` are added to it).

**A timeout for one call.** The client has one timeout (`connectionTimeoutSeconds`, 5 s by default). `timeoutMs` (a positive integer of milliseconds) overrides it for one call of `exportDocuments`, `streamDocuments`, `importDocuments`, `getCollection`, `createCollection` and `patchCollectionSchema`. It is how long to wait for the engine's answer (an import answers once the batch is processed; a schema change once it is applied) and then the longest silence on the connection: it is not a deadline for the whole transfer, so a download that keeps arriving never trips it. `typesense-js` has no timeout per call, so the connector runs that call on a second client with the timeout set; when you give the connector your own `client`, also pass `createClient` in its options, or a call with `timeoutMs` is refused. A client you wrote yourself also needs `documents().exportStream`.

**A stream whose reader pauses.** A stream you stop reading is a connection that falls silent, and the engine's socket is closed after `timeoutMs` of it. If you import each batch while you read, the import must finish within the stream's `timeoutMs`; otherwise spool the stream to a file first and import from the file. A copy of a collection is `getCollection`, `createCollection`, `streamDocuments` to a file, then `importDocuments` from it.

**Fail on a partial import.** `importDocuments` returns rejected rows in `count.fail` and `responses` and does not throw. Pass `throwOnFail: true` to get a `422` after the last batch instead, with the counts in `extra.details` and every per-row response on the error's `responses` (they hold the rejected documents, so they are not in `extra`, which goes on the wire).

**A missing document as `null`.** `getDocument` throws `404 core.search_engine.not_found`. `findDocument({ collection, id })` (also `document.find`) returns `null` for a missing document, the way `getAlias` does, and throws for any other failure. A missing collection is a 404 too, so a mistyped collection name also answers `null`.

**`updateByFilter` refuses an empty `document`** with a `400` before it calls the engine.

## Transactions and Locking

The typesense connector has no transaction or row-level-locking model. Passing a `transaction` or `lock` option to any repository method throws:

```typescript
await articleRepository.updateById({
  id: '123',
  data: { title: 'New' },
  options: { transaction: tx }, // throws: 501, normalized.code 'core.not_supported'
});
```

This is the same `NotSupportedUtility.throwNotSupported` convention used everywhere in the framework for capabilities an engine doesn't implement - see [Connectors](/references/base/connectors) and [Transactions](./transactions).

## See Also

- **Related Concepts:**
  - [Connectors](/references/base/connectors) - Base-vs-connectors architecture, dual-door exports
  - [DataSources](/references/base/datasources) - Engine-neutral DataSource contract + PostgreSQL connector
  - [Repositories](/references/base/repositories/) - PostgreSQL connector repository reference (for comparison)
  - [Models](./models) - `@model` settings shared across connectors

- **Example App:**
  - `examples/typesense-search/` - Full end-to-end app (model, datasource, repository, CRUD + search controllers)
