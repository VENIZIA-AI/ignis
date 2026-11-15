import { HTTP } from '@venizia/ignis-helpers/common';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { Sorts } from '@venizia/ignis-filter';
import { RequestFilterGuard } from '@venizia/ignis-kernel';
import type { TRouteContext } from '@venizia/ignis-kernel';
import type { Env } from 'hono';
import { SearchFieldTypes } from '@/search/core/models';
import type { ISearchQueryDialect, TSearchInput } from '@/search/core/repositories/common';
import { SearchInputSchema, SearchModes } from '@/search/core/repositories/common';

type TNonRawInput = Exclude<TSearchInput, { mode: typeof SearchModes.RAW }>;

/** `ISearchQuerySettings` with its names as plain strings: what the build-time and per-request checks read, whatever the document. */
export interface ISearchLooseSettings {
  queryBy?: string[];
  queryByWeights?: Record<string, number | undefined>;
  order?: string[];
  tuning?: Record<string, unknown>;
}

/** A `query.fixed` or `query.default`, with its names as plain strings. */
export type TSearchLooseSource<RouteEnv extends Env = Env> =
  | ISearchLooseSettings
  | ((opts: {
      context: TRouteContext<RouteEnv>;
      input: TNonRawInput;
    }) => ValueOrPromise<ISearchLooseSettings>);

/** What the model says about its fields, read once when the controller is built. */
export interface ISearchFieldCatalog {
  /** Field name to field type. */
  fields: ReadonlyMap<string, string>;
  hidden: ReadonlySet<string>;
  /** The model's own `defaultQueryBy`: the names a keyed setting aligns to when no `queryBy` is set. */
  defaultQueryBy: readonly string[];
}

/** The `query` option as the controller keeps it. */
export interface ISearchResolvedQuery<RouteEnv extends Env = Env> {
  fixed?: TSearchLooseSource<RouteEnv>;
  default?: TSearchLooseSource<RouteEnv>;
  /** The names of `query.allow.tuning`. */
  allowedTuning: ReadonlySet<string>;
  catalog: ISearchFieldCatalog;
}

const SETTING_KEYS = new Set(['queryBy', 'queryByWeights', 'order', 'tuning']);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Reads, checks and merges the `query` settings of a search controller. */
export class SearchSettingsUtility {
  /** `statusCode` is set for what a request carries and for what a function source returns; a definition error leaves it unset, as every build error does. */
  private static fail(opts: {
    scope: string;
    message: string;
    statusCode?: number;
    cause?: unknown;
  }) {
    const { scope, message, statusCode, cause } = opts;

    return getError({ statusCode, message: `[${scope}] ${message}`, cause });
  }

  /** The values of `record` for `names`, in that order; `undefined` when `names` is empty or one of them has no value. */
  private static toList<Value>(opts: {
    record: Record<string, Value | undefined>;
    names?: readonly string[];
  }): Value[] | undefined {
    const { record, names } = opts;
    const values: Value[] = [];

    if (!names || names.length === 0) {
      return undefined;
    }

    for (const name of names) {
      const value = record[name];

      if (value === undefined) {
        return undefined;
      }

      values.push(value);
    }

    return values;
  }

  /** A keyed list knob (`{ title: 1, sku: 0 }`) becomes the positional list of `names`; any other value passes. */
  private static toKnob(opts: { value: unknown; names?: readonly string[] }): unknown {
    const { value, names } = opts;

    return isPlainObject(value) ? SearchSettingsUtility.toList({ record: value, names }) : value;
  }

