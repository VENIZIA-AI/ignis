import type { IdType } from '@/base/models';
import type { AbstractEntity } from '@/base/models/base';
import { RequestErrors } from '@/base/middlewares/common/errors';
import type { TWhere } from '@venizia/ignis-filter';
import type { TAnyObjectSchema } from '@/base/controllers/common/schema-builders';
import { HTTP } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import type { Env, Schema } from 'hono';
import type { TEntityDataObject, TEntityPersistObject, TRouteContext } from '../../common';
import { ReadableCrudController } from './readable';
import { ResponseFormats } from '../../common';

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
          format: ResponseFormats.OBJECT,
          payload: await this.repository.create({ data }),
        }),
    });

    return context.json(rs, HTTP.ResultCodes.RS_2.Created);
  }

  /**
   * 400 when the validated body leaves no field to write - `{}`, or only keys the body schema drops.
   * The repository would otherwise fail with a 500.
   */
  assertNonEmptyUpdate(opts: { scope: string; data: object }): void {
    const { scope, data } = opts;

    if (Object.keys(data).length === 0) {
      throw getError({
        error: RequestErrors.NOTHING_TO_UPDATE,
        message: `[${scope}] Nothing to update | The body has no field this route writes`,
        logLevel: 'warn',
      });
    }
  }

  /** PATCH /:id */
  async updateById(opts: { context: TRouteContext<RouteEnv> }) {
    const { context } = opts;
    const { id } = context.req.valid<{ id: IdType }>('param');
    const data = context.req.valid<Partial<TPersistObject>>('json');
    this.assertNonEmptyUpdate({ scope: 'updateById', data });

    const rs = await this.measure({
      scope: 'updateById',
      args: { id, data },
      task: async () =>
        this.respond<TDataObject>({
          context,
          format: ResponseFormats.OBJECT,
          payload: await this.repository.updateById({ id, data }),
        }),
    });

    return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
  }

  /** PATCH / */
  async updateBy(opts: { context: TRouteContext<RouteEnv> }) {
    const { context } = opts;
    const { where: queryWhere } = context.req.valid<{ where?: TWhere<TDataObject> }>('query');
    const { where: bodyWhere } = context.req.valid<{ where?: TWhere<TDataObject> }>('json');
    // A COPY: `where` selects rows and is never written, and hono hands the same validated object to
    // an override that calls this through `super`.
    const data: Partial<TPersistObject> = { ...context.req.valid<Partial<TPersistObject>>('json') };
    Reflect.deleteProperty(data, 'where');
    this.assertNonEmptyUpdate({ scope: 'updateBy', data });

    const resolved = this.resolveBulkWhere({
      context,
      where: { fromQuery: queryWhere, fromBody: bodyWhere },
    });
    if (resolved.error !== undefined) {
      return resolved.error;
    }

    const { where } = resolved;

    const rs = await this.measure({
      scope: 'updateBy',
      args: { where, data },
      task: async () =>
        this.respond<Array<TDataObject>>({
          context,
          format: ResponseFormats.ARRAY,
          payload: await this.repository.updateBy({ where, data }),
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
          format: ResponseFormats.OBJECT,
          payload: await this.repository.deleteById({ id }),
        }),
    });

    return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
  }

  /** DELETE / */
  async deleteBy(opts: { context: TRouteContext<RouteEnv> }) {
    const { context } = opts;
    const { where: queryWhere } = context.req.valid<{ where?: TWhere<TDataObject> }>('query');
    // Read, never validated: a declared body schema would gate the media type and answer 400 to a
    // client that sends a content-type and no body. A body that is not JSON is simply not a `where`.
    const body = await context.req.json<{ where?: TWhere<TDataObject> }>().catch(() => undefined);

    const resolved = this.resolveBulkWhere({
      context,
      where: { fromQuery: queryWhere, fromBody: body?.where },
    });
    if (resolved.error !== undefined) {
      return resolved.error;
    }

    const { where } = resolved;

    const rs = await this.measure({
      scope: 'deleteBy',
      args: { where },
      task: async () =>
        this.respond<Array<TDataObject>>({
          context,
          format: ResponseFormats.ARRAY,
          payload: await this.repository.deleteBy({ where }),
        }),
    });

    return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
  }
}
