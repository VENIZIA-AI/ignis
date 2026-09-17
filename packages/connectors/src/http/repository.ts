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

/** The entity a remote resource stands for. `AbstractEntity` wants a name and a schema accessor; a resource over HTTP has the first and cannot honestly claim the second. */
export class HttpResourceEntity extends AbstractEntity {
  getSchema<T = unknown>(_opts: { type: TSchemaType }): T {
    return {} as T;
  }
}

/**
 * Read access to one remote resource, through {@link HttpDataSource}.
 *
 * `IReadableRepository` rather than `AbstractRepository`: the abstract class demands twelve members,
 * so a resource that cannot be written would have to stub `create`, `updateById` and `deleteById`
 * with throws. Five real methods say more than twelve where seven are lies.
 *
 * Every query leaves as the `@venizia/ignis-filter` vocabulary - the same language an IGNIS
 * repository speaks to Drizzle. One query language, two transports.
 */
export class HttpRepository<E extends object = AnyType> implements IReadableRepository<E, {}> {
  dataSource: HttpDataSource;
  entity: AbstractEntity;

  protected resource: string;
  /** An API that publishes a count route names it here. Absent, the total comes from `Content-Range`. */
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

  /**
   * How many rows match, asked of the list route rather than of one that may not exist.
   *
   * The default reads the total out of `Content-Range` - MECHANISM, because a route that pages at
   * all reports what it is paging over. A dedicated count route is CONVENTION: one API publishes
   * `/count`, another `/search/count`, another deleted it and told callers to read the header. So it
   * is opt-in through `countPath`.
   *
   * With no header there is NO total, and this says so rather than answering with the page size - a
   * count of 1 for a table of 7000 reads as healthy in every screen that consumes it.
   */
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
      throw getError({
        statusCode: 500,
        message: `[${this.resource}][count] The response carried no Content-Range, so there is no total to report - answering with the page size would claim ${rs.dataLength}. Give this repository a countPath if the API publishes a count route.`,
      });
    }

    return { count: rs.total ?? 0 };
  }

  async existsWith(opts: { where: TWhere<E>; options?: {} }): Promise<boolean> {
    const rs = await this.dataSource.read<Array<E>>({
      paths: [this.resource],
      query: { filter: { where: opts.where, limit: 1 } },
    });

    // Asked of the rows, not of the total: one row proves existence with no header needed.
    return rs.dataLength > 0;
  }

  // Two signatures, because the contract declares `find` as an overload with a range variant.
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
      throw getError({
        statusCode: 500,
        message: `[${this.resource}][find] A range was asked for and the response carried no Content-Range. Deriving it from the page would report ${data.length} as the total.`,
      });
    }

    // `TDataRange` follows the Content-Range standard, and `content-range` is the header this
    // transport receives - the envelope IGNIS paginates with and the protocol are the same thing,
    // so nothing is translated here.
    return {
      data,
      range: buildDataRange({ skip: rs.skip, dataLength: data.length, total: rs.total ?? 0 }),
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
