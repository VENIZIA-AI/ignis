import type { IdType } from '@/base/models';
import type { AbstractEntity } from '@/base/models/base';
import type { TWhere } from '@/base/repositories/query-schemas';
import type { TAnyObjectSchema } from '@/utilities/schema.utility';
import { HTTP } from '@venizia/ignis-helpers';
import type { Env, Schema } from 'hono';
import type { TEntityDataObject, TEntityPersistObject, TRouteContext } from '../../common';
import { ReadableCrudController } from './readable';

/** Write tier: create / updateById / updateBy / deleteById / deleteBy. Inherits the read verbs. */
export abstract class PersistableCrudController<
  TEntity extends AbstractEntity<TAnyObjectSchema> = AbstractEntity<TAnyObjectSchema>,
  RouteEnv extends Env = Env,
  RouteSchema extends Schema = {},
  BasePath extends string = '/',
  ConfigurableOptions extends object = {},
  TDataObject extends object = TEntityDataObject<TEntity>,
  TPersistObject extends object = TEntityPersistObject<TEntity>,
> extends ReadableCrudController<
  TEntity,
  RouteEnv,
  RouteSchema,
  BasePath,
  ConfigurableOptions,
  TDataObject,
  TPersistObject
> {
  /** POST / */
  async create(opts: { context: TRouteContext<RouteEnv> }) {
    const { context } = opts;
    const data = context.req.valid<TPersistObject>('json');

    const rs = await this.measure({
      scope: 'create',
      args: data,
      task: async () =>
        this.respond<TDataObject>({
          context,
          format: 'object',
          responseData: await this.repository.create({ data }),
        }),
    });

    return context.json(rs, HTTP.ResultCodes.RS_2.Created);
  }

  /** PATCH /:id */
  async updateById(opts: { context: TRouteContext<RouteEnv> }) {
    const { context } = opts;
    const { id } = context.req.valid<{ id: IdType }>('param');
    const data = context.req.valid<Partial<TPersistObject>>('json');

    const rs = await this.measure({
      scope: 'updateById',
      args: { id, data },
      task: async () =>
        this.respond<TDataObject>({
          context,
          format: 'object',
          responseData: await this.repository.updateById({ id, data }),
        }),
    });

    return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
  }

  /** PATCH / */
  async updateBy(opts: { context: TRouteContext<RouteEnv> }) {
    const { context } = opts;
    const { where } = context.req.valid<{ where: TWhere<TDataObject> }>('query');

    const guard = this.bulkWhereError({ context, where });
    if (guard) {
      return guard;
    }

    const data = context.req.valid<Partial<TPersistObject>>('json');

    const rs = await this.measure({
      scope: 'updateBy',
      args: { where, data },
      task: async () =>
        this.respond<Array<TDataObject>>({
          context,
          format: 'array',
          responseData: await this.repository.updateBy({ where, data }),
        }),
    });

    return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
  }

  /** DELETE /:id */
  async deleteById(opts: { context: TRouteContext<RouteEnv> }) {
    const { context } = opts;
    const { id } = context.req.valid<{ id: IdType }>('param');

    const rs = await this.measure({
      scope: 'deleteById',
      args: { id },
      task: async () =>
        this.respond<TDataObject>({
          context,
          format: 'object',
          responseData: await this.repository.deleteById({ id }),
        }),
    });

    return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
  }

  /** DELETE / */
  async deleteBy(opts: { context: TRouteContext<RouteEnv> }) {
    const { context } = opts;
    const { where } = context.req.valid<{ where: TWhere<TDataObject> }>('query');

    const guard = this.bulkWhereError({ context, where });
    if (guard) {
      return guard;
    }

    const rs = await this.measure({
      scope: 'deleteBy',
      args: { where },
      task: async () =>
        this.respond<Array<TDataObject>>({
          context,
          format: 'array',
          responseData: await this.repository.deleteBy({ where }),
        }),
    });

    return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
  }
}
