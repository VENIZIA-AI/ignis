import type { TNullable } from '@venizia/ignis-helpers/common';
import type {
  IExtraOptions,
  TCount,
  TByIdFilter,
  TDataWithRange,
  TFields,
  TFilter,
  TFindOneOptions,
  TFindOptions,
  TFindRangeOptions,
  TRow,
  TWhere,
} from '@venizia/ignis-kernel';
import { DataRangeUtility, DEFAULT_LIMIT } from '@venizia/ignis-kernel/repository';
import type { IdType } from '@venizia/ignis-kernel';
import { getError } from '@venizia/ignis-helpers/core';
import type { ISearchFacetCount, ISearchResult } from '@/search/core';
import type { TSearchInput } from '@/search/core/repositories/common';
import { SearchModes } from '@/search/core/repositories/common';
import type { AbstractSearchDataSource } from '@/search/core/datasources';
import { SearchBaseRepository } from './base';

/** The match-everything term. `build()` already seeds `query` with it, so a filter-only listing reaches the engine as `q: '*'` - naming fields for a term that ignores fields would mean nothing. */
const WILDCARD_QUERY = '*';

/** The page size of `suggest()` when the caller gives none. */
const SUGGEST_DEFAULT_LIMIT = 8;

/** The inputs the dialect translates - `raw` has already returned by the time these are resolved, and `applySearchInput` accepts only this narrowed union. */
type TTranslatableSearchInput = Exclude<TSearchInput, { mode: typeof SearchModes.RAW }>;

/** Read-only search-repository tier - translates filters via the datasource's dialect and executes through the connector. */
export class ReadableSearchRepository<
  TDocument extends object = object,
  TDataSource extends AbstractSearchDataSource = AbstractSearchDataSource,
