import type {
  AbstractEntity,
  IAuthorizationSpec,
  TAuthMode,
  TAnyObjectSchema,
  TAuthStrategy,
  TToggle,
} from '@venizia/ignis-kernel';
import type { TRouteAuthenticateConfig } from '@venizia/ignis-kernel';
import { MetadataRegistry } from '@venizia/ignis-kernel/metadata';
import type { TClass } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { isClass } from '@venizia/ignis-inversion';
import { BaseSearchEntity } from '@/search/core/models';
import type { ISearchFieldDefinition } from '@/search/core/models';
import { SearchEngineParams } from './engine-params';
import { SearchRawAccess } from './raw-access';
import { SearchToggles } from './toggles';
import type { ISearchRouteOptions } from './factory';
import type { ISearchLooseResponse } from './response';
import { SearchSettingsUtility } from './settings';
import type {
  ISearchFieldCatalog,
  ISearchResolvedQuery,
  TSearchLooseNormalize,
  TSearchLooseSource,
} from './settings';

/** The options of `SearchControllerFactory.build`, with the types that depend on the model and the engine left open: what `resolve` reads and checks at runtime. */
export interface ISearchOptionsInput {
  authenticate?: TRouteAuthenticateConfig;
  authorize?: IAuthorizationSpec | IAuthorizationSpec[];
  routes: { search?: TToggle<ISearchRouteOptions>; multiSearch?: TToggle<ISearchRouteOptions> };
  modes?: { raw?: TToggle };
  query?: { fixed?: unknown; default?: unknown; normalize?: unknown; allow?: { tuning?: unknown } };
  /** `inject`: the classes the function sources receive as `injected`. */
  inject?: unknown;
  response?: { use: boolean; document?: unknown; transform?: unknown };
  hasScope: boolean;
}

/** What the controller needs from its options, after every default and every cross-check. */
export interface ISearchResolvedOptions {
  authenticate: { strategies?: TAuthStrategy[]; mode?: TAuthMode };
  /** `authenticate: { skip: true }` drops it, as for any route: with no caller, no authorization applies. */
  authorize?: IAuthorizationSpec | IAuthorizationSpec[];
  isRawAllowed: boolean;
  allowedEngineParams: ReadonlySet<string>;
  isSearchOn: boolean;
  isMultiSearchOn: boolean;
  /** The `request.headers` of each route that is on and names some. */
  requestHeaders: { search?: TAnyObjectSchema; multiSearch?: TAnyObjectSchema };
  query?: ISearchResolvedQuery;
  response?: ISearchLooseResponse;
}

/** Reads every option of `SearchControllerFactory.build` in one place, applies its defaults and makes every cross-check. Throws `[scope] what | why`, so a bad definition never boots. */
export class SearchControllerOptionsUtility {
  private static fail(opts: { scope: string; message: string }) {
    return getError({ message: `[${opts.scope}] ${opts.message}` });
  }

  /** What the model says about its fields: names and types, the hidden ones, and `defaultQueryBy`. */
  static readCatalog(opts: {
    scope: string;
    entityClass: TClass<AbstractEntity>;
  }): ISearchFieldCatalog {
    const { scope, entityClass } = opts;
    const entity = new entityClass();

    if (!(entity instanceof BaseSearchEntity)) {
      throw SearchControllerOptionsUtility.fail({
        scope,
        message: `The model is not a search entity | model: ${entityClass.name} | extend BaseSearchEntity`,
      });
    }

    const { fields, defaultQueryBy } = entity.schema;
    const hidden =
      MetadataRegistry.getInstance().getModelMetadata({ target: entityClass })?.settings?.properties
        ?.hidden ?? [];

    return {
      fields: new Map(fields.map((field: ISearchFieldDefinition) => [field.name, field.type])),
      hidden: new Set(hidden),
      defaultQueryBy: defaultQueryBy ?? [],
    };
  }

  /** The `request.headers` schema of a route that is on, when it names one: it must be a Zod object schema. */
  private static readHeaders(opts: { scope: string; name: string; toggle: unknown }) {
    const { scope, name, toggle } = opts;
    const headers = (toggle as { request?: { headers?: unknown } } | undefined)?.request?.headers;

    if (headers === undefined) {
      return undefined;
    }

    if (typeof (headers as { safeParse?: unknown } | null)?.safeParse !== 'function') {
      throw SearchControllerOptionsUtility.fail({
        scope,
        message: `${name}.request.headers must be a Zod object schema | write { use: true, request: { headers: z.object({ 'x-merchant-id': z.string() }) } }`,
      });
    }

    return headers as TAnyObjectSchema;
  }

  /** `inject` names classes only: a key, an instance or an optional dependency is not declared here. */
  private static assertInject(opts: { scope: string; inject: unknown }) {
    const { scope, inject } = opts;

    if (inject === undefined) {
      return;
    }

    const isMap = typeof inject === 'object' && inject !== null && !Array.isArray(inject);

    for (const [name, dependency] of isMap ? Object.entries(inject) : [['inject', inject]]) {
      if (!isClass(dependency)) {
        throw SearchControllerOptionsUtility.fail({
          scope,
          message: `inject.${name} must be a class | write inject: { products: ProductRepository }`,
        });
      }
    }
  }

