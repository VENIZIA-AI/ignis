import type { TEntityDataObject, TRouteContext } from '@venizia/ignis-kernel';
import { BaseRestController, buildDataRange } from '@venizia/ignis-kernel';
import type { AbstractEntity } from '@venizia/ignis-kernel';
import type { TAnyObjectSchema } from '@venizia/ignis-kernel';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { HTTP } from '@venizia/ignis-helpers/common';
import type { Env, Schema } from 'hono';
import type { TMultiSearchInput, TSearchInput } from '@/search/core/repositories/common';
import { SearchModes } from '@/search/core/repositories/common';
import type { ReadableSearchRepository } from '../repositories/core/readable';

/** Where the page starts, for `Content-Range`. Friendly modes carry `filter.skip` or `filter.offset`; raw mode carries the engine's own `offset`, or a 1-based `page` with `per_page`/`perPage`. A raw request that names a page but no page size is measured against this page's hit count, so only its last page can be off. */
const resolveSearchStart = (opts: { input: TSearchInput; hitCount: number }): number => {
  const { input, hitCount } = opts;

  if (input.mode !== SearchModes.RAW) {
    // Same precedence as buildDataRange: the repository filter carries skip or offset.
    return input.filter?.skip ?? input.filter?.offset ?? 0;
  }

  // Engine wire names are read through string keys only; `params` is an untyped passthrough.
  const params = input.params;
  const offset = params['offset'];
  if (typeof offset === 'number') {
    return offset;
  }

  const page = params['page'];
  if (typeof page !== 'number' || page < 1) {
    return 0;
  }

  const pageSize = params['per_page'] ?? params['perPage'];
  return (page - 1) * (typeof pageSize === 'number' ? pageSize : hitCount);
};

/** Base tier of a generated search controller: the repository handle plus the search / multi-search verbs; SearchControllerFactory returns a thin subclass that only builds route configs and wires them. */
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

  /** POST /search - single-collection keyword/semantic/hybrid/raw search. Carries the list headers of every IGNIS list endpoint; the body keeps `{ found, isFoundExact, hits }` because `isFoundExact` has no place in a `{ count, data }` envelope, and it is the only carrier of "found is an estimate". */
  async search(opts: { context: TRouteContext<RouteEnv> }) {
    const { context } = opts;
    const input = context.req.valid<TSearchInput>('json');

    const rs = await this.measure({
      scope: 'search',
      args: input,
      task: async () => {
        // `isFoundExact` travels to the caller so an engine whose `found` is an estimate never looks exhaustive across the HTTP boundary.
        const { found, isFoundExact, hits } = await this.repository.search(input);
        return { found, isFoundExact, hits: hits ?? [] };
      },
    });

    const start = resolveSearchStart({ input, hitCount: rs.hits.length });
    this.setListHeaders({
      context,
      range: buildDataRange({ offset: start, dataLength: rs.hits.length, total: rs.found }),
      count: rs.hits.length,
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
