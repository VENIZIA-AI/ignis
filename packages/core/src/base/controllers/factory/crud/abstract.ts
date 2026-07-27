import type { AbstractEntity } from '@/base/models/base';
import type { AbstractRepository } from '@/base/repositories';
import type { TAnyObjectSchema } from '@/utilities/schema.utility';
import type { AnyType, TNullable } from '@venizia/ignis-helpers';
import { HTTP, toBoolean } from '@venizia/ignis-helpers';
import type { Env, Schema } from 'hono';
import type { TEntityDataObject, TEntityPersistObject, TRouteContext } from '../../common';
import { BaseRestController } from '../../rest/base';

/** Base tier of a generated CRUD controller - repository handle plus shared response helpers; read and write verbs are layered on by ReadableCrudController / PersistableCrudController. */
export abstract class AbstractCrudController<
  TEntity extends AbstractEntity<TAnyObjectSchema> = AbstractEntity<TAnyObjectSchema>,
  RouteEnv extends Env = Env,
  RouteSchema extends Schema = {},
  BasePath extends string = '/',
  ConfigurableOptions extends object = {},
  TDataObject extends object = TEntityDataObject<TEntity>,
  TPersistObject extends object = TEntityPersistObject<TEntity>,
> extends BaseRestController<RouteEnv, RouteSchema, BasePath, ConfigurableOptions> {
  repository: AbstractRepository<TDataObject, TPersistObject>;

  constructor(opts: {
    scope: string;
    path: string;
    isStrict?: boolean;
    repository: AbstractRepository<TDataObject, TPersistObject>;
    definitions: AnyType;
  }) {
    super({ scope: opts.scope, path: opts.path, isStrict: opts.isStrict });
    this.repository = opts.repository;
    this.definitions = opts.definitions;
  }

  /** Returns the full `{ count, data }` envelope or just `data`, per the x-request-count header. */
  normalizeCountData<
    ResponseSchema extends AnyType,
    RequestContext extends TRouteContext<RouteEnv> = TRouteContext<RouteEnv>,
    ResponseData extends {
      count: number;
      data?: TNullable<ResponseSchema>;
    } = { count: number; data?: TNullable<ResponseSchema> },
  >(opts: { context: RequestContext; responseData: ResponseData }) {
    const { context, responseData } = opts;
    const requestCountData = context.req.header(HTTP.Headers.REQUEST_COUNT_DATA) ?? 'true';
    const useCountData = toBoolean(requestCountData);

    context.header(HTTP.Headers.RESPONSE_COUNT_DATA, responseData.count.toString());

    if (useCountData) {
      return responseData;
    }

    return responseData.data;
  }

  /** Sets the response-format header, then normalizes count/data per the request-count header. */
  respond<R>(opts: {
    context: TRouteContext<RouteEnv>;
    format: 'object' | 'array';
    responseData: { count: number; data?: TNullable<R> };
  }) {
    opts.context.header(HTTP.Headers.RESPONSE_FORMAT, opts.format);
    return this.normalizeCountData<R>({
      context: opts.context,
      responseData: opts.responseData,
    });
  }

  /** 400 when a bulk operation is missing its `where` filter; undefined when it is present. */
  bulkWhereError(opts: { context: TRouteContext<RouteEnv>; where?: object }) {
    const { context, where } = opts;
    if (!where || Object.keys(where).length === 0) {
      return context.json(
        { message: 'where filter is required for bulk operations' },
        HTTP.ResultCodes.RS_4.BadRequest,
      );
    }
    return undefined;
  }
}
