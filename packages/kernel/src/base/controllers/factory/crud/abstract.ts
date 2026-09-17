import type { AbstractEntity } from '@/base/models/base';
import type { AbstractRepository } from '@/base/repositories';
import type { TAnyObjectSchema } from '@/base/controllers/common/schema-builders';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { HTTP } from '@venizia/ignis-helpers/common';
import type { Env, Schema } from 'hono';
import type { TEntityDataObject, TEntityPersistObject, TRouteContext } from '../../common';
import { BaseRestController } from '../../rest/base';

type TBulkWhereResolution<WhereType> =
  { where: WhereType; error?: undefined } | { where?: undefined; error: Response };

/** Base tier of a generated CRUD controller - the repository handle; the response helpers (`respond`, `setListHeaders`) live on BaseRestController so hand-written controllers share them. Read and write verbs are layered on by ReadableCrudController / PersistableCrudController. */
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

  /** Bulk `where` from the query or the JSON body (long id lists outgrow a URL). Both, or none, is a 400. */
  resolveBulkWhere<WhereType extends object>(opts: {
    context: TRouteContext<RouteEnv>;
    queryWhere?: WhereType;
    bodyWhere?: WhereType;
  }): TBulkWhereResolution<WhereType> {
    const { context, queryWhere, bodyWhere } = opts;

    if (queryWhere !== undefined && bodyWhere !== undefined) {
      return {
        error: context.json(
          { message: 'where given in both the query and the body - send it in one' },
          HTTP.ResultCodes.RS_4.BadRequest,
        ),
      };
    }

    const where = queryWhere ?? bodyWhere;
    if (!where || Object.keys(where).length === 0) {
      return {
        error: context.json(
          { message: 'where filter is required for bulk operations' },
          HTTP.ResultCodes.RS_4.BadRequest,
        ),
      };
    }

    return { where };
  }
}
