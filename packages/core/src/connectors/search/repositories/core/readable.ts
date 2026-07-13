import type { TNullable } from '@venizia/ignis-helpers';
import type {
  IExtraOptions,
  TCount,
  TDataRange,
  TFilter,
  TWhere,
} from '@/base/repositories/common';
import { buildDataRange, DEFAULT_LIMIT } from '@/base/repositories/common';
import type { IdType } from '@/base/models';
import type { ISearchResult } from '@/connectors/search';
import type { TSearchInput } from '@/connectors/search/repositories/common';
import { SearchModes } from '@/connectors/search/repositories/common';
import type { AbstractSearchDataSource } from '@/connectors/search/datasources';
import { SearchBaseRepository } from './base';

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

    // Counted through the document endpoint, never the search endpoint: an engine whose search
    // total is capped or estimated would otherwise report a count that quietly lies.
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

  find<R = TDocument>(opts: {
    filter: TFilter;
    options: IExtraOptions & { shouldQueryRange: true };
  }): Promise<{ data: Array<R>; range: TDataRange }>;

  find<R = TDocument>(opts: {
    filter: TFilter;
    options?: IExtraOptions & { shouldQueryRange?: false };
  }): Promise<Array<R>>;

  /** Bare array or `{ data, range }` per shouldQueryRange, postgres-shaped range. Typesense's `found`
   * already comes back in the same call as `hits`, so unlike SQL no second count query is needed. */
  async find<R = TDocument>(opts: {
    filter: TFilter;
    options?: IExtraOptions & { shouldQueryRange?: boolean };
  }): Promise<Array<R> | { data: Array<R>; range: TDataRange }> {
    const { filter, options } = opts;
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
    // Stripped in JS as well as engine-side: Typesense honours `exclude_fields`, but Meilisearch has
    // no per-query exclusion at all, so the engine is not the last line of defence here.
    const data = this.omitHiddenFieldsAll((hits ?? []).map(hit => hit.document)) as any;

    if (!options?.shouldQueryRange) {
      return data;
    }

    return {
      data,
      range: buildDataRange({
        skip: effectiveFilter.skip,
        offset: effectiveFilter.offset,
        dataLength: data.length,
        total: found,
      }),
    };
  }

  async findOne<R = TDocument>(opts: {
    filter: TFilter;
    options?: IExtraOptions;
  }): Promise<TNullable<R>> {
    const { filter, options } = opts;
    const results = await this.find<R>({ filter: { ...filter, limit: 1 }, options });
    return results[0] ?? null;
  }

  /** Delegates to findOne with id in where - routes through buildQuery so hiddenFields/defaultFilter apply (a soft-deleted doc resolves to null, not fetched directly). */
  findById<R = TDocument>(opts: { id: IdType; options?: IExtraOptions }): Promise<TNullable<R>> {
    const { id, options } = opts;
    return this.findOne<R>({ filter: { where: { id } }, options });
  }

  /** Unified search entry point, discriminated by `mode`:
   * - `raw` - full-power passthrough straight to the connector, no dialect/defaultFilter/hiddenFields.
   * - `keyword`/`semantic`/`hybrid` - `where`/`defaultFilter`/`hiddenFields` translated via the
   *   dialect same as `find()`, then the dialect applies every engine-specific parameter.
   *
   * Nothing engine-specific lives here: mode dispatch, the vector clause and the tuning knobs are
   * all owned by `ISearchQueryDialect.applySearchInput`. */
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

    this.queryDialect.applySearchInput({ query, input: opts });

    const result = await this.connector.search<R>({
      collection: this.collectionName,
      params: this.queryDialect.toWireParams({ query }),
    });

    return {
      ...result,
      hits: (result.hits ?? []).map(hit => ({
        ...hit,
        document: this.omitHiddenFields(hit.document),
      })),
    };
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
  updateAll(_opts: {
    data: Partial<TDocument>;
    where?: TWhere;
    options?: Omit<IExtraOptions, 'shouldReturn'> & { force?: boolean };
  }): Promise<TCount & { data: null }> {
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
  deleteAll(_opts?: {
    where?: TWhere;
    options?: Omit<IExtraOptions, 'shouldReturn'> & { force?: boolean };
  }): Promise<TCount & { data: null }> {
    return this.denyOperation(this.deleteAll.name);
  }
}
