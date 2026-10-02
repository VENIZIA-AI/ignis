import type { AnyType } from '@venizia/ignis-helpers/common';
import { HTTP } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import type {
    IDeletableRepository,
    IReadableRepository,
    IUpdatableRepository,
    TCount,
    TDataWithRange,
    TFilter,
    TSchemaType,
    TWhere,
} from '@venizia/ignis-kernel/repository';
import { AbstractEntity, buildDataRange } from '@venizia/ignis-kernel/repository';
import type { IHttpWriteResult } from './common/types';
import type { HttpDataSource } from './datasource';

/** A remote resource has a name but no local schema. */
export class HttpResourceEntity extends AbstractEntity {
  getSchema<T = unknown>(_opts: { type: TSchemaType }): T {
    return {} as T;
  }
}

/**
 * One remote resource, read and written through the IGNIS CRUD routes, in the `@venizia/ignis-filter`
 * vocabulary. `P` is what a write sends - a partial row by default, since the server fills ids and
 * defaults. There is no `createAll`: the IGNIS REST contract has no bulk-create route.
 */
export class HttpRepository<E extends object = AnyType, P extends object = Partial<E>>
  implements IReadableRepository<E, {}>, IUpdatableRepository<E, P, {}>, IDeletableRepository<E, {}>
{
  dataSource: HttpDataSource;
  entity: AbstractEntity;

  protected resource: string;
  /** A count route, if the API has one. Absent, the total comes from `Content-Range`. */
  protected countPath?: string;

  constructor(opts: { dataSource: HttpDataSource; resource: string; countPath?: string }) {
    this.dataSource = opts.dataSource;
    this.resource = opts.resource;
    this.countPath = opts.countPath;
    this.entity = new HttpResourceEntity({ name: opts.resource });
  }

  getEntity(): AbstractEntity {
    return this.entity;
  }

  /** No header and an unreadable one (`/*`) have different fixes, so different messages. */
  protected getMissingTotalError(opts: {
    method: string;
    contentRange?: string;
    noHeader: string;
  }) {
    const { method, contentRange, noHeader } = opts;
    const message = contentRange
      ? `Content-Range "${contentRange}" carries no readable total - an unknown "/*" or an unparseable value. Check the server's count query.`
      : noHeader;

    return getError({
      statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
      message: `[${this.resource}][${method}] ${message}`,
    });
  }

  /** From `Content-Range`, or `countPath`. No total throws rather than reporting the page size. */
  async count(opts: { where: TWhere<E>; options?: {} }): Promise<TCount> {
    if (this.countPath) {
      const rs = await this.dataSource.read<{ count: number }>({
        paths: [this.resource, this.countPath],
        query: { where: opts.where },
        shape: 'one',
      });

      const counted = rs.data?.count;
      if (typeof counted !== 'number' || !Number.isFinite(counted)) {
        throw getError({
          statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
          message: `[${this.resource}][count] The count route answered no numeric count - answering 0 would read as an empty table. Body: ${JSON.stringify(rs.data)?.slice(0, 120)}`,
        });
      }

      return { count: counted };
    }

    const rs = await this.dataSource.read<Array<E>>({
      paths: [this.resource],
      query: { filter: { where: opts.where, limit: 1 } },
    });

    if (!rs.hasRange) {
      throw this.getMissingTotalError({
        method: 'count',
        contentRange: rs.contentRange,
        noHeader: `The response carried no Content-Range, so there is no total to report - answering with the page size would claim ${rs.dataLength}. Give this repository a countPath if the API publishes a count route.`,
      });
    }

    return { count: rs.total ?? 0 };
  }

  async existsWith(opts: { where: TWhere<E>; options?: {} }): Promise<boolean> {
    const rs = await this.dataSource.read<Array<E>>({
      paths: [this.resource],
      query: { filter: { where: opts.where, limit: 1 } },
    });

    return rs.dataLength > 0;
  }

  async find<R = E>(opts: {
    filter: TFilter<E>;
    options: { shouldQueryRange: true };
  }): Promise<TDataWithRange<R>>;
  async find<R = E>(opts: { filter?: TFilter<E>; options?: {} }): Promise<Array<R>>;
  async find<R = E>(opts: {
    filter?: TFilter<E>;
    options?: AnyType;
  }): Promise<Array<R> | TDataWithRange<R>> {
    const rs = await this.dataSource.read<Array<R>>({
      paths: [this.resource],
      query: { filter: opts.filter ?? {} },
    });

    const data = rs.data ?? [];

    if (!opts.options?.shouldQueryRange) {
      return data;
    }

    if (!rs.hasRange) {
      throw this.getMissingTotalError({
        method: 'find',
        contentRange: rs.contentRange,
        noHeader: `A range was asked for and the response carried no Content-Range. Deriving it from the page would report ${data.length} as the total.`,
      });
    }

    return {
      data,
      // An empty page names no start: take it from the filter, as the server did.
      range: buildDataRange({
        skip: rs.skip ?? opts.filter?.skip,
        offset: opts.filter?.offset,
        dataLength: data.length,
        total: rs.total ?? 0,
      }),
    };
  }

  async findOne<R = E>(opts: { filter?: TFilter<E>; options?: {} }): Promise<R | null> {
    const rs = await this.find<R>({ filter: { ...(opts.filter ?? {}), limit: 1 } as TFilter<E> });
    return rs[0] ?? null;
  }

  async findById<R = E>(opts: {
    id: string | number;
    filter?: TFilter<E>;
    options?: {};
  }): Promise<R | null> {
    const rs = await this.dataSource.read<R>({
      paths: this.getIdPaths({ id: opts.id }),
      query: { filter: opts.filter ?? {} },
      shape: 'one',
    });

    return rs.data ?? null;
  }

  /** `<resource>/<id>`, the id encoded: an id carrying `/` or `?` would otherwise name another route. */
  protected getIdPaths(opts: { id: string | number }): Array<string> {
    return [this.resource, encodeURIComponent(String(opts.id))];
  }

  /** The IGNIS bulk routes answer an empty `where` with a 400; refused here before a request is spent. */
  protected assertBulkWhere(opts: { method: string; where?: TWhere<E> }): TWhere<E> {
    const { method, where } = opts;

    if (!where || Object.keys(where).length === 0) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message: `[${this.resource}][${method}] where is required for a bulk write | The IGNIS bulk routes refuse an empty where, and force cannot cross HTTP`,
      });
    }

    return where;
  }

  /** The server always answers the rows; `shouldReturn: false` drops them here, as a database repository would not fetch them. */
  protected toWriteResult<R>(opts: {
    result: IHttpWriteResult<R>;
    options?: { shouldReturn?: boolean };
  }): TCount & { data: R | null } {
    const { result, options } = opts;
    return { count: result.count, data: options?.shouldReturn === false ? null : result.data };
  }

  /** POST `/<resource>`. */
  async create<R = E>(opts: {
    data: P;
    options?: { shouldReturn?: true };
  }): Promise<TCount & { data: R }> {
    const result = await this.dataSource.write<R>({
      paths: [this.resource],
      method: HTTP.Methods.POST,
      body: opts.data,
    });

    return { count: result.count, data: result.data };
  }

  async updateById(opts: {
    id: string | number;
    data: Partial<P>;
    options: { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;
  async updateById<R = E>(opts: {
    id: string | number;
    data: Partial<P>;
    options?: { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;
  /** PATCH `/<resource>/<id>`. */
  async updateById<R = E>(opts: {
    id: string | number;
    data: Partial<P>;
    options?: { shouldReturn?: boolean };
  }): Promise<TCount & { data: AnyType }> {
    const result = await this.dataSource.write<R>({
      paths: this.getIdPaths({ id: opts.id }),
      method: HTTP.Methods.PATCH,
      body: opts.data,
    });

    return this.toWriteResult({ result, options: opts.options });
  }

  async updateAll(opts: {
    data: Partial<P>;
    where: TWhere<E>;
    options: { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;
  async updateAll<R = E>(opts: {
    data: Partial<P>;
    where: TWhere<E>;
    options?: { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> | null }>;
  /** PATCH `/<resource>`, the `where` in the body beside the data - a long id list outgrows a URL. */
  async updateAll(opts: {
    data: Partial<P>;
    where: TWhere<E>;
    options?: { shouldReturn?: boolean; force?: boolean };
  }): Promise<TCount & { data: AnyType }> {
    return this.patchWhere({ ...opts, method: 'updateAll' });
  }

  async updateBy(opts: {
    data: Partial<P>;
    where: TWhere<E>;
    options: { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;
  async updateBy<R = E>(opts: {
    data: Partial<P>;
    where: TWhere<E>;
    options?: { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> | null }>;
  /** Alias for `updateAll`. */
  async updateBy(opts: {
    data: Partial<P>;
    where: TWhere<E>;
    options?: { shouldReturn?: boolean; force?: boolean };
  }): Promise<TCount & { data: AnyType }> {
    return this.patchWhere({ ...opts, method: 'updateBy' });
  }

  protected async patchWhere(opts: {
    method: string;
    data: Partial<P>;
    where: TWhere<E>;
    options?: { shouldReturn?: boolean };
  }): Promise<TCount & { data: AnyType }> {
    const where = this.assertBulkWhere({ method: opts.method, where: opts.where });

    const result = await this.dataSource.write<Array<E>>({
      paths: [this.resource],
      method: HTTP.Methods.PATCH,
      body: { ...opts.data, where },
    });

    return this.toWriteResult({ result, options: opts.options });
  }

  async deleteById(opts: {
    id: string | number;
    options: { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;
  async deleteById<R = E>(opts: {
    id: string | number;
    options?: { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;
  /** DELETE `/<resource>/<id>`. */
  async deleteById<R = E>(opts: {
    id: string | number;
    options?: { shouldReturn?: boolean };
  }): Promise<TCount & { data: AnyType }> {
    const result = await this.dataSource.write<R>({
      paths: this.getIdPaths({ id: opts.id }),
      method: HTTP.Methods.DELETE,
    });

    return this.toWriteResult({ result, options: opts.options });
  }

  async deleteAll(opts: {
    where?: TWhere<E>;
    options: { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;
  async deleteAll<R = E>(opts: {
    where?: TWhere<E>;
    options?: { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> | null }>;
  /** DELETE `/<resource>`, the `where` in the body. */
  async deleteAll(opts: {
    where?: TWhere<E>;
    options?: { shouldReturn?: boolean; force?: boolean };
  }): Promise<TCount & { data: AnyType }> {
    return this.deleteWhere({ ...opts, method: 'deleteAll' });
  }

  async deleteBy(opts: {
    where?: TWhere<E>;
    options: { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;
  async deleteBy<R = E>(opts: {
    where?: TWhere<E>;
    options?: { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> | null }>;
  /** Alias for `deleteAll`. */
  async deleteBy(opts: {
    where?: TWhere<E>;
    options?: { shouldReturn?: boolean; force?: boolean };
  }): Promise<TCount & { data: AnyType }> {
    return this.deleteWhere({ ...opts, method: 'deleteBy' });
  }

  protected async deleteWhere(opts: {
    method: string;
    where?: TWhere<E>;
    options?: { shouldReturn?: boolean };
  }): Promise<TCount & { data: AnyType }> {
    const where = this.assertBulkWhere({ method: opts.method, where: opts.where });

    const result = await this.dataSource.write<Array<E>>({
      paths: [this.resource],
      method: HTTP.Methods.DELETE,
      body: { where },
    });

    return this.toWriteResult({ result, options: opts.options });
  }
}
