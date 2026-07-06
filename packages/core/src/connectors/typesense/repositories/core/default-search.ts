import { TNullable } from '@venizia/ignis-helpers';
import { IExtraOptions, TCount, TWhere } from '@/base/repositories/common';
import { IdType } from '@/base/models';
import { PersistableSearchRepository } from './persistable';

/** Full CRUD search-repository tier - adds delete operations on top of `PersistableSearchRepository`. */
export class DefaultSearchRepository<
  TDocument extends object = object,
> extends PersistableSearchRepository<TDocument> {
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

    const didDelete = await this.dataSource.getDriver().deleteDocument({
      collection: this.collectionName,
      id: String(id),
    });

    if (!didDelete) {
      return { count: 0, data: null };
    }

    // Typesense's delete has no RETURNING equivalent - `data` is only populated when the
    // defaultFilter guard above already read the document; no extra read is done purely for shouldReturn.
    const data = options?.shouldReturn === false ? null : ((found as R) ?? null);
    return { count: 1, data };
  }

  override deleteAll(opts: {
    where?: TWhere;
    options: IExtraOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;

  override deleteAll<R = TDocument>(opts?: {
    where?: TWhere;
    options?: IExtraOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> }>;

  /** Filter-delete when there's an effective where (opts.where and/or defaultFilter); truncates the whole collection only when neither is present. Truncate reports no per-document count or data, so that path always returns { count: 0, data: null }. */
  override async deleteAll<R = TDocument>(opts?: {
    where?: TWhere;
    options?: IExtraOptions & { shouldReturn?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    this.assertNoTransaction(opts?.options);
    this.assertNoLock(opts?.options);

    const logger = this.logger.for(this.deleteAll.name);
    const { where, options } = opts ?? {};
    const filterBy = this.buildFilterBy({
      where,
      shouldSkipDefaultFilter: options?.shouldSkipDefaultFilter,
    });

    if (filterBy === undefined) {
      const didTruncate = await this.dataSource.getDriver().deleteAllDocuments({
        collection: this.collectionName,
      });

      logger.info(
        'Truncated collection (engine does not report a per-document count) | Collection: %s | Truncated: %s',
        this.collectionName,
        didTruncate,
      );

      // Truncate reports neither a count nor the removed rows - `[]` (not null) keeps `data` an
      // Array<R> like every other path; `null` is reserved for the explicit shouldReturn:false contract.
      return { count: 0, data: options?.shouldReturn === false ? null : [] };
    }

    // Typesense's delete-by-filter has no RETURNING equivalent - snapshots the about-to-be-deleted
    // rows via find() over the same filter before deleting; skipped when shouldReturn is false.
    const affected =
      options?.shouldReturn === false
        ? null
        : await this.find<R>({
            filter: { where },
            options: { shouldSkipDefaultFilter: options?.shouldSkipDefaultFilter },
          });

    const deletedCount = await this.dataSource.getDriver().deleteByFilter({
      collection: this.collectionName,
      filterBy,
    });

    return { count: deletedCount, data: affected };
  }
}
