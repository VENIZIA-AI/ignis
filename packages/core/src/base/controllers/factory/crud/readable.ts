import { AbstractEntity, IdType } from '@/base/models';
import { TFilter, TWhere } from '@/base/repositories/query-schemas';
import { TAnyObjectSchema } from '@/utilities/schema.utility';
import { HTTP } from '@venizia/ignis-helpers';
import { Env, Schema } from 'hono';
import { TEntityDataObject, TEntityPersistObject, TRouteContext } from '../../common';
import { AbstractCrudController } from './abstract';

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
        const { start, end, total } = range;

        context.header(
          HTTP.Headers.CONTENT_RANGE,
          data.length > 0 ? `records ${start}-${end}/${total}` : `records */${total}`,
        );

        return this.respond<Array<TDataObject>>({
          context,
          format: 'array',
          responseData: { count: data.length, data },
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
        const _rs = await this.repository.findById({ id, filter });
        return this.respond<TDataObject>({
          context,
          format: 'object',
          responseData: { count: _rs ? 1 : 0, data: _rs },
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
        const _rs = await this.repository.findOne({ filter });
        return this.respond<TDataObject>({
          context,
          format: 'object',
          responseData: { count: _rs ? 1 : 0, data: _rs },
        });
      },
    });

    return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
  }
}
