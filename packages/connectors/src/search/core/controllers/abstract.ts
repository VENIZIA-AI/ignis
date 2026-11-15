import type {
  IAuthRouteConfig,
  TEntityDataObject,
  TInjected,
  TInjectMap,
  TRouteContext,
} from '@venizia/ignis-kernel';
import { BaseRestController, DataRangeUtility } from '@venizia/ignis-kernel';
import type { AbstractEntity } from '@venizia/ignis-kernel';
import type { TAnyObjectSchema } from '@venizia/ignis-kernel';
import { getError } from '@venizia/ignis-helpers/core';
import { HTTP } from '@venizia/ignis-helpers/common';
import type { Env, Schema } from 'hono';
import type { TMultiSearchInput, TSearchInput } from '@/search/core/repositories/common';
import { SearchInputSchema, SearchModes } from '@/search/core/repositories/common';
import type { ReadableSearchRepository } from '../repositories/core/readable';
import { SearchEngineParams } from './engine-params';
import { SearchRawAccess } from './raw-access';
import { SearchResponseUtility } from './response';
import type { ISearchLooseResponse, TSearchLooseHit } from './response';
import { SearchSettingsUtility } from './settings';
import type { ISearchResolvedQuery } from './settings';
import { SearchControllerScope } from './scope';
import type { TSearchScopeResolver } from './scope';

