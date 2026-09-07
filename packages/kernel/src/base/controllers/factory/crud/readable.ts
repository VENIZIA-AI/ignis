import type { AbstractEntity, IdType } from '@/base/models';
import type { TFilter, TWhere } from '@venizia/ignis-filter';
import type { TAnyObjectSchema } from '@/utilities/schema.utility';
import { HTTP } from '@venizia/ignis-helpers/common';
import type { Env, Schema } from 'hono';
import type { TEntityDataObject, TEntityPersistObject, TRouteContext } from '../../common';
import { AbstractCrudController } from './abstract';
import { ResponseFormats } from '../../common';

/** The one combination point of a base where and a request where; without a request side there is no `and` wrapper. */
const withBaseWhere = <TDataObject extends object>(opts: {
  baseWhere: TWhere<TDataObject>;
  where?: TWhere<TDataObject>;
}): TWhere<TDataObject> => {
  const { baseWhere, where } = opts;

  if (!where) {
    return baseWhere;
  }

  // `Pick` resolves the one key: a literal cannot be checked against `TWhere` over an unresolved type parameter.
  const scoped: Pick<TWhere<TDataObject>, 'and'> = { and: [baseWhere, where] };
  return scoped;
};

/** `id` is the primary key every entity family reads by; built at the default `TWhere` for the same unresolved-parameter reason. */
const whereById = <TDataObject extends object>(opts: { id: IdType }): TWhere<TDataObject> => {
  const where: TWhere = { id: opts.id };
  return where;
};

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
  /** Narrows EVERY read of this controller - override it to scope rows to a tenant, an owner or a status. Public because a generated controller's declaration cannot carry a protected member (TS4094). */
  async getBaseWhere(_opts: {
    context: TRouteContext<RouteEnv>;
  }): Promise<TWhere<TDataObject> | undefined> {
    return undefined;
  }

  /** GET /count */
  async count(opts: { context: TRouteContext<RouteEnv> }) {
    const { context } = opts;
    const { where } = context.req.valid<{ where: TWhere<TDataObject> }>('query');
    const baseWhere = await this.getBaseWhere({ context });
    const scopedWhere = baseWhere ? withBaseWhere({ baseWhere, where }) : where;

    const rs = await this.measure({
      scope: 'count',
      args: { where: scopedWhere },
      task: () => this.repository.count({ where: scopedWhere }),
    });

    return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
  }

  /** GET / - paginated list with a Content-Range header. */
  async find(opts: { context: TRouteContext<RouteEnv> }) {
    const { context } = opts;
    const { filter = {} } = context.req.valid<{ filter?: TFilter<TDataObject> }>('query');
    const baseWhere = await this.getBaseWhere({ context });
    const scopedFilter = baseWhere
      ? { ...filter, where: withBaseWhere({ baseWhere, where: filter.where }) }
      : filter;

    const rs = await this.measure({
      scope: 'find',
      args: scopedFilter,
      task: async () => {
        const { data, range } = await this.repository.find({
          filter: scopedFilter,
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
    const baseWhere = await this.getBaseWhere({ context });

    // `repository.findById` takes no where, so a scoped read goes through `findOne` - the same
    // substrate every family's findById delegates to - and answers null on an out-of-scope id.
    const scopedWhere = baseWhere
      ? withBaseWhere({ baseWhere, where: whereById({ id }) })
      : undefined;

    const rs = await this.measure({
      scope: 'findById',
      args: filter,
      task: async () => {
        const record = scopedWhere
          ? await this.repository.findOne({ filter: { ...filter, where: scopedWhere } })
          : await this.repository.findById({ id, filter });

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
    const baseWhere = await this.getBaseWhere({ context });
    const scopedFilter = baseWhere
      ? { ...filter, where: withBaseWhere({ baseWhere, where: filter.where }) }
      : filter;

    const rs = await this.measure({
      scope: 'findOne',
      args: scopedFilter,
      task: async () => {
        const record = await this.repository.findOne({ filter: scopedFilter });
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
