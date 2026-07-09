import type { TNullable } from '@venizia/ignis-helpers';
import { getError } from '@venizia/ignis-helpers';
import type {
  IExtraOptions,
  TCount,
  TDataRange,
  TFilter,
  TWhere,
} from '@/base/repositories/common';
import { DEFAULT_LIMIT } from '@/base/repositories/common';
import type { IdType } from '@/base/models';
import type { ISearchResult } from '../../connector';
import type { ISearchQuery, TSearchInput } from '../common';
import { SearchModes } from '../common';
import { SearchBaseRepository } from './base';

/** Read-only search-repository tier - translates filters via the datasource's dialect and executes through the connector. */
export class ReadableSearchRepository<
  TDocument extends object = object,
> extends SearchBaseRepository<TDocument> {
  async count(opts: { where: TWhere; options?: IExtraOptions }): Promise<TCount> {
    this.assertNoTransaction(opts.options);
    this.assertNoLock(opts.options);

    const query = this.buildQuery({
      filter: { where: opts.where },
      shouldSkipDefaultFilter: opts.options?.shouldSkipDefaultFilter,
    });
    query.perPage = 0;

    const result = await this.connector.search({
      collection: this.collectionName,
      params: this.queryDialect.toWireParams({ query }),
    });

    return { count: result.found };
  }

  async existsWith(opts: { where: TWhere; options?: IExtraOptions }): Promise<boolean> {
    const { count } = await this.count(opts);
    return count > 0;
  }

  find<R = TDocument>(opts: {
    filter?: TFilter;
    options: IExtraOptions & { shouldQueryRange: true };
  }): Promise<{ data: Array<R>; range: TDataRange }>;

  find<R = TDocument>(opts?: {
    filter?: TFilter;
    options?: IExtraOptions & { shouldQueryRange?: false };
  }): Promise<Array<R>>;

  /** Bare array or `{ data, range }` per shouldQueryRange, postgres-shaped range. Typesense's `found`
   * already comes back in the same call as `hits`, so unlike SQL no second count query is needed. */
  async find<R = TDocument>(opts?: {
    filter?: TFilter;
    options?: IExtraOptions & { shouldQueryRange?: boolean };
  }): Promise<Array<R> | { data: Array<R>; range: TDataRange }> {
    const { filter, options } = opts ?? {};
    this.assertNoTransaction(options);
    this.assertNoLock(options);

    // Omitted limit falls back to @model settings.defaultLimit then DEFAULT_LIMIT, rather than leaving `per_page` unset (an unbounded query).
    const effectiveFilter: TFilter = {
      ...filter,
      limit: filter?.limit ?? this.defaultLimit ?? DEFAULT_LIMIT,
    };

    const query = this.buildQuery({
      filter: effectiveFilter,
      shouldSkipDefaultFilter: options?.shouldSkipDefaultFilter,
    });

    const result = await this.connector.search<TDocument>({
      collection: this.collectionName,
      params: this.queryDialect.toWireParams({ query }),
    });

    const { hits, found } = result;
    // An explicit `find<Other>()` call is the caller's own unchecked assertion (R defaults to TDocument).
    const data = (hits ?? []).map(hit => hit.document) as any;

    if (!options?.shouldQueryRange) {
      return data;
    }

    const start = effectiveFilter.skip ?? effectiveFilter.offset ?? 0;
    const end = data.length > 0 ? start + data.length - 1 : start;

    return { data, range: { start, end, total: found } };
  }

  async findOne<R = TDocument>(opts?: {
    filter?: TFilter;
    options?: IExtraOptions;
  }): Promise<TNullable<R>> {
    const { filter, options } = opts ?? {};
    const results = await this.find<R>({ filter: { ...filter, limit: 1 }, options });
    return results[0] ?? null;
  }

  /** Delegates to findOne with id in where - routes through buildQuery so hiddenFields/defaultFilter apply (a soft-deleted doc resolves to null, not fetched directly). */
  findById<R = TDocument>(opts: { id: IdType; options?: IExtraOptions }): Promise<TNullable<R>> {
    const { id, options } = opts;
    return this.findOne<R>({ filter: { where: { id } }, options });
  }

  /** Unified search entry point, discriminated by `mode`:
   * - `raw` - full-power passthrough straight to the connector, no dialect/defaultFilter/hiddenFields (unchanged legacy behavior).
   * - `keyword` - full-text search, `where`/`defaultFilter`/`hiddenFields` translated via the dialect same as `find()`.
   * - `semantic` - vector search; an explicit `nearVector` translates through the dialect, an omitted one falls back to `queryText` for server-side auto-embed.
   * - `hybrid` - keyword + vector combined via the dialect's `alpha`-weighted `vector_query`.
   *
   * `mode` is read once into a `const` so TypeScript's aliased-discriminant narrowing carries
   * through both the early `raw` return and the switch below - no casts needed. */
  async search<R extends object = TDocument>(
    opts: TSearchInput & { options?: IExtraOptions },
  ): Promise<ISearchResult<R>> {
    const { mode } = opts;

    if (mode === SearchModes.RAW) {
      return this.connector.search<R>({
        collection: this.collectionName,
        params: opts.params,
      });
    }

    this.assertNoTransaction(opts.options);
    this.assertNoLock(opts.options);

    const base = this.buildQuery({
      filter: opts.filter,
      shouldSkipDefaultFilter: opts.options?.shouldSkipDefaultFilter,
    });
    const params: ISearchQuery = { ...base };
    const dialect = this.queryDialect;

    switch (mode) {
      case SearchModes.KEYWORD: {
        if (opts.query) {
          params.q = opts.query;
        }
        if (opts.queryBy) {
          params.queryBy = opts.queryBy.join(',');
        }
        break;
      }
      case SearchModes.SEMANTIC: {
        // Vector search: prefix matching is meaningless, and remote embedders reject it outright
        // ("Prefix search is not supported for remote embedders"). Default off; caller can override.
        params.prefix = false;

        if (opts.nearVector) {
          params.vectorQuery = dialect.toVectorQuery({
            field: opts.vectorField,
            nearVector: opts.nearVector,
            k: opts.k,
            distanceThreshold: opts.distanceThreshold,
            ef: opts.ef,
          }).vectorQuery;
        } else if (opts.queryText) {
          // Auto-embed: the engine vectorizes queryText against vectorField; vector_query carries k.
          params.q = opts.queryText;
          params.queryBy = opts.vectorField;
          params.vectorQuery = dialect.toVectorQuery({
            field: opts.vectorField,
            k: opts.k,
            distanceThreshold: opts.distanceThreshold,
            ef: opts.ef,
          }).vectorQuery;
        } else {
          throw getError({
            message: `[ReadableSearchRepository][search] semantic mode requires 'nearVector' or 'queryText'`,
          });
        }
        break;
      }
      case SearchModes.HYBRID: {
        // Same as semantic: the embedded query hits the remote embedder, which rejects prefix search.
        params.prefix = false;

        params.q = opts.query;

        // Auto-embed (no nearVector) needs the embedding field in query_by; a supplied vector keeps text fields only.
        params.queryBy = opts.nearVector
          ? opts.queryBy.join(',')
          : [...opts.queryBy, opts.vectorField].join(',');

        params.vectorQuery = dialect.toVectorQuery({
          field: opts.vectorField,
          nearVector: opts.nearVector,
          k: opts.k,
          alpha: opts.alpha,
          distanceThreshold: opts.distanceThreshold,
          ef: opts.ef,
        }).vectorQuery;

        break;
      }
      default: {
        break;
      }
    }

    this.applyCommonSearchParams({ params, input: opts });

    return this.connector.search<R>({
      collection: this.collectionName,
      params: dialect.toWireParams({ query: params }),
    });
  }

  /** Applies faceting/highlighting/grouping/search-tuning params (shared by keyword/semantic/hybrid,
   * absent from `raw`) onto `params` - arrays are comma-joined the same way the dialect joins queryBy/fields. */
  private applyCommonSearchParams(opts: {
    params: ISearchQuery;
    input: Exclude<TSearchInput, { mode: typeof SearchModes.RAW }>;
  }): void {
    const { params, input } = opts;

    if (input.facetBy) {
      params.facetBy = input.facetBy.join(',');
    }

    if (input.facetQuery !== undefined) {
      params.facetQuery = input.facetQuery;
    }

    if (input.maxFacetValues !== undefined) {
      params.maxFacetValues = input.maxFacetValues;
    }

    if (input.highlightFields) {
      params.highlightFields = input.highlightFields.join(',');
    }

    if (input.highlightFullFields) {
      params.highlightFullFields = input.highlightFullFields.join(',');
    }

    if (input.highlightStartTag !== undefined) {
      params.highlightStartTag = input.highlightStartTag;
    }

    if (input.highlightEndTag !== undefined) {
      params.highlightEndTag = input.highlightEndTag;
    }

    if (input.snippetThreshold !== undefined) {
      params.snippetThreshold = input.snippetThreshold;
    }

    if (input.groupBy) {
      params.groupBy = input.groupBy.join(',');
    }

    if (input.groupLimit !== undefined) {
      params.groupLimit = input.groupLimit;
    }

    if (input.groupMissingValues !== undefined) {
      params.groupMissingValues = input.groupMissingValues;
    }

    if (input.numTypos !== undefined) {
      params.numTypos = input.numTypos;
    }

    if (input.prefix !== undefined) {
      params.prefix = input.prefix;
    }

    if (input.infix !== undefined) {
      params.infix = input.infix;
    }

    if (input.useCache !== undefined) {
      params.useCache = input.useCache;
    }

    if (input.cacheTtl !== undefined) {
      params.cacheTtl = input.cacheTtl;
    }

    if (input.exhaustiveSearch !== undefined) {
      params.exhaustiveSearch = input.exhaustiveSearch;
    }

    if (input.pinnedHits !== undefined) {
      params.pinnedHits = input.pinnedHits;
    }

    if (input.hiddenHits !== undefined) {
      params.hiddenHits = input.hiddenHits;
    }

    if (input.queryByWeights) {
      params.queryByWeights = input.queryByWeights.join(',');
    }

    if (input.prioritizeExactMatch !== undefined) {
      params.prioritizeExactMatch = input.prioritizeExactMatch;
    }

    if (input.dropTokensThreshold !== undefined) {
      params.dropTokensThreshold = input.dropTokensThreshold;
    }

    if (input.preset !== undefined) {
      params.preset = input.preset;
    }
  }

  /** Throws the standardized NOT ALLOWED error for a disabled operation; callers pass their own method name for the message. */
  protected denyOperation(methodName: string): never {
    throw getError({
      message: `[${methodName}] Repository operation is NOT ALLOWED | scope: ${this.operationScope}`,
    });
  }

  /** @throws Error - disabled in a read-only repository; unlocked progressively by Persistable/DefaultSearchRepository. */
  create(opts: {
    data: TDocument;
    options: IExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;
  create<R = TDocument>(opts: {
    data: TDocument;
    options?: IExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;
  create<R = TDocument>(_opts: {
    data: TDocument;
    options?: IExtraOptions & { shouldReturn?: boolean };
  }): Promise<TCount & { data: TNullable<R> }> {
    return this.denyOperation(this.create.name);
  }

  /** @throws Error - disabled in a read-only repository. */
  createAll(opts: {
    data: Array<TDocument>;
    options: IExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;
  createAll<R = TDocument>(opts: {
    data: Array<TDocument>;
    options?: IExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: Array<R> }>;
  createAll<R = TDocument>(_opts: {
    data: Array<TDocument>;
    options?: IExtraOptions & { shouldReturn?: boolean };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    return this.denyOperation(this.createAll.name);
  }

  /** @throws Error - disabled in a read-only repository. */
  updateById(opts: {
    id: IdType;
    data: Partial<TDocument>;
    options: IExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;
  updateById<R = TDocument>(opts: {
    id: IdType;
    data: Partial<TDocument>;
    options?: IExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;
  updateById<R = TDocument>(_opts: {
    id: IdType;
    data: Partial<TDocument>;
    options?: IExtraOptions & { shouldReturn?: boolean };
  }): Promise<TCount & { data: TNullable<R> }> {
    return this.denyOperation(this.updateById.name);
  }

  /** @throws Error - disabled in a read-only repository. */
  updateAll(opts: {
    data: Partial<TDocument>;
    where?: TWhere;
    options: IExtraOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;
  updateAll<R = TDocument>(opts: {
    data: Partial<TDocument>;
    where?: TWhere;
    options?: IExtraOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> }>;
  updateAll<R = TDocument>(_opts: {
    data: Partial<TDocument>;
    where?: TWhere;
    options?: IExtraOptions & { shouldReturn?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    return this.denyOperation(this.updateAll.name);
  }

  /** @throws Error - disabled in a read-only repository. */
  deleteById(opts: {
    id: IdType;
    options: IExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;
  deleteById<R = TDocument>(opts: {
    id: IdType;
    options?: IExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;
  deleteById<R = TDocument>(_opts: {
    id: IdType;
    options?: IExtraOptions & { shouldReturn?: boolean };
  }): Promise<TCount & { data: TNullable<R> }> {
    return this.denyOperation(this.deleteById.name);
  }

  /** @throws Error - disabled in a read-only repository. Unlocked by DefaultSearchRepository. */
  deleteAll(opts: {
    where?: TWhere;
    options: IExtraOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;
  deleteAll<R = TDocument>(opts?: {
    where?: TWhere;
    options?: IExtraOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> }>;
  deleteAll<R = TDocument>(_opts?: {
    where?: TWhere;
    options?: IExtraOptions & { shouldReturn?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    return this.denyOperation(this.deleteAll.name);
  }
}
