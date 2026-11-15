import type { AbstractEntity, TAuthMode, TAuthStrategy, TToggle } from '@venizia/ignis-kernel';
import type { TRouteAuthenticateConfig } from '@venizia/ignis-kernel';
import { ToggleUtility } from '@venizia/ignis-kernel';
import { MetadataRegistry } from '@venizia/ignis-kernel/metadata';
import type { TClass } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { BaseSearchEntity } from '@/search/core/models';
import type { ISearchFieldDefinition } from '@/search/core/models';
import { SearchEngineParams } from './engine-params';
import { SearchRawAccess } from './raw-access';
import type { ISearchLooseResponse } from './response';
import { SearchSettingsUtility } from './settings';
import type { ISearchFieldCatalog, ISearchResolvedQuery, TSearchLooseSource } from './settings';

/** The options of `SearchControllerFactory.build`, with the types that depend on the model and the engine left open: what `resolve` reads and checks at runtime. */
export interface ISearchOptionsInput {
  authenticate?: TRouteAuthenticateConfig;
  routes: { search?: TToggle; multiSearch?: TToggle };
  modes?: { raw?: TToggle };
  query?: { fixed?: unknown; default?: unknown; allow?: { tuning?: unknown } };
  response?: { use: boolean; document?: unknown; transform?: unknown };
  hasScope: boolean;
}

/** What the controller needs from its options, after every default and every cross-check. */
export interface ISearchResolvedOptions {
  authenticate: { strategies?: TAuthStrategy[]; mode?: TAuthMode };
  isRawAllowed: boolean;
  allowedEngineParams: ReadonlySet<string>;
  isSearchOn: boolean;
  isMultiSearchOn: boolean;
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
    const isSearchOn = ToggleUtility.isUsed(routes.search);
    const isMultiSearchOn = ToggleUtility.isUsed(routes.multiSearch);
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
      isRawAllowed,
      allowedEngineParams,
      isSearchOn,
      isMultiSearchOn,
    };

    // `raw` mode and multi-search hand the engine their own parameters and return its documents as they are: neither can carry a server setting or a response transform.
    const bypass = isRawAllowed ? 'modes.raw' : isMultiSearchOn ? 'routes.multiSearch' : undefined;
    const serverOption =
      query?.fixed !== undefined || query?.default !== undefined
        ? 'query.fixed and query.default'
        : response?.use === true
          ? 'response'
          : undefined;

    if (bypass !== undefined && serverOption !== undefined) {
      throw SearchControllerOptionsUtility.fail({
        scope,
        message: `${serverOption} cannot be used with ${bypass} | it hands the engine its own parameters and returns its documents as they are, so the option would not apply`,
      });
    }

    const catalog = SearchControllerOptionsUtility.readCatalog({ scope, entityClass });
    const allowedTuning = new Set(Array.isArray(query?.allow?.tuning) ? query.allow.tuning : []);

    if (query !== undefined) {
      resolved.query = {
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

    if (response?.use === true) {
      if (
        typeof response.transform !== 'function' ||
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
