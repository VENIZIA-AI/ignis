import { SearchErrors } from '@/connectors/search/common';
import type { IdType } from '@/base/models';
import type { IExtraOptions, TCount, TWhere } from '@/base/repositories/common';
import { RepositoryOperationScopes } from '@/base/repositories/common';
import type { AbstractSearchDataSource } from '@/connectors/search/datasources';
import type { BaseSearchEntity } from '@/connectors/search/models';
import type { TClass, TNullable } from '@venizia/ignis-helpers';
import { getError } from '@venizia/ignis-helpers';
import type { IImportResult } from '@/connectors/search';
import { ReadableSearchRepository } from './readable';

/** Narrows one `unknown` `IImportResult.responses` row enough to read the per-row `success` flag `createAll` filters on. */
const isImportRowLike = (value: unknown): value is { success?: boolean } => {
  return typeof value === 'object' && value !== null;
};

/** Write-tier search-repository - creates/updates through the connector, dialect-translating `where` clauses. */
export class PersistableSearchRepository<
  TDocument extends object = object,
  TDataSource extends AbstractSearchDataSource = AbstractSearchDataSource,
> extends ReadableSearchRepository<TDocument, TDataSource> {
  constructor(ds?: TDataSource, opts?: { scope?: string; entityClass?: TClass<BaseSearchEntity> }) {
    super(ds, opts);
    this._operationScope = RepositoryOperationScopes.READ_WRITE;
  }

  override create(opts: {
    data: TDocument;
    options: IExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;

  override create<R = TDocument>(opts: {
    data: TDocument;
    options?: IExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;

  override async create<R = TDocument>(opts: {
    data: TDocument;
    options?: IExtraOptions & { shouldReturn?: boolean };
  }): Promise<TCount & { data: TNullable<R> }> {
    this.assertNoTransaction(opts.options);
    this.assertNoLock(opts.options);

    const created = await this.connector.document.create<TDocument>({
      collection: this.collectionName,
      document: opts.data,
    });

    if (opts.options?.shouldReturn === false) {
      return { count: 1, data: null };
    }

    return { count: 1, data: this.omitHiddenFields(created as R) };
  }

  override createAll(opts: {
    data: Array<TDocument>;
    options: IExtraOptions & { shouldReturn: false; batchSize?: number };
  }): Promise<TCount & { data: undefined | null }>;

  override createAll<R = TDocument>(opts: {
    data: Array<TDocument>;
    options?: IExtraOptions & { shouldReturn?: true; batchSize?: number };
  }): Promise<TCount & { data: Array<R> }>;

  /** Delegates to import(). Typesense's bulk import reports only per-row success/fail with no echoed document, so "created" is the caller's input rows filtered to the accepted ones. */
  override async createAll<R = TDocument>(opts: {
    data: Array<TDocument>;
    options?: IExtraOptions & { shouldReturn?: boolean; batchSize?: number };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    this.assertNoTransaction(opts.options);
    this.assertNoLock(opts.options);

    const { data, options } = opts;
    const rs = await this.import({ documents: data, batchSize: options?.batchSize });

    if (options?.shouldReturn === false) {
      return { count: rs.count.success, data: null };
    }

    const created = data.filter((_document, index) => {
      const response = rs.responses[index];
      return isImportRowLike(response) ? response.success !== false : true;
    });

    // `created` is the caller's own input rows (bulk import echoes nothing back), so R is the caller's unchecked assertion, as on the non-hidden path.
    return { count: rs.count.success, data: this.omitHiddenFieldsAll(created) as any };
  }

  override updateById(opts: {
    id: IdType;
    data: Partial<TDocument>;
    options: IExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;

  override updateById<R = TDocument>(opts: {
    id: IdType;
    data: Partial<TDocument>;
    options?: IExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;

  /** Guards against defaultWhere by re-reading via findById first (costs one read; skippable via shouldSkipDefaultFilter). A guard failure throws the same sanitized 404 as a missing document. */
  override async updateById<R = TDocument>(opts: {
    id: IdType;
    data: Partial<TDocument>;
    options?: IExtraOptions & { shouldReturn?: boolean };
  }): Promise<TCount & { data: TNullable<R> }> {
    this.assertNoTransaction(opts.options);
    this.assertNoLock(opts.options);

    const { id, data, options } = opts;

    if (this.defaultWhere && !options?.shouldSkipDefaultFilter) {
      const found = await this.findById({ id, options });

      if (!found) {
        throw getError({
          error: SearchErrors.NOT_FOUND,
          message: `[${this.constructor.name}][updateById] Document not found or excluded by the default filter | Collection: ${this.collectionName} | Id: ${id}`,
        });
      }
    }

    const updated = await this.connector.document.update<TDocument>({
      collection: this.collectionName,
      id: String(id),
      document: data,
    });

    if (options?.shouldReturn === false) {
      return { count: 1, data: null };
    }

    return { count: 1, data: this.omitHiddenFields(updated as R) };
  }

  /** Count-only: search engines have no RETURNING and no extra read is bolted on, so `data` is always `null` and `shouldReturn` is rejected at the type level - callers wanting the affected documents read them before updating. */
  override async updateAll(opts: {
    data: Partial<TDocument>;
    where?: TWhere;
    options?: Omit<IExtraOptions, 'shouldReturn'> & { force?: boolean };
  }): Promise<TCount & { data: null }> {
    this.assertNoTransaction(opts.options);
    this.assertNoLock(opts.options);

    const { data, where, options } = opts;
    const { filterBy, matchNone } = this.buildScopedFilter({
      where,
      shouldSkipDefaultFilter: options?.shouldSkipDefaultFilter,
    });

    // Checked BEFORE the undefined guard: an absorbing where selects no document, which is a
    // well-formed request to update nothing - not the "no effective where" the guard refuses.
    if (matchNone) {
      return { count: 0, data: null };
    }

    if (filterBy === undefined) {
      throw getError({
        message: `[${this.constructor.name}][updateAll] DENY to perform | Collection: ${this.collectionName} | No effective where condition (no where and no @model defaultFilter) - refusing an unfiltered bulk update`,
      });
    }

    const result = await this.connector.document.updateBy<TDocument>({
      collection: this.collectionName,
      document: data,
      filterBy,
    });

    return { count: result.updatedCount, data: null };
  }

  override deleteById(opts: {
    id: IdType;
    options: IExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;

  override deleteById<R = TDocument>(opts: {
    id: IdType;
    options?: IExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;

  /** Guards against defaultWhere same as updateById: an excluded document reports { count: 0 }, same as a genuinely missing one. Skippable via shouldSkipDefaultFilter. */
  override async deleteById<R = TDocument>(opts: {
    id: IdType;
    options?: IExtraOptions & { shouldReturn?: boolean };
  }): Promise<TCount & { data: TNullable<R> }> {
    this.assertNoTransaction(opts.options);
    this.assertNoLock(opts.options);

    const { id, options } = opts;
    let found: TNullable<TDocument> = null;

    if (this.defaultWhere && !options?.shouldSkipDefaultFilter) {
      found = await this.findById({ id, options });

      if (!found) {
        return { count: 0, data: null };
      }
    }

    const didDelete = await this.connector.document.delete({
      collection: this.collectionName,
      id: String(id),
    });

    if (!didDelete) {
      return { count: 0, data: null };
    }

    // Typesense's delete has no RETURNING equivalent - `data` is populated only when the defaultFilter guard above already read the document; no extra read is done for shouldReturn.
    const data = options?.shouldReturn === false ? null : ((found as R) ?? null);
    return { count: 1, data };
  }

  /** Count-only like updateAll: filter-delete when there is an effective where, truncating the whole collection only when neither where nor defaultFilter is present - truncate reports no per-document count, so that path returns { count: 0, data: null }. */
  override async deleteAll(opts?: {
    where?: TWhere;
    options?: Omit<IExtraOptions, 'shouldReturn'> & { force?: boolean };
  }): Promise<TCount & { data: null }> {
    this.assertNoTransaction(opts?.options);
    this.assertNoLock(opts?.options);

    const logger = this.logger.for(this.deleteAll.name);
    const { where, options } = opts ?? {};
    const { filterBy, matchNone } = this.buildScopedFilter({
      where,
      shouldSkipDefaultFilter: options?.shouldSkipDefaultFilter,
    });

    // Checked BEFORE the undefined guard, and the reason `matchNone` exists as a distinct outcome:
    // an absorbing where selects no document. Collapsing it to `undefined` would enter the branch
    // below and, with `force`, TRUNCATE the collection - the exact inversion of what was asked.
    if (matchNone) {
      return { count: 0, data: null };
    }

    if (filterBy === undefined) {
      // `where: {}` compiles to NO filter; wiping a collection must be asked for explicitly, exactly as Postgres demands `force` for an empty-where delete.
      if (!options?.force) {
        throw getError({
          message: `[${this.constructor.name}][deleteAll] DENY to perform | Collection: ${this.collectionName} | No effective where condition (no where and no @model defaultFilter) - pass options.force to truncate the collection`,
        });
      }

      const didTruncate = await this.connector.document.deleteAll({
        collection: this.collectionName,
      });

      logger.warn(
        'TRUNCATED collection on explicit force (engine reports no per-document count) | Collection: %s | Truncated: %s',
        this.collectionName,
        didTruncate,
      );

      return { count: 0, data: null };
    }

    const deletedCount = await this.connector.document.deleteBy({
      collection: this.collectionName,
      filterBy,
    });

    return { count: deletedCount, data: null };
  }

  /** Bulk import through the neutral document facade. Per-row write `action` is Typesense-only vocabulary - callers needing it use `dataSource.getConnector().importDocuments(...)` directly. */
  import(opts: { documents: TDocument[]; batchSize?: number }): Promise<IImportResult<unknown>> {
    const { documents, batchSize } = opts;

    const importOpts: {
      collection: string;
      documents: TDocument[];
      batchSize?: number;
    } = {
      collection: this.collectionName,
      documents,
    };

    if (batchSize !== undefined) {
      importOpts.batchSize = batchSize;
    }

    return this.connector.document.import<TDocument>(importOpts);
  }

  /** Resolves filterBy, AND-merging defaultWhere unless shouldSkipDefaultFilter. Returns undefined when there's no effective where - callers decide (updateAll refuses; deleteAll truncates). */
  protected buildFilterBy(opts: {
    where?: TWhere;
    shouldSkipDefaultFilter?: boolean;
  }): string | undefined {
    return this.buildScopedFilter(opts).filterBy;
  }

  /**
   * The write-path filter as THREE outcomes, because two of them are catastrophically different
   * here: `filterBy: undefined` means "no effective where", which `deleteAll` treats as licence to
   * truncate when `force` is set. An absorbing where must never land there -
   * `deleteAll({ where: { or: permittedIds.map(...) } })` on an EMPTY permission list has to
   * delete nothing, not the entire collection. `matchNone` is what keeps the two apart.
   */
  protected buildScopedFilter(opts: { where?: TWhere; shouldSkipDefaultFilter?: boolean }): {
    filterBy?: string;
    matchNone: boolean;
  } {
    const { where, shouldSkipDefaultFilter } = opts;

    const query = this.buildQuery({
      filter: where !== undefined ? { where } : undefined,
      shouldSkipDefaultFilter,
    });

    return { filterBy: query.filterBy, matchNone: query.matchNone === true };
  }
}