  /** `authenticate` is required: a route is open only by an explicit `{ skip: true }`. */
  private static resolveAuthenticate(opts: {
    scope: string;
    authenticate?: TRouteAuthenticateConfig;
  }) {
    const { scope, authenticate } = opts;

    if (authenticate === undefined || authenticate === null) {
      throw SearchControllerOptionsUtility.fail({
        scope,
        message:
          'authenticate is required | write { strategies: [Authentication.STRATEGY_JWT] }, or { skip: true } to open the routes',
      });
    }

    if (authenticate.skip === true) {
      return {};
    }

    if (!authenticate.strategies || authenticate.strategies.length === 0) {
      throw SearchControllerOptionsUtility.fail({
        scope,
        message:
          'authenticate names no strategy | write { strategies: [Authentication.STRATEGY_JWT] }, or { skip: true } to open the routes',
      });
    }

    return { strategies: authenticate.strategies, mode: authenticate.mode };
  }

  /** One `query.fixed` or `query.default`: a function is kept for the request, a value is checked now. */
  private static resolveSource(opts: {
    scope: string;
    source: unknown;
    catalog: ISearchFieldCatalog;
    allowedTuning: ReadonlySet<string>;
    isFixed: boolean;
  }): TSearchLooseSource | undefined {
    const { scope, source, catalog, allowedTuning, isFixed } = opts;

    if (source === undefined) {
      return undefined;
    }

    if (typeof source === 'function') {
      // The function's own types were checked where it was written; its result is checked on every request.
      return source as TSearchLooseSource;
    }

    return SearchSettingsUtility.assert({
      settings: source,
      scope: `${scope} | query.${isFixed ? 'fixed' : 'default'}`,
      catalog,
      allowedTuning,
      isFixed,
    });
  }

  static resolve(opts: {
    scope: string;
    options: ISearchOptionsInput;
    entityClass: TClass<AbstractEntity>;
  }): ISearchResolvedOptions {
    const { scope, options, entityClass } = opts;
    const { routes, query, response, hasScope } = options;

    const authenticate = SearchControllerOptionsUtility.resolveAuthenticate({
      scope,
      authenticate: options.authenticate,
    });
    const isSearchOn = SearchToggles.read({ scope, name: 'routes.search', toggle: routes.search });
    const isMultiSearchOn = SearchToggles.read({
      scope,
      name: 'routes.multiSearch',
      toggle: routes.multiSearch,
    });
    const isRawAllowed = SearchRawAccess.resolve({
      scope,
      raw: options.modes?.raw,
      isScoped: hasScope,
    });
    const allowedEngineParams = SearchEngineParams.resolveAllowlist({
      scope,
      allow: query?.allow?.tuning,
    });

    if (hasScope && isMultiSearchOn) {
      throw SearchControllerOptionsUtility.fail({
        scope,
        message:
          'A scoped search controller cannot serve multi-search | leave routes.multiSearch out',
      });
    }

    const resolved: ISearchResolvedOptions = {
      authenticate,
      authorize: 'strategies' in authenticate ? options.authorize : undefined,
      isRawAllowed,
      allowedEngineParams,
      isSearchOn,
      isMultiSearchOn,
      requestHeaders: {
        search: isSearchOn
          ? SearchControllerOptionsUtility.readHeaders({
              scope,
              name: 'routes.search',
              toggle: routes.search,
            })
          : undefined,
        multiSearch: isMultiSearchOn
          ? SearchControllerOptionsUtility.readHeaders({
              scope,
              name: 'routes.multiSearch',
              toggle: routes.multiSearch,
            })
          : undefined,
      },
    };

    // `raw` mode and multi-search hand the engine their own parameters and return its documents as they are: neither can carry a server setting or a response transform.
    const bypass = isRawAllowed ? 'modes.raw' : isMultiSearchOn ? 'routes.multiSearch' : undefined;
    const serverOption =
      query?.fixed !== undefined || query?.default !== undefined
        ? 'query.fixed and query.default'
        : query?.normalize !== undefined
          ? 'query.normalize'
          : response?.use === true
            ? 'response'
            : undefined;

    if (bypass !== undefined && serverOption !== undefined) {
      throw SearchControllerOptionsUtility.fail({
        scope,
        message: `${serverOption} cannot be used with ${bypass} | it hands the engine its own parameters and returns its documents as they are, so the option would not apply`,
      });
    }

    SearchControllerOptionsUtility.assertInject({ scope, inject: options.inject });

    const catalog = SearchControllerOptionsUtility.readCatalog({ scope, entityClass });
    const allowedTuning = new Set(Array.isArray(query?.allow?.tuning) ? query.allow.tuning : []);

    // Only a server setting or a normalizer needs the per-request step; `allow.tuning` alone is the body schema and the allow list.
    if (query?.normalize !== undefined && typeof query.normalize !== 'function') {
      throw SearchControllerOptionsUtility.fail({
        scope,
        message: 'query.normalize must be a function | write normalize: ({ text }) => text.trim()',
      });
    }

    if (
      query?.fixed !== undefined ||
      query?.default !== undefined ||
      query?.normalize !== undefined
    ) {
      resolved.query = {
        normalize: query.normalize as TSearchLooseNormalize | undefined,
        fixed: SearchControllerOptionsUtility.resolveSource({
          scope,
          source: query.fixed,
          catalog,
          allowedTuning,
          isFixed: true,
        }),
        default: SearchControllerOptionsUtility.resolveSource({
          scope,
          source: query.default,
          catalog,
          allowedTuning,
          isFixed: false,
        }),
        allowedTuning,
        catalog,
      };
    }

    if (SearchToggles.read({ scope, name: 'response', toggle: response })) {
      if (
        typeof response?.transform !== 'function' ||
        typeof (response.document as { safeParse?: unknown } | undefined)?.safeParse !== 'function'
      ) {
        throw SearchControllerOptionsUtility.fail({
          scope,
          message:
            'response needs a document schema and a transform function | write { use: true, document, transform }',
        });
      }

      resolved.response = response as unknown as ISearchLooseResponse;
    }

    return resolved;
  }
}
