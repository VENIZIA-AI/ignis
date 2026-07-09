import type { TClass, TNullable } from '@venizia/ignis-helpers';
import { getError, HTTP } from '@venizia/ignis-helpers';

import type { AbstractEntity, IdType } from '@/base/models';
import { AbstractRepository } from '@/base/repositories/core';
import type {
  IExtraOptions,
  TCount,
  TDataRange,
  TFields,
  TFilter,
  TWhere,
} from '@/base/repositories/common';
import { DEFAULT_LIMIT } from '@/base/repositories/common';
import { throwNotSupported } from '@/utilities';
import type { MemoryDataSource } from '@/connectors/memory/datasources';
import { matchesWhere, sortDocuments } from '@/connectors/memory/internal';

const projectFields = (opts: {
  document: Record<string, unknown>;
  fields?: TFields;
}): Record<string, unknown> => {
  const { document, fields } = opts;

  if (!fields) {
    return { ...document };
  }

  if (Array.isArray(fields)) {
    const projected: Record<string, unknown> = {};
    for (const field of fields) {
      const key = String(field);
      if (key in document) {
        projected[key] = document[key];
      }
    }
    return projected;
  }

  // Object form: any `true` entry switches to whitelist mode (only those keys survive); a
  // `false`-only map switches to blacklist mode (every key except those survives) - mixed
  // true/false always resolves to whitelist, `true` wins, matching the documented example.
  const includeKeys = Object.keys(fields).filter(key => fields[key] === true);

  if (includeKeys.length > 0) {
    const projected: Record<string, unknown> = {};
    for (const key of includeKeys) {
      if (key in document) {
        projected[key] = document[key];
      }
    }
    return projected;
  }

  const excludeKeys = new Set(Object.keys(fields).filter(key => fields[key] === false));
  const projected: Record<string, unknown> = {};
  for (const key in document) {
    if (excludeKeys.has(key)) {
      continue;
    }
    projected[key] = document[key];
  }
  return projected;
};

/** `TDocument extends object = object` is intentionally opaque (the memory connector stores
 * arbitrary plain-JS documents with no compile-time schema); the connector's own convention - every
 * stored document carries an `id` key - can't be expressed in that generic bound. This is the one
 * boundary cast for reading/writing that convention field, reused instead of repeated inline. */
const asMutableRecord = (data: object): Record<string, unknown> => data as Record<string, unknown>;

/** `id` is immutable through update verbs - consistent with Postgres, where updating the primary
 * key via `updateById`/`updateAll` data is not the supported path. Strips any incoming `id` so it
 * can never diverge from the Map key the document is actually stored under. */
const stripId = (data: object): Record<string, unknown> => {
  const { id: _incomingId, ...rest } = asMutableRecord(data);
  return rest;
};

/**
 * Map-backed repository implementing every `AbstractRepository` verb directly (no tiering) - a
 * zero-dependency in-memory engine for prototyping and tests (the LoopBack memory-connector role).
 * Honors hiddenFields/defaultWhere/defaultLimit/fields/order from `@model` settings and `TFilter`
 * exactly like every other connector.
 */
export class MemoryRepository<TDocument extends object = object> extends AbstractRepository<
  TDocument,
  TDocument
