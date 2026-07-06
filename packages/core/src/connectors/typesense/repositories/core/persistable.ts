import { getError, TClass, TNullable } from '@venizia/ignis-helpers';
import {
  IExtraOptions,
  RepositoryOperationScopes,
  TCount,
  TWhere,
} from '@/base/repositories/common';
import { IdType } from '@/base/models';
import { IImportResult } from '@/connectors/typesense/driver';
import { TypesenseDataSource } from '@/connectors/typesense/datasources';
import { BaseSearchEntity } from '@/connectors/typesense/models';
import { TTypesenseImportAction } from '@/connectors/typesense/types';
import { ReadableSearchRepository } from './readable';

/** Narrows one `IImportResult.responses` row (`unknown` - see driver.ts's `IImportResult<TResponse
 * = unknown>`) enough to read the per-row `success` flag `createAll` filters on. */
function isImportRowLike(value: unknown): value is { success?: boolean } {
  return typeof value === 'object' && value !== null;
}

/** Write-tier search-repository - creates/updates through the driver, dialect-translating `where` clauses. */
export class PersistableSearchRepository<
  TDocument extends object = object,
> extends ReadableSearchRepository<TDocument> {
  constructor(
    ds?: TypesenseDataSource,
    opts?: { scope?: string; entityClass?: TClass<BaseSearchEntity> },
  ) {
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

    const created = await this.dataSource.getDriver().createDocument<TDocument>({
      collection: this.collectionName,
      document: opts.data,
    });

    if (opts.options?.shouldReturn === false) {
      return { count: 1, data: null };
    }

    // R is the caller-chosen output shape (defaults to TDocument, unrelated by any bound); the
    // engine-echoed document can't be runtime-validated against an arbitrary caller-supplied R.
    return { count: 1, data: created as R };
  }

  override createAll(opts: {
    data: Array<TDocument>;
    options: IExtraOptions & { shouldReturn: false; batchSize?: number };
  }): Promise<TCount & { data: undefined | null }>;

  override createAll<R = TDocument>(opts: {
    data: Array<TDocument>;
    options?: IExtraOptions & { shouldReturn?: true; batchSize?: number };
  }): Promise<TCount & { data: Array<R> }>;

  /** Delegates to import(). Typesense's bulk import reports only per-row success/fail (no echoed
   * document), so "created" is just the caller's input rows filtered to the accepted ones. */
  override async createAll<R = TDocument>(opts: {
    data: Array<TDocument>;
    options?: IExtraOptions & { shouldReturn?: boolean; batchSize?: number };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    this.assertNoTransaction(opts.options);
    this.assertNoLock(opts.options);

    const { data, options } = opts;
    const rs = await this.import({ documents: data, batchSize: options?.batchSize });

    if (options?.shouldReturn === false) {
      return { count: rs.successCount, data: null };
    }

    const created = data.filter((_document, index) => {
      const response = rs.responses[index];
      return isImportRowLike(response) ? response.success !== false : true;
    });

    // R is the caller-chosen output shape; filtered TDocument rows can't be runtime-validated
    // against an arbitrary caller-supplied R, and TDocument/R share no bound for a direct assertion.
    return { count: rs.successCount, data: created as any };
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
          statusCode: 404,
          messageCode: 'core.search_engine.not_found',
          message: `[${this.constructor.name}][updateById] Document not found or excluded by the default filter | Collection: ${this.collectionName} | Id: ${id}`,
        });
      }
    }

    const updated = await this.dataSource.getDriver().updateDocument<TDocument>({
      collection: this.collectionName,
      id: String(id),
      document: data,
    });

    if (options?.shouldReturn === false) {
      return { count: 1, data: null };
    }

    // Same R-is-caller-chosen boundary as create() above.
    return { count: 1, data: updated as R };
  }

  override updateAll(opts: {
    data: Partial<TDocument>;
    where?: TWhere;
    options: IExtraOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;

  override updateAll<R = TDocument>(opts: {
    data: Partial<TDocument>;
    where?: TWhere;
    options?: IExtraOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> }>;

  override async updateAll<R = TDocument>(opts: {
    data: Partial<TDocument>;
    where?: TWhere;
    options?: IExtraOptions & { shouldReturn?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    this.assertNoTransaction(opts.options);
    this.assertNoLock(opts.options);

    const { data, where, options } = opts;
    const filterBy = this.buildFilterBy({
      where,
      shouldSkipDefaultFilter: options?.shouldSkipDefaultFilter,
    });

    if (filterBy === undefined) {
      throw getError({
        message: `[${this.constructor.name}][updateAll] DENY to perform | Collection: ${this.collectionName} | No effective where condition (no where and no @model defaultFilter) - refusing an unfiltered bulk update`,
      });
    }

    const result = await this.dataSource.getDriver().updateByFilter<TDocument>({
      collection: this.collectionName,
      document: data,
      filterBy,
    });

    if (options?.shouldReturn === false) {
      return { count: result.updatedCount, data: null };
    }

    // Typesense's update-by-filter has no RETURNING equivalent - snapshots the (now-updated) rows
    // via find() over the same filter, subject to the same pagination default as any other read.
    const updated = await this.find<R>({
      filter: { where },
      options: { shouldSkipDefaultFilter: options?.shouldSkipDefaultFilter },
    });

    return { count: result.updatedCount, data: updated };
  }

  /** Bulk import passthrough to the driver. `action` is typed as Typesense's own
   * `TTypesenseImportAction` - this tier is already Typesense-specific, and the driver is typed end to end (no `ISearchDriver` cast). */
  import(opts: {
    documents: TDocument[];
    action?: TTypesenseImportAction;
    batchSize?: number;
  }): Promise<IImportResult<unknown>> {
    const { documents, action, batchSize } = opts;

    const importOpts: {
      collection: string;
      documents: TDocument[];
      batchSize?: number;
      action?: TTypesenseImportAction;
    } = {
      collection: this.collectionName,
      documents,
    };

    if (batchSize !== undefined) {
      importOpts.batchSize = batchSize;
    }

    if (action !== undefined) {
      importOpts.action = action;
    }

    return this.dataSource.getDriver().importDocuments<TDocument>(importOpts);
  }

  /** Resolves filter_by, AND-merging defaultWhere unless shouldSkipDefaultFilter. Returns undefined when there's no effective where - callers decide (updateAll refuses; deleteAll truncates). */
  protected buildFilterBy(opts: {
    where?: TWhere;
    shouldSkipDefaultFilter?: boolean;
  }): string | undefined {
    const { where, shouldSkipDefaultFilter } = opts;
    const query = this.buildQuery({
      filter: where !== undefined ? { where } : undefined,
      shouldSkipDefaultFilter,
    });
    return query.filter_by;
  }
}
