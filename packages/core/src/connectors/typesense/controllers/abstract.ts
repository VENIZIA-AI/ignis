import { BaseRestController, TEntityDataObject, TRouteContext } from '@/base/controllers';
import { AbstractEntity } from '@/base/models';
import { TAnyObjectSchema } from '@/utilities/schema.utility';
import { AnyType, executeWithPerformanceMeasure, HTTP } from '@venizia/ignis-helpers';
import { Env, Schema } from 'hono';
import { TMultiSearchInput, TSearchInput } from '../repositories/common';
import { ReadableSearchRepository } from '../repositories/core/readable';

/** Base tier of a generated search controller: the repository handle plus the search / multi-search
 * verbs. SearchControllerFactory returns a thin subclass that only builds route configs and wires them. */
export abstract class AbstractSearchController<
  TEntity extends AbstractEntity<TAnyObjectSchema> = AbstractEntity<TAnyObjectSchema>,
  RouteEnv extends Env = Env,
  RouteSchema extends Schema = {},
  BasePath extends string = '/',
  ConfigurableOptions extends object = {},
  TDataObject extends object = TEntityDataObject<TEntity>,
> extends BaseRestController<RouteEnv, RouteSchema, BasePath, ConfigurableOptions> {
  repository: ReadableSearchRepository<TDataObject>;

  constructor(opts: {
    scope: string;
    path: string;
    isStrict?: boolean;
    repository: ReadableSearchRepository<TDataObject>;
    definitions: AnyType;
  }) {
    super({ scope: opts.scope, path: opts.path, isStrict: opts.isStrict });
    this.repository = opts.repository;
    this.definitions = opts.definitions;
  }

  /** Runs a handler task under performance measurement (fixed logger/level/description). */
  measure<R>(opts: { scope: string; args: unknown; task: () => Promise<R> }) {
    return executeWithPerformanceMeasure({
      logger: this.logger,
      level: 'debug',
      scope: opts.scope,
      description: `execute ${opts.scope}`,
      args: opts.args,
      task: opts.task,
    });
  }

  /** POST /search - single-collection keyword/semantic/hybrid/raw search. */
  async search(opts: { context: TRouteContext<RouteEnv> }) {
    const { context } = opts;
    const input = context.req.valid<TSearchInput>('json');

    const rs = await this.measure({
      scope: 'search',
      args: input,
      task: async () => {
        const { found, hits } = await this.repository.search(input);
        return { found, hits: hits ?? [] };
      },
    });

    return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
  }

  /** POST /multi-search - cross-collection search, forwarded verbatim to the engine. */
  async multiSearch(opts: { context: TRouteContext<RouteEnv> }) {
    const { context } = opts;
    const input = context.req.valid<TMultiSearchInput>('json');

    const rs = await this.measure({
      scope: 'multiSearch',
      args: input,
      task: () => this.repository.multiSearch(input),
    });

    return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
  }
}
