import type { AbstractEntity, IdType } from '@/base/models';
import type { TFilter, TWhere } from '@venizia/ignis-filter';
import type { TAnyObjectSchema } from '@/utilities/schema.utility';
import { HTTP } from '@venizia/ignis-helpers/common';
import type { Env, Schema } from 'hono';
import type { TEntityDataObject, TEntityPersistObject, TRouteContext } from '../../common';
import { AbstractCrudController } from './abstract';
import { ResponseFormats } from '../../common';

/** Read tier: count / find / findById / findOne. Read-only controllers can extend this directly. */
export abstract class ReadableCrudController<
  TEntity extends AbstractEntity<TAnyObjectSchema> = AbstractEntity<TAnyObjectSchema>,
  RouteEnv extends Env = Env,
  RouteSchema extends Schema = {},
  BasePath extends string = '/',
  ConfigurableOptions extends object = {},
  TDataObject extends object = TEntityDataObject<TEntity>,
  TPersistObject extends object = TEntityPersistObject<TEntity>,
> extends AbstractCrudController<
  TEntity,
  RouteEnv,
  RouteSchema,
  BasePath,
  ConfigurableOptions,
  TDataObject,
  TPersistObject
> {
  /** GET /count */
  async count(opts: { context: TRouteContext<RouteEnv> }) {
    const { context } = opts;
    const { where } = context.req.valid<{ where: TWhere<TDataObject> }>('query');

    const rs = await this.measure({
      scope: 'count',
      args: { where },
      task: () => this.repository.count({ where }),
    });

    return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
  }

  /** GET / - paginated list with a Content-Range header. */
  async find(opts: { context: TRouteContext<RouteEnv> }) {
    const { context } = opts;
    const { filter = {} } = context.req.valid<{ filter?: TFilter<TDataObject> }>('query');

    const rs = await this.measure({
      scope: 'find',
      args: filter,
      task: async () => {
        const { data, range } = await this.repository.find({
          filter,
          options: { shouldQueryRange: true },
        });

        return this.respond<Array<TDataObject>>({
          context,
          format: ResponseFormats.ARRAY,
          payload: { count: data.length, data },
          range,
        });
      },
    });

    return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
  }

  /** GET /:id */
  async findById(opts: { context: TRouteContext<RouteEnv> }) {
    const { context } = opts;
    const { id } = context.req.valid<{ id: IdType }>('param');
    const { filter } = context.req.valid<{ filter?: Omit<TFilter<TDataObject>, 'where'> }>('query');

    const rs = await this.measure({
      scope: 'findById',
      args: filter,
      task: async () => {
        const record = await this.repository.findById({ id, filter });
        return this.respond<TDataObject>({
          context,
          format: ResponseFormats.OBJECT,
          payload: { count: record ? 1 : 0, data: record },
        });
      },
    });

    return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
  }

  /** GET /find-one */
  async findOne(opts: { context: TRouteContext<RouteEnv> }) {
    const { context } = opts;
    const { filter = {} } = context.req.valid<{ filter?: TFilter<TDataObject> }>('query');

    const rs = await this.measure({
      scope: 'findOne',
      args: filter,
      task: async () => {
        const record = await this.repository.findOne({ filter });
        return this.respond<TDataObject>({
          context,
          format: ResponseFormats.OBJECT,
          payload: { count: record ? 1 : 0, data: record },
        });
      },
    });

    return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
  }
}