  /**
   * Checks one layer (`fixed` or `default`) against the model: only known settings; every field exists, is not hidden, and
   * `queryBy` holds text fields; weights and keyed knobs name exactly the layer's `queryBy`; `order` and `tuning.sortBy` are not both given.
   * A fixed tuning name that is also in `allow.tuning` is refused.
   */
  static assert(opts: {
    settings: unknown;
    scope: string;
    catalog: ISearchFieldCatalog;
    allowedTuning: ReadonlySet<string>;
    isFixed: boolean;
    statusCode?: number;
  }): ISearchLooseSettings {
    const { settings, scope, catalog, allowedTuning, isFixed, statusCode } = opts;
    const fail = (message: string) => SearchSettingsUtility.fail({ scope, message, statusCode });

    if (!isPlainObject(settings)) {
      throw fail(`the settings must be an object | got: ${typeof settings}`);
    }

    for (const key of Object.keys(settings)) {
      if (!SETTING_KEYS.has(key)) {
        throw fail(`unknown setting '${key}' | settings: ${[...SETTING_KEYS].join(', ')}`);
      }
    }

    const checkField = (field: { name: string; where: string; isText?: boolean }) => {
      const type = catalog.fields.get(field.name);

      if (type === undefined) {
        throw fail(`${field.where} names a field the model does not have | field: ${field.name}`);
      }

      if (RequestFilterGuard.isHiddenByName({ key: field.name, hidden: catalog.hidden })) {
        throw fail(`${field.where} names a hidden field | field: ${field.name}`);
      }

      if (field.isText && !SearchFieldTypes.isText(type)) {
        throw fail(
          `${field.where} names a field that is not text; full-text search matches string and string[] fields only | field: ${field.name} | type: ${type}`,
        );
      }
    };

    const { queryBy, queryByWeights, order, tuning } = settings;

    if (queryBy !== undefined) {
      if (!Array.isArray(queryBy) || queryBy.some((name) => typeof name !== 'string')) {
        throw fail('queryBy must be a list of field names');
      }

      for (const name of queryBy) {
        checkField({ name, where: 'queryBy', isText: true });
      }
    }

    // A keyed setting must name the layer's own queryBy, field for field; with no queryBy in the layer, text fields.
    const checkKeyed = (keyed: { record: unknown; where: string }) => {
      const { record, where } = keyed;

      if (!isPlainObject(record)) {
        throw fail(`${where} must be an object keyed by field name`);
      }

      for (const name of Object.keys(record)) {
        if (queryBy === undefined) {
          checkField({ name, where, isText: true });
        } else if (!queryBy.includes(name)) {
          throw fail(`${where} names a field that is not in queryBy | field: ${name}`);
        }
      }

      if (queryBy !== undefined) {
        const missing = queryBy.filter((name: string) => record[name] === undefined);

        if (missing.length > 0) {
          throw fail(`${where} must name every queryBy field | missing: ${missing.join(', ')}`);
        }
      }
    };

    if (queryByWeights !== undefined) {
      checkKeyed({ record: queryByWeights, where: 'queryByWeights' });

      for (const [name, weight] of Object.entries(queryByWeights as Record<string, unknown>)) {
        if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0) {
          throw fail(`queryByWeights needs a finite weight of 0 or more | field: ${name}`);
        }
      }
    }

    if (order !== undefined) {
      if (!Array.isArray(order) || order.some((entry) => typeof entry !== 'string')) {
        throw fail("order must be a list of entries such as 'price' or 'price DESC'");
      }

      for (const entry of order) {
        checkField({ name: Sorts.parseEntry({ entry }).field, where: 'order' });
      }
    }

    if (tuning !== undefined) {
      if (!isPlainObject(tuning)) {
        throw fail('tuning must be an object');
      }

      if (order !== undefined && tuning['sortBy'] !== undefined) {
        throw fail(
          'order and tuning.sortBy are both set | give one of them: the engine takes one sort',
        );
      }

      for (const [name, value] of Object.entries(tuning)) {
        if (isFixed && allowedTuning.has(name)) {
          throw fail(
            `tuning '${name}' is fixed and also in allow.tuning | a name is fixed or open to the client, never both`,
          );
        }

        if (isPlainObject(value)) {
          checkKeyed({ record: value, where: `tuning.${name}` });
        }
      }
    }