/** Where the page starts, for `Content-Range`. Friendly modes carry `filter.skip` or `filter.offset`; raw mode carries the engine's own `offset`, or a 1-based `page` with `per_page`/`perPage`. A raw request that names a page but no page size is measured against this page's hit count, so only its last page can be off. */
const resolveSearchStart = (opts: { input: TSearchInput; hitCount: number }): number => {
  const { input, hitCount } = opts;

  if (input.mode !== SearchModes.RAW) {
    // Same precedence as DataRangeUtility.buildDataRange: the repository filter carries skip or offset.
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
  TExtra extends object = {},
  Inject extends TInjectMap = {},
> extends BaseRestController<RouteEnv, RouteSchema, BasePath, ConfigurableOptions> {
  repository: ReadableSearchRepository<TDataObject>;
  searchScope?: TSearchScopeResolver<RouteEnv, TExtra, Inject>;

  /** The `engineParams` names a caller may send, normalised (see {@link SearchEngineParams}). Empty: any `engineParams` is refused. */
  allowedEngineParams: ReadonlySet<string>;

  /** Whether the controller serves `mode: 'raw'` and multi-search over HTTP (`modes.raw`). Closed by default: see {@link SearchRawAccess}. */
  isRawAllowed: boolean;

  /** `request.body.extend` was given: its keys are the scope's to read, and they do not go on to the repository. */
  isBodyExtended: boolean;

  /** The `query` option, resolved: the server's settings for a query. */
  querySettings?: ISearchResolvedQuery<RouteEnv, TExtra, Inject>;

  /** The `response` option when it is on. */
  responseTransform?: ISearchLooseResponse<RouteEnv, Inject>;

  /** The instances of the classes `inject` declares, by name: what every function source receives as `injected`. */
  injected: TInjected<Inject>;

  constructor(opts: {
    scope: string;
    isStrict?: boolean;
    repository: ReadableSearchRepository<TDataObject>;
    definitions: Record<string, IAuthRouteConfig>;
    /** Per-request search scope; see {@link TSearchScopeResolver}. */
    searchScope?: TSearchScopeResolver<RouteEnv, TExtra, Inject>;
    /** Names from `query.allow.tuning`, as `SearchEngineParams.resolveAllowlist` answers them. */
    allowedEngineParams?: ReadonlySet<string>;
    /** `modes.raw`, as `SearchRawAccess.resolve` answers it. */
    isRawAllowed?: boolean;
    /** `request.body.extend` was given. */
    isBodyExtended?: boolean;
    /** The `query` option, as `SearchControllerOptionsUtility.resolve` answers it. */
    querySettings?: ISearchResolvedQuery<RouteEnv, TExtra, Inject>;
    /** The `response` option when it is on. */
    responseTransform?: ISearchLooseResponse<RouteEnv, Inject>;
    /** The instances of the classes `inject` declares, by name: `Injection.collect` answers them. */
    injected: TInjected<Inject>;
  }) {
    super({ scope: opts.scope, isStrict: opts.isStrict });
    this.repository = opts.repository;
    this.searchScope = opts.searchScope;
    this.allowedEngineParams = opts.allowedEngineParams ?? new Set();
    this.isRawAllowed = opts.isRawAllowed ?? false;
    this.isBodyExtended = opts.isBodyExtended ?? false;
    this.querySettings = opts.querySettings;
    this.responseTransform = opts.responseTransform;
    this.injected = opts.injected;
    this.definitions = opts.definitions;
  }

  /** POST /search - single-collection keyword/semantic/hybrid/raw search. Carries the list headers of every IGNIS list endpoint; the body keeps `{ found, isFoundExact, hits }` because `isFoundExact` has no place in a `{ count, data }` envelope, and it is the only carrier of "found is an estimate". */
  async search(opts: { context: TRouteContext<RouteEnv> }) {
    const { context } = opts;
    const body = context.req.valid<TSearchInput & TExtra>('json');
    // The scope returns the body with its filter, the extra keys of `request.body.extend` still on it.
    let scoped: TSearchInput & TExtra = body;

    // Before the scope and on every controller: a caller's raw engine parameters can replace the controller's own filter.
    SearchRawAccess.assertSearchInput({ input: body, isAllowed: this.isRawAllowed });
    SearchEngineParams.assertSearchInput({ input: body, allowed: this.allowedEngineParams });

    // The request's own filter cannot name a hidden field (where or order); server code is not held to it.
    if (body.mode !== SearchModes.RAW) {
      this.repository.assertRequestFilter({ filter: body.filter });
    }

    if (this.searchScope) {
      const result = await SearchControllerScope.applySearchScope({
        resolve: this.searchScope,
        context,
        input: body,
        injected: this.injected,
      });
      scoped = result;
    }

    let input: TSearchInput = scoped;

    // The server's settings go in after the scope, so a function source reads the extra keys; the result is parsed, which drops them.
    if (this.querySettings) {
      const applied = await SearchSettingsUtility.apply({
        query: this.querySettings,
        context,
        input: scoped,
        injected: this.injected,
        dialect: this.repository.dataSource.getQueryDialect(),
      });
      input = applied;
    } else if (this.isBodyExtended) {
      // The scope was the only reader of the extra keys: the base schema drops them, so the repository and the log never see them.
      input = SearchInputSchema.parse(scoped);
    }

    const rs = await this.measure({
      scope: 'search',
      args: input,
      task: async () => {
        // `isFoundExact` travels to the caller so an engine whose `found` is an estimate never looks exhaustive across the HTTP boundary.
        const { found, isFoundExact, hits } = await this.repository.search(input);

        return { found, isFoundExact, hits: hits ?? [] };
      },
    });

    // The page keeps the engine's range, whatever the transform dropped; `count` is what this response carries, and an empty page prints `records */<found>`.
    let hits: Array<TSearchLooseHit> = rs.hits;

    if (this.responseTransform && input.mode !== SearchModes.RAW) {
      const transformed = await SearchResponseUtility.apply({
        response: this.responseTransform,
        hits: rs.hits,
        found: rs.found,
        context,
        input,
        injected: this.injected,
      });
      hits = transformed;
    }

    const start = resolveSearchStart({ input, hitCount: rs.hits.length });
    this.setListHeaders({
      context,
      range: DataRangeUtility.buildDataRange({
        offset: start,
        dataLength: rs.hits.length,
        total: rs.found,
      }),
      count: hits.length,
    });

    return context.json({ ...rs, hits }, HTTP.ResultCodes.RS_2.Ok);
  }

  /** POST /multi-search - cross-collection search, forwarded verbatim to the engine. */
  async multiSearch(opts: { context: TRouteContext<RouteEnv> }) {
    const { context } = opts;

    // A multi-search entry carries the engine's own `filterBy` string, which a `where` scope cannot
    // be ANDed into: a scoped controller does not serve it.
    if (this.searchScope) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message: '[multiSearch] multi-search is not available on a scoped search controller',
      });
    }

    SearchRawAccess.assertMultiSearch({ isAllowed: this.isRawAllowed });

    const input = context.req.valid<TMultiSearchInput>('json');

    SearchEngineParams.assertMultiSearchInput({ input, allowed: this.allowedEngineParams });

    const rs = await this.measure({
      scope: 'multiSearch',
      args: input,
      task: () => this.repository.multiSearch(input),
    });

    return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
  }
}
