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
import type { TSearchInput } from '../search/core/repositories/common/constants';
import type {
  IHttpCallOptions,
  IHttpSearchResult,
  IHttpWriteResult,
  THttpExtraQuery,
  TExtraRequest,
  TExtraResult,
} from './common/types';
import type { HttpDataSource } from './datasource';

/**
 * What a repository call takes. Only `headers` and `signal` cross HTTP; the shared repository
 * options (`transaction`, `log`, ...) are accepted for the common contract and have no effect.
 */
export type THttpRepositoryOptions = NonNullable<
  Parameters<IReadableRepository['existsWith']>[0]['options']
> &
  IHttpCallOptions;

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
  implements
    IReadableRepository<E, THttpRepositoryOptions>,
    IUpdatableRepository<E, P, THttpRepositoryOptions>,
    IDeletableRepository<E, THttpRepositoryOptions>
{
  dataSource: HttpDataSource;
  entity: AbstractEntity;

  protected resource: string;
  /** A count route, if the API has one. Absent, the total comes from `Content-Range`. */
  protected countPath?: string;
  /** The segment after the resource that names the IGNIS find-one route. Absent, `findOne` asks the list route for one row. */
  protected findOnePath?: string;
  /** The page size `find` asks for when its filter names no limit. Absent, the server's own default applies. */
  protected defaultLimit?: number;
  /** The segment after the resource that names the IGNIS search route. */
  protected searchPath: string;

  constructor(opts: {
    dataSource: HttpDataSource;
    resource: string;
    countPath?: string;
    findOnePath?: string;
    defaultLimit?: number;
    searchPath?: string;
  }) {
    const { defaultLimit } = opts;

    if (defaultLimit !== undefined && !(Number.isInteger(defaultLimit) && defaultLimit > 0)) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${opts.resource}] defaultLimit must be a positive integer | Got ${defaultLimit}`,
      });
    }

    this.dataSource = opts.dataSource;
    this.resource = opts.resource;
    this.countPath = opts.countPath;
    this.findOnePath = opts.findOnePath;
    this.defaultLimit = defaultLimit;
    this.searchPath = opts.searchPath ?? 'search';
    this.entity = new HttpResourceEntity({ name: opts.resource });
  }

  getEntity(): AbstractEntity {
    return this.entity;
  }

  /**
   * The query string of a read: the caller's extra `query` with the call's own `params` (`filter`,
   * `where`) over it. `method` names the repository verb, so a subclass can reshape one route - a
   * keyword into the object its server reads - and leave the others.
   */
  protected buildQuery(opts: {
    method: string;
    query?: THttpExtraQuery;
    params: Record<string, unknown>;
  }): Record<string, unknown> {
    return { ...opts.query, ...opts.params };
  }

  /** The filter `find` sends: the caller's, with `defaultLimit` filled in when it names no limit. */
  protected resolveFindFilter(opts: { filter?: TFilter<E> }): TFilter<E> {
    const filter = opts.filter ?? {};

    return this.defaultLimit === undefined || filter.limit !== undefined
      ? filter
      : { ...filter, limit: this.defaultLimit };
  }

  /** `<resource>/<searchPath>`; override to move the route. */
  protected getSearchPaths(): Array<string> {
    return [this.resource, this.searchPath];
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
  async count(opts: {
    where: TWhere<E>;
    query?: THttpExtraQuery;
    options?: THttpRepositoryOptions;
  }): Promise<TCount> {
    if (this.countPath) {
      const rs = await this.dataSource.read<{ count: number }>({
        paths: [this.resource, this.countPath],
        query: this.buildQuery({
          method: 'count',
          query: opts.query,
          params: { where: opts.where },
        }),
        shape: 'one',
        isEveryDefaultOff: true,
        ...this.toCallOptions({ options: opts.options }),
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
      query: this.buildQuery({
        method: 'count',
        query: opts.query,
        params: { filter: { where: opts.where, limit: 1 } },
      }),
      // Rows alone: a default extra would be computed and thrown away on every count or probe.
      isEveryDefaultOff: true,
      ...this.toCallOptions({ options: opts.options }),
    });

    if (!rs.hasRange) {
      throw this.getMissingTotalError({
        method: 'count',
        contentRange: rs.contentRange,
        noHeader: `The response carried no Content-Range, so there is no total to report - answering with the page size would claim ${rs.dataLength}. Cross-origin, the server must list Content-Range in Access-Control-Expose-Headers; otherwise give this repository a countPath if the API publishes a count route.`,
      });
    }

    return { count: rs.total ?? 0 };
  }

  async existsWith(opts: {
    where: TWhere<E>;
    query?: THttpExtraQuery;
    options?: THttpRepositoryOptions;
  }): Promise<boolean> {
    const rs = await this.dataSource.read<Array<E>>({
      paths: [this.resource],
      query: this.buildQuery({
        method: 'existsWith',
        query: opts.query,
        params: { filter: { where: opts.where, limit: 1 } },
      }),
      // Rows alone: a default extra would be computed and thrown away on every count or probe.
      isEveryDefaultOff: true,
      ...this.toCallOptions({ options: opts.options }),
    });

    return rs.dataLength > 0;
  }

  /** With `extra`: what the route answered beside the rows, typed by what was asked for. */
  async find<R = E, const Extra extends TExtraRequest = TExtraRequest>(opts: {
    filter: TFilter<E>;
    query?: THttpExtraQuery;
    options: THttpRepositoryOptions & { shouldQueryRange: true; extra: Extra };
  }): Promise<TDataWithRange<R> & { extra: TExtraResult<Extra> }>;
  async find<R = E>(opts: {
    filter: TFilter<E>;
    query?: THttpExtraQuery;
    options: THttpRepositoryOptions & { shouldQueryRange: true };
  }): Promise<TDataWithRange<R>>;
  async find<R = E, const Extra extends TExtraRequest = TExtraRequest>(opts: {
    filter?: TFilter<E>;
    query?: THttpExtraQuery;
    options: THttpRepositoryOptions & { extra: Extra };
  }): Promise<{ data: Array<R>; extra: TExtraResult<Extra> }>;
  async find<R = E>(opts: {
    filter?: TFilter<E>;
    query?: THttpExtraQuery;
    options?: THttpRepositoryOptions;
  }): Promise<Array<R>>;
  /** `extra` or the range decided at run time: the caller narrows the union. */
  async find<R = E>(opts: {
    filter?: TFilter<E>;
    query?: THttpExtraQuery;
    options?: THttpRepositoryOptions & { shouldQueryRange?: boolean; extra?: TExtraRequest };
  }): Promise<
    Array<R> | TDataWithRange<R> | { data: Array<R>; extra: TExtraResult<TExtraRequest> }
  >;
  async find<R = E>(opts: {
    filter?: TFilter<E>;
    query?: THttpExtraQuery;
    options?: AnyType;
  }): Promise<Array<R> | TDataWithRange<R> | { data: Array<R>; extra?: Record<string, unknown> }> {
    const filter = this.resolveFindFilter({ filter: opts.filter });
    const rs = await this.dataSource.read<Array<R>>({
      paths: [this.resource],
      query: this.buildQuery({
        method: 'find',
        query: opts.query,
        params: { filter },
      }),
      extra: opts.options?.extra,
      ...this.toCallOptions({ options: opts.options }),
    });

    const data = rs.data ?? [];

    if (!opts.options?.shouldQueryRange) {
      return opts.options?.extra ? { data, extra: rs.extra ?? {} } : data;
    }

    if (!rs.hasRange) {
      throw this.getMissingTotalError({
        method: 'find',
        contentRange: rs.contentRange,
        noHeader: `A range was asked for and the response carried no Content-Range. Deriving it from the page would report ${data.length} as the total. Cross-origin, the server must list Content-Range in Access-Control-Expose-Headers.`,
      });
    }

    return {
      data,
      // An empty page names no start: take it from the filter, as the server did.
      range: buildDataRange({
        skip: rs.skip ?? filter.skip,
        offset: filter.offset,
        dataLength: data.length,
        total: rs.total ?? 0,
      }),
      // Asked for, `extra` is always there - empty when the route offered none.
      ...(opts.options?.extra ? { extra: rs.extra ?? {} } : {}),
    };
  }

  async findOne<R = E>(opts: {
    filter?: TFilter<E>;
    query?: THttpExtraQuery;
    options?: THttpRepositoryOptions;
  }): Promise<R | null> {
    if (this.findOnePath) {
      const one = await this.dataSource.read<R | null>({
        paths: [this.resource, this.findOnePath],
        query: this.buildQuery({
          method: 'findOne',
          query: opts.query,
          params: { filter: opts.filter ?? {} },
        }),
        shape: 'one',
        isEveryDefaultOff: true,
        ...this.toCallOptions({ options: opts.options }),
      });
      return one.data ?? null;
    }

    const rs = await this.dataSource.read<Array<R>>({
      paths: [this.resource],
      query: this.buildQuery({
        method: 'findOne',
        query: opts.query,
        params: { filter: { ...(opts.filter ?? {}), limit: 1 } },
      }),
      isEveryDefaultOff: true,
      ...this.toCallOptions({ options: opts.options }),
    });
    return rs.data?.[0] ?? null;
  }

  /** The server answers `null`, never 404, for a missing id. A `where` would be replaced by the id. */
  async findById<R = E>(opts: {
    id: string | number;
    filter?: Omit<TFilter<E>, 'where'>;
    query?: THttpExtraQuery;
    options?: THttpRepositoryOptions;
  }): Promise<R | null> {
    const rs = await this.dataSource.read<R>({
      paths: this.getIdPaths({ id: opts.id }),
      query: this.buildQuery({
        method: 'findById',
        query: opts.query,
        params: { filter: opts.filter ?? {} },
      }),
      shape: 'one',
      ...this.toCallOptions({ options: opts.options }),
    });

    return rs.data ?? null;
  }

  /**
   * POST `<resource>/search`, the IGNIS search route: `input` is its body (a keyword, semantic, hybrid
   * or raw search), the answer its `{ found, isFoundExact, hits }`. `found` is the total - there is no
   * count route for a search, and `isFoundExact` says when it is an estimate.
   */
  async search<R extends object = E>(opts: {
    input: TSearchInput;
    query?: THttpExtraQuery;
    options?: THttpRepositoryOptions;
  }): Promise<IHttpSearchResult<R>> {
    const rs = await this.dataSource.read<IHttpSearchResult<R> | null>({
      paths: this.getSearchPaths(),
      method: HTTP.Methods.POST,
      body: opts.input,
      query: this.buildQuery({ method: 'search', query: opts.query, params: {} }),
      shape: 'one',
      ...this.toCallOptions({ options: opts.options }),
    });

    const answer = rs.data;
    if (!answer || typeof answer.found !== 'number' || !Array.isArray(answer.hits)) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.BadGateway,
        message: `[${this.resource}][search] The search route answered no { found, hits } envelope - answering an empty page would read as no match. Body: ${JSON.stringify(answer)?.slice(0, 120)}`,
      });
    }

    return answer;
  }

  /**
   * `<resource>/<id>`, the id encoded: an id carrying `/` or `?` would otherwise name another route.
   * An empty, `.` or `..` id is refused: a URL resolves it, encoded or not, to `/<resource>/` or the
   * parent - a router or proxy that ignores the trailing slash then serves the list or bulk route.
   */
  protected getIdPaths(opts: { id: string | number }): Array<string> {
    const id = String(opts.id);

    if (id === '' || id === '.' || id === '..') {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message: `[${this.resource}] Invalid id '${id}' | An empty, '.' or '..' id names another route`,
      });
    }

    return [this.resource, encodeURIComponent(id)];
  }

  /** What a call adds to its request: headers and an abort signal. Every other option stays local. */
  protected toCallOptions(opts: { options?: THttpRepositoryOptions }): IHttpCallOptions {
    return { headers: opts.options?.headers, signal: opts.options?.signal };
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
    options?: THttpRepositoryOptions & { shouldReturn?: boolean };
  }): TCount & { data: R | null } {
    const { result, options } = opts;
    return { count: result.count, data: options?.shouldReturn === false ? null : result.data };
  }

  /** POST `/<resource>`. */
  async create<R = E>(opts: {
    data: P;
    options?: THttpRepositoryOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }> {
    const result = await this.dataSource.write<R>({
      paths: [this.resource],
      method: HTTP.Methods.POST,
      body: opts.data,
      ...this.toCallOptions({ options: opts.options }),
    });

    return { count: result.count, data: result.data };
  }

  async updateById(opts: {
    id: string | number;
    data: Partial<P>;
    options: THttpRepositoryOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;
  async updateById<R = E>(opts: {
    id: string | number;
    data: Partial<P>;
    options?: THttpRepositoryOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;
  /** PATCH `/<resource>/<id>`. */
  async updateById<R = E>(opts: {
    id: string | number;
    data: Partial<P>;
    options?: THttpRepositoryOptions & { shouldReturn?: boolean };
  }): Promise<TCount & { data: AnyType }> {
    const result = await this.dataSource.write<R>({
      paths: this.getIdPaths({ id: opts.id }),
      method: HTTP.Methods.PATCH,
      body: opts.data,
      ...this.toCallOptions({ options: opts.options }),
    });

    return this.toWriteResult({ result, options: opts.options });
  }

  async updateAll(opts: {
    data: Partial<P>;
    where: TWhere<E>;
    options: THttpRepositoryOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;
  async updateAll<R = E>(opts: {
    data: Partial<P>;
    where: TWhere<E>;
    options?: THttpRepositoryOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> | null }>;
  /** PATCH `/<resource>`, the `where` in the body beside the data - a long id list outgrows a URL. */
  async updateAll(opts: {
    data: Partial<P>;
    where: TWhere<E>;
    options?: THttpRepositoryOptions & { shouldReturn?: boolean; force?: boolean };
  }): Promise<TCount & { data: AnyType }> {
    return this.patchWhere({ ...opts, method: 'updateAll' });
  }

  async updateBy(opts: {
    data: Partial<P>;
    where: TWhere<E>;
    options: THttpRepositoryOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;
  async updateBy<R = E>(opts: {
    data: Partial<P>;
    where: TWhere<E>;
    options?: THttpRepositoryOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> | null }>;
  /** Alias for `updateAll`. */
  async updateBy(opts: {
    data: Partial<P>;
    where: TWhere<E>;
    options?: THttpRepositoryOptions & { shouldReturn?: boolean; force?: boolean };
  }): Promise<TCount & { data: AnyType }> {
    return this.patchWhere({ ...opts, method: 'updateBy' });
  }

  protected async patchWhere(opts: {
    method: string;
    data: Partial<P>;
    where: TWhere<E>;
    options?: THttpRepositoryOptions & { shouldReturn?: boolean };
  }): Promise<TCount & { data: AnyType }> {
    const where = this.assertBulkWhere({ method: opts.method, where: opts.where });

    const result = await this.dataSource.write<Array<E>>({
      paths: [this.resource],
      method: HTTP.Methods.PATCH,
      body: { ...opts.data, where },
      ...this.toCallOptions({ options: opts.options }),
    });

    return this.toWriteResult({ result, options: opts.options });
  }

  async deleteById(opts: {
    id: string | number;
    options: THttpRepositoryOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;
  async deleteById<R = E>(opts: {
    id: string | number;
    options?: THttpRepositoryOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;
  /** DELETE `/<resource>/<id>`. */
  async deleteById<R = E>(opts: {
    id: string | number;
    options?: THttpRepositoryOptions & { shouldReturn?: boolean };
  }): Promise<TCount & { data: AnyType }> {
    const result = await this.dataSource.write<R>({
      paths: this.getIdPaths({ id: opts.id }),
      method: HTTP.Methods.DELETE,
      ...this.toCallOptions({ options: opts.options }),
    });

    return this.toWriteResult({ result, options: opts.options });
  }

  async deleteAll(opts: {
    where?: TWhere<E>;
    options: THttpRepositoryOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;
  async deleteAll<R = E>(opts: {
    where?: TWhere<E>;
    options?: THttpRepositoryOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> | null }>;
  /** DELETE `/<resource>`, the `where` in the body. */
  async deleteAll(opts: {
    where?: TWhere<E>;
    options?: THttpRepositoryOptions & { shouldReturn?: boolean; force?: boolean };
  }): Promise<TCount & { data: AnyType }> {
    return this.deleteWhere({ ...opts, method: 'deleteAll' });
  }

  async deleteBy(opts: {
    where?: TWhere<E>;
    options: THttpRepositoryOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;
  async deleteBy<R = E>(opts: {
    where?: TWhere<E>;
    options?: THttpRepositoryOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> | null }>;
  /** Alias for `deleteAll`. */
  async deleteBy(opts: {
    where?: TWhere<E>;
    options?: THttpRepositoryOptions & { shouldReturn?: boolean; force?: boolean };
  }): Promise<TCount & { data: AnyType }> {
    return this.deleteWhere({ ...opts, method: 'deleteBy' });
  }

  protected async deleteWhere(opts: {
    method: string;
    where?: TWhere<E>;
    options?: THttpRepositoryOptions & { shouldReturn?: boolean };
  }): Promise<TCount & { data: AnyType }> {
    const where = this.assertBulkWhere({ method: opts.method, where: opts.where });

    const result = await this.dataSource.write<Array<E>>({
      paths: [this.resource],
      method: HTTP.Methods.DELETE,
      body: { where },
      ...this.toCallOptions({ options: opts.options }),
    });

    return this.toWriteResult({ result, options: opts.options });
  }
}