> extends SearchBaseRepository<TDocument, TDataSource> {
  async count(opts: { where: TWhere; options?: IExtraOptions }): Promise<TCount> {
    this.assertNoTransaction(opts.options);
    this.assertNoLock(opts.options);

    const query = this.buildQuery({
      filter: { where: opts.where },
      shouldSkipDefaultFilter: opts.options?.shouldSkipDefaultFilter,
    });

    // An absorbing where counts zero by definition. Asking the engine would mean sending NO
    // filterBy at all, which counts the entire collection.
    if (query.matchNone) {
      return { count: 0 };
    }

    // Counted through the document endpoint, never search: an engine whose search total is capped
    // or estimated would report a count that quietly lies.
    const count = await this.connector.document.count({
      collection: this.collectionName,
      filterBy: query.filterBy,
    });

    return { count };
  }

  async existsWith(opts: { where: TWhere; options?: IExtraOptions }): Promise<boolean> {
    const { count } = await this.count(opts);

    return count > 0;
  }

  find<R = unknown, const F extends TFields<TDocument> = TFields<TDocument>>(opts: {
    filter: TFilter<any, F>;
    options: TFindRangeOptions<IExtraOptions, TRow<TDocument, R, F>>;
  }): Promise<TDataWithRange<TRow<TDocument, R, F>>>;

  find<R = unknown, const F extends TFields<TDocument> = TFields<TDocument>>(opts: {
    filter: TFilter<any, F>;
    options?: TFindOptions<IExtraOptions, TRow<TDocument, R, F>>;
  }): Promise<Array<TRow<TDocument, R, F>>>;

  /**
   * Bare array or `{ data, range }` per shouldQueryRange, postgres-shaped range. Typesense returns
   * `found` in the same call as `hits`, so unlike SQL no second count query is needed.
   */
  async find<R = unknown, const F extends TFields<TDocument> = TFields<TDocument>>(opts: {
    filter: TFilter<any, F>;
    options?:
      | TFindOptions<IExtraOptions, TRow<TDocument, R, F>>
      | TFindRangeOptions<IExtraOptions, TRow<TDocument, R, F>>;
  }): Promise<Array<TRow<TDocument, R, F>> | TDataWithRange<TRow<TDocument, R, F>>> {
    const { filter, options } = opts;

    if (options?.retry) {
      return options.shouldQueryRange === true
        ? this.findRangeUntil<TRow<TDocument, R, F>>({ filter, options })
        : this.findUntil<TRow<TDocument, R, F>>({ filter, options });
    }

    this.assertNoTransaction(options);
    this.assertNoLock(options);

    // An omitted limit falls back to @model settings.query.limit.default then DEFAULT_LIMIT - leaving
    // `per_page` unset would be an unbounded query.
    const effectiveFilter: TFilter = {
      ...filter,
      limit: filter?.limit ?? this.defaultLimit ?? DEFAULT_LIMIT,
    };

    const query = this.buildQuery({
      filter: effectiveFilter,
      shouldSkipDefaultFilter: options?.shouldSkipDefaultFilter,
    });

    // No round-trip for an absorbing where: with no filterBy the engine would happily return the
    // whole collection, which is the opposite of what the filter asked for.
    // The connector types its documents `object`; the row a caller selects is one.
    type TRowDocument = TRow<TDocument, R, F> & object;

    let result: Pick<ISearchResult<TRowDocument>, 'hits' | 'found'> = {
      hits: [],
      found: 0,
    };

    if (!query.matchNone) {
      const searched = await this.connector.search<TRowDocument>({
        collection: this.collectionName,
        params: this.queryDialect.toWireParams({ query }),
      });
      result = searched;
    }

    const { hits, found } = result;

    // Hidden fields are stripped in JS too, not only engine-side: Typesense honours
    // `exclude_fields`, Meilisearch has no per-query exclusion at all.
    const data = this.shapeDocuments(
      (hits ?? []).map((hit) => hit.document),
      { fields: filter?.fields },
    );

    if (!options?.shouldQueryRange) {
      return data;
    }

    return {
      data,
      range: DataRangeUtility.buildDataRange({
        skip: effectiveFilter.skip,
        offset: effectiveFilter.offset,
        dataLength: data.length,
        total: found,
      }),
    };
  }

  async findOne<R = unknown, const F extends TFields<TDocument> = TFields<TDocument>>(opts: {
    filter: TFilter<any, F>;
    options?: TFindOneOptions<IExtraOptions, TRow<TDocument, R, F>>;
  }): Promise<TNullable<TRow<TDocument, R, F>>> {
    const { filter, options } = opts;

    if (options?.retry) {
      return this.findOneUntil<TRow<TDocument, R, F>>({ filter, options });
    }

    // `retry` is handled above so it is absent here; TFindOneOptions's retry generic (TNullable<R>)
    // does not unify with find's own (Array<R>), hence the options-only cast.
    const result = await this.find<R, F>({
      filter: { ...filter, limit: 1 },
      options: options as TFindOptions<IExtraOptions, TRow<TDocument, R, F>>,
    });
    const results = result as Array<TRow<TDocument, R, F>>;

    return results[0] ?? null;
  }

  /**
   * Delegates to findOne with id in where - routing through buildQuery is what makes
   * hiddenFields/settings.query.filter apply, so a soft-deleted document resolves to null. `where` is spread
   * away last so a projection can never widen the id lookup.
   */
  findById<R = unknown, const F extends TFields<TDocument> = TFields<TDocument>>(opts: {
    id: IdType;
    filter?: TByIdFilter<any, F>;
    options?: TFindOneOptions<IExtraOptions, TRow<TDocument, R, F>>;
  }): Promise<TNullable<TRow<TDocument, R, F>>> {
    const { id, filter, options } = opts;

    return this.findOne<R, F>({ filter: { ...filter, where: { id } }, options });
  }

  /**
   * Unified search entry discriminated by `mode`: `raw` is a full passthrough - no dialect, no
   * settings.query.filter, no hiddenFields - while keyword/semantic/hybrid translate through the dialect
   * like `find()`. Nothing engine-specific lives here; `ISearchQueryDialect.applySearchInput`
   * owns it.
   */
  async search<R extends object = TDocument>(
    opts: TSearchInput & { options?: IExtraOptions },
  ): Promise<ISearchResult<R>> {
    if (opts.mode === SearchModes.RAW) {
      return this.connector.search<R>({
        collection: this.collectionName,
        params: opts.params,
      });
    }

    this.assertNoTransaction(opts.options);
    this.assertNoLock(opts.options);

    const query = this.buildQuery({
      filter: opts.filter,
      shouldSkipDefaultFilter: opts.options?.shouldSkipDefaultFilter,
    });

    const input = this.withDefaultQueryBy({ input: opts });
    this.assertNoHiddenFieldsNamed({ input });
    this.queryDialect.applySearchInput({ query, input });

    // Same short-circuit as find(): an absorbing filter cannot be expressed to the engine, and
    // omitting it would search everything.
    // `isFoundExact` is true because zero is not an estimate - nothing was searched to approximate.
    if (query.matchNone) {
      return { hits: [], found: 0, isFoundExact: true };
    }

    const result = await this.connector.search<R>({
      collection: this.collectionName,
      params: this.queryDialect.toWireParams({ query }),
    });

    return {
      ...result,
      hits: (result.hits ?? []).map((hit) => ({
        ...hit,
        document: this.shapeDocument(hit.document, { fields: opts.filter?.fields }),
      })),
    };
  }

  /** The count of a text search: how many documents match `query` and `where`. Unlike `count()`, which asks the document endpoint for an exact filter-only total, this goes through search, so `isFoundExact` says whether the engine stopped early and `count` is an estimate. */
  async searchCount(opts: {
    query: string;
    queryBy?: string[];
    where?: TWhere;
    engineParams?: Record<string, unknown>;
    options?: IExtraOptions;
  }): Promise<{ count: number; isFoundExact: boolean }> {
    const { query, queryBy, where, engineParams, options } = opts;

    const result = await this.search({
      mode: SearchModes.KEYWORD,
      query,
      queryBy,
      engineParams,
      filter: { where, limit: 0 },
      options,
    });

    return { count: result.found, isFoundExact: result.isFoundExact };
  }

  /** Facet counts without hits, over the documents that match `query` (all of them when omitted) and `where`. `maxFacetValues` and `facetQuery` are for engines that take them; the others refuse them. */
  async facets(opts: {
    facetBy: string[];
    query?: string;
    queryBy?: string[];
    where?: TWhere;
    maxFacetValues?: number;
    facetQuery?: string;
    engineParams?: Record<string, unknown>;
    options?: IExtraOptions;
  }): Promise<{ facets: ISearchFacetCount[]; found: number; isFoundExact: boolean }> {
    const { facetBy, query, queryBy, where, maxFacetValues, facetQuery, engineParams, options } =
      opts;

    if (facetBy.length === 0 || facetBy.some((name) => name.trim().length === 0)) {
      throw getError({
        message: `[${this.constructor.name}][facets] Invalid facetBy | Expected at least one non-empty field name | Got: ${JSON.stringify(facetBy)}`,
      });
    }

    if (
      maxFacetValues !== undefined &&
      (!Number.isInteger(maxFacetValues) || maxFacetValues <= 0)
    ) {
      throw getError({
        message: `[${this.constructor.name}][facets] Invalid maxFacetValues | Expected a positive integer | Got: ${String(maxFacetValues)}`,
      });
    }

    const result = await this.search({
      mode: SearchModes.KEYWORD,
      query: query ?? WILDCARD_QUERY,
      queryBy,
      facetBy,
      facetQuery,
      maxFacetValues,
      engineParams,
      filter: { where, limit: 0 },
      options,
    });

    return {
      facets: result.facetCounts ?? [],
      found: result.found,
      isFoundExact: result.isFoundExact,
    };
  }

  /** Autocomplete: documents whose fields match `query` as typed so far. A keyword search with highlighting off and a small page (`limit`, 8 by default); the last word matches as a prefix, which both engines do by default. A blank `query` answers an empty list without asking the engine. */
  async suggest<R extends object = TDocument>(opts: {
    query: string;
    queryBy?: string[];
    limit?: number;
    includeFields?: string[];
    where?: TWhere;
    engineParams?: Record<string, unknown>;
    options?: IExtraOptions;
  }): Promise<R[]> {
    const {
      query,
      queryBy,
      limit = SUGGEST_DEFAULT_LIMIT,
      includeFields,
      where,
      engineParams,
      options,
    } = opts;

    if (!Number.isInteger(limit) || limit <= 0) {
      throw getError({
        message: `[${this.constructor.name}][suggest] Invalid limit | Expected a positive integer | Got: ${String(limit)}`,
      });
    }

    if (query.trim().length === 0) {
      return [];
    }

    const result = await this.search<R>({
      mode: SearchModes.KEYWORD,
      query,
      queryBy,
      highlight: false,
      engineParams,
      filter: { where, fields: includeFields, limit },
      options,
    });

    return (result.hits ?? []).map((hit) => hit.document);
  }

  /** Documents lose their hidden fields on the way out, but a facet count or a match on one would still tell the caller what the field holds; so they are refused as `facetBy`, in `facetQuery`, as `queryBy`, as `groupBy` and in the highlight fields (a group key and a highlight snippet carry the value too). */
  protected assertNoHiddenFieldsNamed(opts: { input: TTranslatableSearchInput }): void {
    const { input } = opts;

    if (this.hiddenFields.length === 0) {
      return;
    }

    const named: Array<{ param: string; field: string; isWildcard: boolean }> = [];

    // An engine reads a field list as a comma-joined string, so one element can name several fields: each part is checked.
    // A part may carry facet parameters after the name (`secret(sort_by:_alpha:asc)`): the name is what comes before the
    // parenthesis. A wildcard (`*`, `sec*`) names fields the check cannot list, hidden ones included, so it is refused.
    const addFields = (entry: { param: string; value: string }) => {
      for (const part of entry.value.split(',')) {
        named.push({
          param: entry.param,
          field: (part.split('(')[0] ?? '').trim(),
          isWildcard: part.includes('*'),
        });
      }
    };

    for (const param of ['facetBy', 'groupBy', 'highlightFields', 'highlightFullFields'] as const) {
      for (const value of input[param] ?? []) {
        addFields({ param, value });
      }
    }

    if (input.facetQuery !== undefined) {
      addFields({ param: 'facetQuery', value: input.facetQuery.split(':')[0] ?? '' });
    }

    if ('queryBy' in input) {
      for (const value of input.queryBy ?? []) {
        addFields({ param: 'queryBy', value });
      }
    }

    // The vector field of a semantic or hybrid search is a field name too.
    if ('vectorField' in input && typeof input.vectorField === 'string') {
      addFields({ param: 'vectorField', value: input.vectorField });
    }

    const wildcard = named.find(({ isWildcard }) => isWildcard);

    if (wildcard) {
      throw getError({
        message: `[${this.constructor.name}][search] '${wildcard.param}' uses a wildcard | field: '${wildcard.field}' | a model with hidden fields must name the fields it searches, facets, groups and highlights`,
      });
    }

    const hidden = named.find(({ field }) => this.hiddenFields.includes(field));

    if (hidden) {
      throw getError({
        message: `[${this.constructor.name}][search] '${hidden.param}' names a hidden field | field: '${hidden.field}' | hidden fields never leave the repository, so they cannot be counted, matched or faceted`,
      });
    }
  }

  protected withDefaultQueryBy(opts: {
    input: TTranslatableSearchInput;
  }): TTranslatableSearchInput {
    const { input } = opts;

    if (input.mode !== SearchModes.KEYWORD || input.queryBy) {
      return input;
    }

    const term = input.query?.trim();

    if (!term || term === WILDCARD_QUERY) {
      return input;
    }

    const defaultQueryBy = this.entity?.schema?.defaultQueryBy;

    if (!defaultQueryBy || defaultQueryBy.length === 0) {
      return input;
    }

    return { ...input, queryBy: [...defaultQueryBy] };
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
    return this.denyOperation({ methodName: this.create.name });
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
    return this.denyOperation({ methodName: this.createAll.name });
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
    return this.denyOperation({ methodName: this.updateById.name });
  }

  /**
   * @throws Error - disabled in a read-only repository. `where` is optional where the base contract
   * requires it: the `@model` `settings.query.filter` alone can supply the effective filter, and Persistable
   * refuses the write outright when neither is present.
   */
  updateAll(_opts: {
    data: Partial<TDocument>;
    where?: TWhere;
    options?: Omit<IExtraOptions, 'shouldReturn'> & { force?: boolean };
  }): Promise<TCount & { data: null }> {
    return this.denyOperation({ methodName: this.updateAll.name });
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
    return this.denyOperation({ methodName: this.deleteById.name });
  }

  /** @throws Error - disabled in a read-only repository. Unlocked by DefaultSearchRepository. */
  deleteAll(_opts?: {
    where?: TWhere;
    options?: Omit<IExtraOptions, 'shouldReturn'> & { force?: boolean };
  }): Promise<TCount & { data: null }> {
    return this.denyOperation({ methodName: this.deleteAll.name });
  }
}
