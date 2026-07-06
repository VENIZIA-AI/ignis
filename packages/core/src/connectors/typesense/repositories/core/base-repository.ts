import { TClass } from '@venizia/ignis-helpers';
import { AbstractRepository } from '@/base/repositories/core';
import { TFilter, TLockOptions, TWhere } from '@/base/repositories/common';
import { ITransaction } from '@/base/datasources';
import { throwNotSupported } from '@/utilities';
import { BaseSearchEntity } from '@/connectors/typesense/models';
import { TypesenseDataSource } from '@/connectors/typesense/datasources';
import { ISearchQuery } from '../common';

/**
 * Typesense repository plumbing on `AbstractRepository`: narrows dataSource/entity to the
 * concrete `TypesenseDataSource`/`BaseSearchEntity` so `dataSource.getDriver()` stays typed end to end, no casts.
 */
export abstract class TypesenseBaseRepository<
  TDocument extends object = object,
> extends AbstractRepository<TDocument, TDocument> {
  constructor(
    dataSource?: TypesenseDataSource,
    opts?: { scope?: string; entityClass?: TClass<BaseSearchEntity> },
  ) {
    super(dataSource, opts);
  }

  override get dataSource(): TypesenseDataSource {
    // AbstractRepository's getter is engine-neutral (AbstractDataSource); every typesense
    // repository is only ever constructed with a TypesenseDataSource (see constructor), so the
    // narrowing is sound but not provable from the base class's stored type alone.
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

    return this.dataSource.getQueryDialect().translate({
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