    return settings;
  }

  /** A source's settings for this request: a value as it is, a function called with `{ context, input }` and its result checked like a definition. A function that throws, or returns what is not a valid shape, answers 500: the value is the server's. */
  static async resolveSource<RouteEnv extends Env = Env>(opts: {
    source?: TSearchLooseSource<RouteEnv>;
    context: TRouteContext<RouteEnv>;
    input: TNonRawInput;
    query: ISearchResolvedQuery<RouteEnv>;
    isFixed: boolean;
  }): Promise<ISearchLooseSettings> {
    const { source, context, input, query, isFixed } = opts;
    const scope = isFixed ? 'search | query.fixed' : 'search | query.default';
    const statusCode = HTTP.ResultCodes.RS_5.InternalServerError;

    if (source === undefined) {
      return {};
    }

    if (typeof source !== 'function') {
      return source;
    }

    let settings: unknown;

    try {
      const result = await source({ context, input });
      settings = result;
    } catch (error) {
      throw SearchSettingsUtility.fail({
        scope,
        message: 'the settings function threw',
        statusCode,
        cause: error,
      });
    }

    return SearchSettingsUtility.assert({
      settings,
      scope,
      catalog: query.catalog,
      allowedTuning: query.allowedTuning,
      isFixed,
      statusCode,
    });
  }

  /**
   * Layers the settings of one request: `fixed`, else what the client sent (a tuning name only when allowed), else `default`,
   * else the model's `defaultQueryBy`. A client value for a fixed setting is a 400. A keyed setting becomes the positional
   * list of the request's `queryBy`; one that does not name every field is a 400 when it is fixed and dropped when it is a default.
   * `serverTuning` is the part of `engineParams` the server chose.
   */
  static merge(opts: {
    input: TNonRawInput;
    fixed: ISearchLooseSettings;
    defaults: ISearchLooseSettings;
    catalog: ISearchFieldCatalog;
  }): { input: Record<string, unknown>; serverTuning: Record<string, unknown> } {
    const { input, fixed, defaults, catalog } = opts;
    const next: Record<string, unknown> = { ...input };
    const serverTuning: Record<string, unknown> = {};
    const refuse = (what: string) =>
      SearchSettingsUtility.fail({
        scope: 'search',
        message: `${what} is fixed by this search controller and cannot be sent`,
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
      });
    const notNamed = (what: string) =>
      SearchSettingsUtility.fail({
        scope: 'search',
        message: `the fixed ${what} does not name every queryBy field of this request`,
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
      });
    let names: readonly string[] | undefined;

    if (input.mode !== SearchModes.SEMANTIC) {
      if (fixed.queryBy && input.queryBy) {
        throw refuse('queryBy');
      }

      const queryBy = fixed.queryBy ?? input.queryBy ?? defaults.queryBy;
      names = queryBy ?? catalog.defaultQueryBy;

      if (queryBy) {
        next['queryBy'] = queryBy;
      }

      if (fixed.queryByWeights) {
        if (input.queryByWeights) {
          throw refuse('queryByWeights');
        }

        const list = SearchSettingsUtility.toList({ record: fixed.queryByWeights, names });

        if (!list) {
          throw notNamed('queryByWeights');
        }

        next['queryByWeights'] = list;
      } else if (!input.queryByWeights && defaults.queryByWeights) {
        const list = SearchSettingsUtility.toList({ record: defaults.queryByWeights, names });

        if (list) {
          next['queryByWeights'] = list;
        }
      }
    }

    // One sort: `order` and `tuning.sortBy` are the same setting, whichever layer gives it.
    const sortOf = (layer: ISearchLooseSettings) =>
      layer.order ?? (layer.tuning?.['sortBy'] !== undefined ? layer.tuning['sortBy'] : undefined);
    const clientOrder = input.filter?.order;
    const hasClientOrder = clientOrder !== undefined && clientOrder.length > 0;

    if (sortOf(fixed) !== undefined && hasClientOrder) {
      throw refuse('filter.order');
    }

    const sort = sortOf(fixed) ?? (hasClientOrder ? undefined : sortOf(defaults));

    if (Array.isArray(sort)) {
      next['filter'] = { ...input.filter, order: sort };
    }

    const tuning: Record<string, unknown> = {};
    const clientTuning = input.engineParams ?? {};

    if (sort !== undefined && !Array.isArray(sort)) {
      tuning['sortBy'] = sort;
      serverTuning['sortBy'] = sort;
    }

    const tuningNames = new Set([
      ...Object.keys(fixed.tuning ?? {}),
      ...Object.keys(clientTuning),
      ...Object.keys(defaults.tuning ?? {}),
    ]);

    for (const name of tuningNames) {
      if (name === 'sortBy') {
        continue;
      }

      if (fixed.tuning?.[name] !== undefined) {
        if (name in clientTuning) {
          throw refuse(`tuning '${name}'`);
        }

        const value = SearchSettingsUtility.toKnob({ value: fixed.tuning[name], names });

        if (value === undefined) {
          throw notNamed(`tuning '${name}'`);
        }

        tuning[name] = value;
        serverTuning[name] = value;
      } else if (name in clientTuning) {
        tuning[name] = clientTuning[name];
      } else {
        const value = SearchSettingsUtility.toKnob({ value: defaults.tuning?.[name], names });

        if (value !== undefined) {
          tuning[name] = value;
          serverTuning[name] = value;
        }
      }
    }

    if (Object.keys(tuning).length > 0) {
      next['engineParams'] = tuning;
    }

    return { input: next, serverTuning };
  }

  /**
   * The input of a request with the controller's `query` settings applied. What the server chose is checked with the engine's
   * own converter before the repository runs, so a bad value (`numTypos: -1`) is the server's 500 and not the client's 400.
   * The result is parsed with `SearchInputSchema`, which also drops the keys `request.body.extend` added.
   */
  static async apply<RouteEnv extends Env = Env>(opts: {
    query: ISearchResolvedQuery<RouteEnv>;
    context: TRouteContext<RouteEnv>;
    input: TSearchInput;
    dialect: ISearchQueryDialect;
  }): Promise<TSearchInput> {
    const { query, context, input, dialect } = opts;

    if (input.mode === SearchModes.RAW) {
      return input;
    }

    const [fixed, defaults] = await Promise.all([
      SearchSettingsUtility.resolveSource({
        source: query.fixed,
        context,
        input,
        query,
        isFixed: true,
      }),
      SearchSettingsUtility.resolveSource({
        source: query.default,
        context,
        input,
        query,
        isFixed: false,
      }),
    ]);
    const merged = SearchSettingsUtility.merge({
      input,
      fixed,
      defaults,
      catalog: query.catalog,
    });

    if (Object.keys(merged.serverTuning).length > 0) {
      try {
        dialect.toWireParams({ query: { engineParams: merged.serverTuning } });
      } catch (error) {
        throw SearchSettingsUtility.fail({
          scope: 'search | query',
          message: 'the engine refuses the tuning the server chose',
          statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
          cause: error,
        });
      }
    }

    return SearchInputSchema.parse(merged.input);
  }
}
