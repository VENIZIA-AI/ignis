import { AbstractEntity, buildDataRange } from '@venizia/ignis-kernel/repository';
import type {
  IReadableRepository,
  TCount,
  TDataWithRange,
  TFilter,
  TSchemaType,
  TWhere,
} from '@venizia/ignis-kernel/repository';
import { getError } from '@venizia/ignis-helpers/core';
import type { AnyType } from '@venizia/ignis-helpers/common';
import type { HttpDataSource } from './datasource';

/** A remote resource has a name but no local schema. */
export class HttpResourceEntity extends AbstractEntity {
  getSchema<T = unknown>(_opts: { type: TSchemaType }): T {
    return {} as T;
  }
}

/** Read access to one remote resource, in the `@venizia/ignis-filter` vocabulary. */
export class HttpRepository<E extends object = AnyType> implements IReadableRepository<E, {}> {
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

    return getError({ statusCode: 500, message: `[${this.resource}][${method}] ${message}` });
  }

  /** From `Content-Range`, or `countPath`. No total throws rather than reporting the page size. */
  async count(opts: { where: TWhere<E>; options?: {} }): Promise<TCount> {
    if (this.countPath) {
      const rs = await this.dataSource.read<{ count: number }>({
        paths: [this.resource, this.countPath],
        query: { where: opts.where },
        shape: 'one',
      });

      return { count: rs.data?.count ?? 0 };
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
      paths: [this.resource, `${opts.id}`],
      query: { filter: opts.filter ?? {} },
      shape: 'one',
    });

    return rs.data ?? null;
  }
}
