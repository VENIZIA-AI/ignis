import type { ITransaction } from '@/base/datasources';
import type { TFilter, TLockOptions, TWhere } from '@/base/repositories/common';
import { AbstractRepository } from '@/base/repositories/core';
import type { AbstractSearchDataSource } from '@/connectors/search/datasources';
import type { BaseSearchEntity } from '@/connectors/search/models';
import { throwNotSupported } from '@/utilities';
import type { TClass } from '@venizia/ignis-helpers';
import type { ISearchQuery, ISearchQueryDialect } from '@/connectors/search/repositories/common';

/** Search-repository plumbing on `AbstractRepository`. `TDataSource` carries the concrete connector type through `this.connector`, so a concretely-bound repository reaches its engine's verbs uncast while an engine-agnostic one is forced to write `connector.alias?.…`. */
export abstract class SearchBaseRepository<
  TDocument extends object = object,
  TDataSource extends AbstractSearchDataSource = AbstractSearchDataSource,
> extends AbstractRepository<TDocument, TDocument> {
  constructor(
    dataSource?: TDataSource,
    opts?: { scope?: string; entityClass?: TClass<BaseSearchEntity> },
  ) {
    super(dataSource, opts);
  }

  override get dataSource(): TDataSource {
    return super.dataSource as TDataSource;
  }

  override set dataSource(value: TDataSource) {
    super.dataSource = value;
  }

  override get entity(): BaseSearchEntity {
    return super.entity as BaseSearchEntity;
  }

  override set entity(value: BaseSearchEntity) {
    super.entity = value;
  }

  get collectionName(): string {
    return this.entity.name;
  }

  protected get connector(): ReturnType<TDataSource['getConnector']> {
    return this.dataSource.getConnector() as ReturnType<TDataSource['getConnector']>;
  }

  protected get queryDialect(): ISearchQueryDialect {
    return this.dataSource.getQueryDialect();
  }

  get multiSearch(): TDataSource['multiSearch'] {
    return this.dataSource.multiSearch.bind(this.dataSource);
  }

  override setDataSource(opts: { dataSource: TDataSource }): void {
    super.setDataSource(opts);
  }

  /** WRITE responses never pass through the engine's exclude-fields filter, so hiddenProperties are stripped here - the relational branch gets the same guarantee from `.returning(visibleProperties)`. */
  protected omitHiddenFields<R>(document: R): R {
    const hiddenFields = this.hiddenFields;

    if (hiddenFields.length === 0 || document === null || typeof document !== 'object') {
      return document;
    }

    const visible: Record<string, unknown> = { ...(document as Record<string, unknown>) };

    for (const field of hiddenFields) {
      delete visible[field];
    }

    return visible as R;
  }

  protected omitHiddenFieldsAll<R>(documents: R[]): R[] {
    if (this.hiddenFields.length === 0) {
      return documents;
    }

    return documents.map(document => this.omitHiddenFields(document));
  }

  /** No search engine here has a transaction primitive (this tier is engine-neutral - Typesense and Meilisearch both inherit it) - a caller-supplied options.transaction is rejected loudly instead of silently running outside the transaction the caller expects. */
  protected assertNoTransaction(opts?: { transaction?: ITransaction }): void {
    if (!opts?.transaction) {
      return;
    }

    throwNotSupported({
      scope: this.dataSource.constructor.name,
      feature: 'Transactions',
      logger: this.logger,
    });
  }

  /** Row-level locking (SELECT ... FOR UPDATE) has no search-engine equivalent - same NotSupported convention as assertNoTransaction. */
  protected assertNoLock(opts?: { lock?: TLockOptions }): void {
    if (!opts?.lock) {
      return;
    }

    throwNotSupported({
      scope: this.dataSource.constructor.name,
      feature: 'Row-level locking',
      logger: this.logger,
    });
  }

  /** Builds a dialect-translated query: AND-merges defaultWhere into filter.where (unless shouldSkipDefaultFilter), always strips hiddenFields. */
  protected buildQuery(opts: {
    filter?: TFilter;
    shouldSkipDefaultFilter?: boolean;
  }): ISearchQuery {
    const { filter, shouldSkipDefaultFilter } = opts;
    const defaultWhere = shouldSkipDefaultFilter ? undefined : this.defaultWhere;
    const mergedWhere = this.mergeWhere({ defaultWhere, where: filter?.where });

    const effectiveFilter: TFilter | undefined = filter
      ? { ...filter, where: mergedWhere }
      : mergedWhere
        ? { where: mergedWhere }
        : undefined;

    return this.queryDialect.build({
      filter: effectiveFilter,
      hiddenFields: this.hiddenFields,
    });
  }

  private mergeWhere(opts: { defaultWhere?: TWhere; where?: TWhere }): TWhere | undefined {
    const { defaultWhere, where } = opts;

    if (!defaultWhere) {
      return where;
    }

    if (!where) {
      return defaultWhere;
    }

    return { and: [defaultWhere, where] };
  }
}
