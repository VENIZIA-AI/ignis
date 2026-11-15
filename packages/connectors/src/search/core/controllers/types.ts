import type { z } from '@hono/zod-openapi';
import type { TOrderEntry } from '@venizia/ignis-filter';
import type { TCrudRepositoryClass, TRouteContext } from '@venizia/ignis-kernel';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import type { Env } from 'hono';
import type { ISearchResult } from '@/search/core/connector';
import type { TSearchInput } from '@/search/core/repositories/common';

/** A field name of the search document. */
export type TSearchField<Document> = keyof Document & string;

/** The tuning knobs of the engine a repository's datasource binds with `$inferTuning`; `never` for a datasource that binds none, which closes `query.tuning`. */
export type TRepositoryTuning<Repository extends TCrudRepositoryClass> =
  InstanceType<Repository> extends { dataSource: { $inferTuning?: infer Tuning } }
    ? unknown extends Tuning
      ? never
      : Tuning extends object
        ? Tuning
        : never
    : never;

/** `Tuning` for one query: a list-valued knob (`numTypos`, `infix`) is written as a record keyed by field name, so it cannot drift from `queryBy`. */
export type TSearchTuningInput<Document, Tuning extends object> = {
  [Key in keyof Tuning]?: Tuning[Key] extends infer Value
    ? Value extends readonly (infer Item)[]
      ? Partial<Record<TSearchField<Document>, Item>>
      : Value
    : never;
};

/** What the application chooses for a query. Every name is camelCase and typed against the document. */
export interface ISearchQuerySettings<Document extends object, Tuning extends object> {
  /** The text fields searched, in order. Keyword and hybrid only: semantic search has none. */
  queryBy?: Array<TSearchField<Document>>;

  /** The weight of each `queryBy` field, by name: the controller writes the positional list the engine wants. Name every `queryBy` field. */
  queryByWeights?: Partial<Record<TSearchField<Document>, number>>;

  /** Typed order entries (`'price'`, `'price DESC'`). Give it instead of a `tuning.sortBy`, never with it. */
  order?: Array<TOrderEntry<Document>>;

  /** The engine's typed tuning knobs. Absent for a datasource that binds none. */
  tuning?: [Tuning] extends [never] ? never : TSearchTuningInput<Document, Tuning>;
}

/**
 * A value, or a function of the request: its `input` is the validated, scoped, typed body, as `scope` reads it. TypeScript widens
 * a string literal a function returns inside a generic call: write `'off' as const`, or pass the repository to `build<typeof Repository>`.
 */
export type TSearchSettingsSource<
  Document extends object,
  Tuning extends object,
  RouteEnv extends Env = Env,
  TExtra extends object = {},
> =
  | ISearchQuerySettings<Document, Tuning>
  | ((opts: {
      context: TRouteContext<RouteEnv>;
      input: Exclude<TSearchInput, { mode: 'raw' }> & TExtra;
    }) => ValueOrPromise<ISearchQuerySettings<Document, Tuning>>);

/** The keys `request.body.extend` adds to the body: none for an empty shape, so a function source's `input` is not intersected with an index signature. */
export type TSearchExtra<Shape extends z.ZodRawShape> = {} extends Shape
  ? {}
  : z.infer<z.ZodObject<Shape>>;

/** The `query` option: what the server decides for a query, and what a client may still send. */
export interface ISearchQueryOptions<
  Document extends object,
  Tuning extends object,
  TExtra extends object = {},
> {
  /** Wins over the client. A client value for a fixed setting is refused (400). */
  fixed?: TSearchSettingsSource<Document, Tuning, Env, TExtra>;

  /** Used when the client sent nothing for that setting; above the model's `defaultQueryBy`. */
  default?: TSearchSettingsSource<Document, Tuning, Env, TExtra>;

  /** What a client may send. `tuning` names the knobs a request's `engineParams` may carry; a name is fixed or allowed, never both. */
  allow?: { tuning?: Array<Exclude<keyof Tuning & string, 'sortBy'>> };
}

/** One hit of a search response. */
export type TSearchHit<Document extends object> = NonNullable<
  ISearchResult<Document>['hits']
>[number];

/** The `response` option when it is on: reshapes the hits before they leave the route. */
export interface ISearchResponseTransform<Document extends object, TOutDocument extends object> {
  /** The documents of the response: it replaces the model's schema in the OpenAPI document, and every transformed document is parsed against it (a mismatch answers 500). */
  document: z.ZodType<TOutDocument>;

  /** May drop hits. `found` stays the engine's count. Never runs for `raw` mode. */
  transform: (opts: {
    hits: Array<TSearchHit<Document>>;
    found: number;
    context: TRouteContext<Env>;
    input: Exclude<TSearchInput, { mode: 'raw' }>;
  }) => ValueOrPromise<Array<TSearchHit<TOutDocument>>>;
}