> {
  constructor(
    dataSource?: MemoryDataSource,
    opts?: { scope?: string; entityClass?: TClass<AbstractEntity> },
  ) {
    super(dataSource, opts);
  }

  override get dataSource(): MemoryDataSource {
    // AbstractRepository's getter is engine-neutral (AbstractDataSource); this subclass is only
    // ever constructed with a MemoryDataSource (see constructor), so the narrowing is sound but
    // not provable from the base class's stored type alone.
    return super.dataSource as MemoryDataSource;
  }

  override set dataSource(value: MemoryDataSource) {
    super.dataSource = value;
  }

  private get collectionName(): string {
    return this.entity.name;
  }

  private get collection(): Map<string, Record<string, unknown>> {
    return this.dataSource.getStore({ name: this.collectionName });
  }

  /** Postgres/typesense each reject a caller-supplied transaction the same way - mirrors that
   * convention instead of inventing a new one. */
  private assertNoTransaction(options?: IExtraOptions): void {
    if (!options?.transaction) {
      return;
    }

    throwNotSupported({
      scope: this.dataSource.constructor.name,
      feature: 'Transactions',
      logger: this.logger,
    });
  }

  /** Row-level locking has no plain-JS-object equivalent - same NotSupported convention as
   * `assertNoTransaction`. */
  private assertNoLock(options?: IExtraOptions): void {
    if (!options?.lock) {
      return;
    }

    throwNotSupported({
      scope: this.dataSource.constructor.name,
      feature: 'Row-level locking',
      logger: this.logger,
    });
  }

  /** `include` (relations) has no meaning over a flat Map store - every other connector either
   * translates it or throws; this one always throws. */
  private assertNoInclude(filter?: Pick<TFilter, 'include'>): void {
    if (!filter?.include) {
      return;
    }

    throw getError({
      message: `[${this.constructor.name}] find() does not support "include" - the memory connector has no relation model`,
    });
  }

  /** AND-merges @model settings.defaultFilter.where into every read/write unless shouldSkipDefaultFilter. */
  private effectiveWhere(opts: {
    where?: TWhere;
    shouldSkipDefaultFilter?: boolean;
  }): TWhere | undefined {
    const { where, shouldSkipDefaultFilter } = opts;
    const defaultWhere = shouldSkipDefaultFilter ? undefined : this.defaultWhere;

    if (!defaultWhere) {
      return where;
    }

    if (!where) {
      return defaultWhere;
    }

    return { and: [defaultWhere, where] };
  }

  /** Deep-clones the stored document before projecting - the store and every caller must own
   * independent copies of nested values, never a shared reference into the Map. */
  private toOutput<R>(opts: { document: Record<string, unknown>; fields?: TFields }): R {
    const { document, fields } = opts;
    const cloned = structuredClone(document);
    const projected = projectFields({ document: cloned, fields });
    const hidden = this.hiddenFields;

    // R is the caller-chosen output shape (defaults to TDocument); the projected/filtered plain
    // record can't be runtime-validated against an arbitrary caller-supplied R.
    if (hidden.length === 0) {
      return projected as R;
    }

    const hiddenSet = new Set(hidden);
    const result: Record<string, unknown> = {};

    for (const key in projected) {
      if (hiddenSet.has(key)) {
        continue;
      }
      result[key] = projected[key];
    }

    return result as R;
  }

  async count(opts: { where: TWhere<TDocument>; options?: IExtraOptions }): Promise<TCount> {
    this.assertNoTransaction(opts.options);
    this.assertNoLock(opts.options);

    const where = this.effectiveWhere({
      where: opts.where,
      shouldSkipDefaultFilter: opts.options?.shouldSkipDefaultFilter,
    });

    let count = 0;
    for (const document of this.collection.values()) {
      if (matchesWhere({ document, where })) {
        count++;
      }
    }

    return { count };
  }

  async existsWith(opts: { where: TWhere<TDocument>; options?: IExtraOptions }): Promise<boolean> {
    const { count } = await this.count(opts);
    return count > 0;
  }

  find<R = TDocument>(opts: {
    filter: TFilter<TDocument>;
    options: IExtraOptions & { shouldQueryRange: true };
  }): Promise<{ data: Array<R>; range: TDataRange }>;

  find<R = TDocument>(opts: {
    filter: TFilter<TDocument>;
    options?: IExtraOptions & { shouldQueryRange?: false };
  }): Promise<Array<R>>;

  async find<R = TDocument>(opts: {
    filter: TFilter<TDocument>;
    options?: IExtraOptions & { shouldQueryRange?: boolean };
  }): Promise<Array<R> | { data: Array<R>; range: TDataRange }> {
    this.assertNoTransaction(opts.options);
    this.assertNoLock(opts.options);
    this.assertNoInclude(opts.filter);

    const { filter, options } = opts;
    const where = this.effectiveWhere({
      where: filter?.where,
      shouldSkipDefaultFilter: options?.shouldSkipDefaultFilter,
    });

    let matched = [...this.collection.values()].filter(document =>
      matchesWhere({ document, where }),
    );

    if (filter?.order && filter.order.length > 0) {
      matched = sortDocuments({ documents: matched, order: filter.order });
    }

    const skip = filter?.skip ?? filter?.offset ?? 0;
    const limit = filter?.limit ?? this.defaultLimit ?? DEFAULT_LIMIT;
    const total = matched.length;
    const page = matched.slice(skip, skip + limit);
    const data = page.map(document => this.toOutput<R>({ document, fields: filter?.fields }));

    if (!options?.shouldQueryRange) {
      return data;
    }

    const end = data.length > 0 ? skip + data.length - 1 : skip;
    return { data, range: { start: skip, end, total } };
  }

  async findOne<R = TDocument>(opts: {
    filter: TFilter<TDocument>;
    options?: IExtraOptions;
  }): Promise<TNullable<R>> {
    const { filter, options } = opts;
    const results = await this.find<R>({ filter: { ...filter, limit: 1 }, options });
    return results[0] ?? null;
  }

  /** Looks up by the same `String(id)` Map key `updateById`/`deleteById` use - a numeric `5` and a
   * string `'5'` id resolve to the same document everywhere, instead of `findById` value-matching
   * the `id` field while the write verbs key off the coerced Map key. */
  async findById<R = TDocument>(opts: {
    id: IdType;
    filter?: Omit<TFilter<TDocument>, 'where'>;
    options?: IExtraOptions;
  }): Promise<TNullable<R>> {
    this.assertNoTransaction(opts.options);
    this.assertNoLock(opts.options);
    this.assertNoInclude(opts.filter);

    const { id, filter, options } = opts;
    const document = this.collection.get(String(id));

    if (!document) {
      return null;
    }

    const where = this.effectiveWhere({
      shouldSkipDefaultFilter: options?.shouldSkipDefaultFilter,
    });

    if (where && !matchesWhere({ document, where })) {
      return null;
    }

    return this.toOutput<R>({ document, fields: filter?.fields });
  }

  create(opts: {
    data: TDocument;
    options: IExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;

  create<R = TDocument>(opts: {
    data: TDocument;
    options?: IExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;

  async create<R = TDocument>(opts: {
    data: TDocument;
    options?: IExtraOptions & { shouldReturn?: boolean };
  }): Promise<TCount & { data: TNullable<R> }> {
    this.assertNoTransaction(opts.options);
    this.assertNoLock(opts.options);

    const record = asMutableRecord(structuredClone(opts.data));
    // String ids (AbstractEntity.getIdType() defaults to 'string' for every document-family
    // engine) - crypto.randomUUID() is a zero-dependency global on both Bun and Node >= 14.17.
    record.id = record.id ?? crypto.randomUUID();
    this.collection.set(String(record.id), record);

    if (opts.options?.shouldReturn === false) {
      return { count: 1, data: null };
    }

    return { count: 1, data: this.toOutput<R>({ document: record }) };
  }

  createAll(opts: {
    data: Array<TDocument>;
    options: IExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;

  createAll<R = TDocument>(opts: {
    data: Array<TDocument>;
    options?: IExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: Array<R> }>;

  async createAll<R = TDocument>(opts: {
    data: Array<TDocument>;
    options?: IExtraOptions & { shouldReturn?: boolean };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    this.assertNoTransaction(opts.options);
    this.assertNoLock(opts.options);

    const created: Array<Record<string, unknown>> = [];
    for (const item of opts.data) {
      const record = asMutableRecord(structuredClone(item));
      record.id = record.id ?? crypto.randomUUID();
      this.collection.set(String(record.id), record);
      created.push(record);
    }

    if (opts.options?.shouldReturn === false) {
      return { count: created.length, data: null };
    }

    return {
      count: created.length,
      data: created.map(document => this.toOutput<R>({ document })),
    };
  }

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

  async updateById<R = TDocument>(opts: {
    id: IdType;
    data: Partial<TDocument>;
    options?: IExtraOptions & { shouldReturn?: boolean };
  }): Promise<TCount & { data: TNullable<R> }> {
    this.assertNoTransaction(opts.options);
    this.assertNoLock(opts.options);

    const key = String(opts.id);
    const existing = this.collection.get(key);
    const where = this.effectiveWhere({
      shouldSkipDefaultFilter: opts.options?.shouldSkipDefaultFilter,
    });

    if (!existing || !matchesWhere({ document: existing, where })) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.NotFound,
        messageCode: 'core.not_found',
        message: `[${this.constructor.name}][updateById] No record found for id '${key}'.`,
      });
    }

    const restData = stripId(opts.data);
    const updated: Record<string, unknown> = structuredClone({ ...existing, ...restData });
    this.collection.set(key, updated);

    if (opts.options?.shouldReturn === false) {
      return { count: 1, data: null };
    }

    return { count: 1, data: this.toOutput<R>({ document: updated }) };
  }

  updateAll(opts: {
    data: Partial<TDocument>;
    where: TWhere<TDocument>;
    options: IExtraOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;

  updateAll<R = TDocument>(opts: {
    data: Partial<TDocument>;
    where: TWhere<TDocument>;
    options?: IExtraOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> }>;

  async updateAll<R = TDocument>(opts: {
    data: Partial<TDocument>;
    where: TWhere<TDocument>;
    options?: IExtraOptions & { shouldReturn?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    this.assertNoTransaction(opts.options);
    this.assertNoLock(opts.options);

    const where = this.effectiveWhere({
      where: opts.where,
      shouldSkipDefaultFilter: opts.options?.shouldSkipDefaultFilter,
    });

    const restData = stripId(opts.data);
    const updated: Array<Record<string, unknown>> = [];
    for (const [key, document] of this.collection.entries()) {
      if (!matchesWhere({ document, where })) {
        continue;
      }

      const merged: Record<string, unknown> = structuredClone({ ...document, ...restData });
      this.collection.set(key, merged);
      updated.push(merged);
    }

    if (opts.options?.shouldReturn === false) {
      return { count: updated.length, data: null };
    }

    return {
      count: updated.length,
      data: updated.map(document => this.toOutput<R>({ document })),
    };
  }

  deleteById(opts: {
    id: IdType;
    options: IExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;

  deleteById<R = TDocument>(opts: {
    id: IdType;
    options?: IExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;

  async deleteById<R = TDocument>(opts: {
    id: IdType;
    options?: IExtraOptions & { shouldReturn?: boolean };
  }): Promise<TCount & { data: TNullable<R> }> {
    this.assertNoTransaction(opts.options);
    this.assertNoLock(opts.options);

    const key = String(opts.id);
    const existing = this.collection.get(key);
    const where = this.effectiveWhere({
      shouldSkipDefaultFilter: opts.options?.shouldSkipDefaultFilter,
    });

    if (!existing || !matchesWhere({ document: existing, where })) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.NotFound,
        messageCode: 'core.not_found',
        message: `[${this.constructor.name}][deleteById] No record found for id '${key}'.`,
      });
    }

    this.collection.delete(key);

    if (opts.options?.shouldReturn === false) {
      return { count: 1, data: null };
    }

    return { count: 1, data: this.toOutput<R>({ document: existing }) };
  }

  deleteAll(opts: {
    where?: TWhere<TDocument>;
    options: IExtraOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;

  deleteAll<R = TDocument>(opts?: {
    where?: TWhere<TDocument>;
    options?: IExtraOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> }>;

  async deleteAll<R = TDocument>(opts?: {
    where?: TWhere<TDocument>;
    options?: IExtraOptions & { shouldReturn?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    this.assertNoTransaction(opts?.options);
    this.assertNoLock(opts?.options);

    const where = this.effectiveWhere({
      where: opts?.where,
      shouldSkipDefaultFilter: opts?.options?.shouldSkipDefaultFilter,
    });

    const removed: Array<Record<string, unknown>> = [];
    for (const [key, document] of this.collection.entries()) {
      if (!matchesWhere({ document, where })) {
        continue;
      }

      removed.push(document);
      this.collection.delete(key);
    }

    if (opts?.options?.shouldReturn === false) {
      return { count: removed.length, data: null };
    }

    return {
      count: removed.length,
      data: removed.map(document => this.toOutput<R>({ document })),
    };
  }
}
