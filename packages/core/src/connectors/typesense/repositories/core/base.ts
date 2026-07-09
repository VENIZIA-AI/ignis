import type { ITransaction } from '@/base/datasources';
import type { TFilter, TLockOptions, TWhere } from '@/base/repositories/common';
import { AbstractRepository } from '@/base/repositories/core';
import type { TypesenseDataSource } from '@/connectors/typesense/datasources';
import type { BaseSearchEntity } from '@/connectors/typesense/models';
import { throwNotSupported } from '@/utilities';
import type { TClass } from '@venizia/ignis-helpers';
import type { ISearchQuery, ISearchQueryDialect } from '../common';

/**
 * Search-repository plumbing on `AbstractRepository`: narrows dataSource/entity to the concrete
 * `TypesenseDataSource`/`BaseSearchEntity` so `dataSource.getConnector()` stays typed to the
 * `ISearchConnector` contract end to end, no casts.
 */
export abstract class SearchBaseRepository<
  TDocument extends object = object,
> extends AbstractRepository<TDocument, TDocument> {
  constructor(
    dataSource?: TypesenseDataSource,
    opts?: { scope?: string; entityClass?: TClass<BaseSearchEntity> },
  ) {
    super(dataSource, opts);
  }

  override get dataSource(): TypesenseDataSource {
    return super.dataSource as TypesenseDataSource;
  }

  override set dataSource(value: TypesenseDataSource) {
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

  protected get connector() {
    return this.dataSource.getConnector();
  }

  protected get queryDialect(): ISearchQueryDialect {
    return this.dataSource.getQueryDialect();
  }

  get multiSearch(): TypesenseDataSource['multiSearch'] {
    return this.dataSource.multiSearch.bind(this.dataSource);
  }

  override setDataSource(opts: { dataSource: TypesenseDataSource }): void {
    super.setDataSource(opts);
  }

  /**
   * Typesense has no transaction primitive - a caller-supplied options.transaction is rejected
   * loudly instead of silently running outside the transaction the caller expects.
   */
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

  /** Row-level locking (SELECT ... FOR UPDATE) has no Typesense equivalent - same NotSupported convention as assertNoTransaction. */
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
