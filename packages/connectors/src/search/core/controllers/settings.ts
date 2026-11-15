import { HTTP } from '@venizia/ignis-helpers/common';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { Sorts } from '@venizia/ignis-filter';
import { RequestFilterGuard } from '@venizia/ignis-kernel';
import type { TInjected, TInjectMap, TRouteContext } from '@venizia/ignis-kernel';
import type { Env } from 'hono';
import { SearchFieldTypes } from '@/search/core/models';
import { SearchEngineParams } from './engine-params';
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

/** What a function source is called with, whatever the document: the same context, scoped input and injected instances the typed options declare. */
export interface ISearchSourceOptions<
  RouteEnv extends Env,
  TExtra extends object,
  Inject extends TInjectMap,
> {
  context: TRouteContext<RouteEnv>;
  input: TNonRawInput & TExtra;
  injected: TInjected<Inject>;
}

/** A function `query.fixed` or `query.default`: its result is checked on every request, so it is `unknown` here. */
export type TSearchLooseFunction<
  RouteEnv extends Env = Env,
  TExtra extends object = {},
  Inject extends TInjectMap = {},
> = (opts: ISearchSourceOptions<RouteEnv, TExtra, Inject>) => ValueOrPromise<unknown>;

/** A `query.fixed` or `query.default` as the controller keeps it: checked settings, or a function checked per request. */
export type TSearchLooseSource<
  RouteEnv extends Env = Env,
  TExtra extends object = {},
  Inject extends TInjectMap = {},
> = ISearchLooseSettings | TSearchLooseFunction<RouteEnv, TExtra, Inject>;

/** A `query.normalize`, with the text its mode carries. */
export type TSearchLooseNormalize<
  RouteEnv extends Env = Env,
  TExtra extends object = {},
  Inject extends TInjectMap = {},
> = (
  opts: ISearchSourceOptions<RouteEnv, TExtra, Inject> & { text: string },
) => ValueOrPromise<unknown>;

/** What the model says about its fields, read once when the controller is built. */
export interface ISearchFieldCatalog {
  /** Field name to field type. */
  fields: ReadonlyMap<string, string>;
  hidden: ReadonlySet<string>;
  /** The model's own `defaultQueryBy`: the names a keyed setting aligns to when no `queryBy` is set. */
  defaultQueryBy: readonly string[];
}

/** The `query` option as the controller keeps it. */
export interface ISearchResolvedQuery<
  RouteEnv extends Env = Env,
  TExtra extends object = {},
  Inject extends TInjectMap = {},
> {
  fixed?: TSearchLooseSource<RouteEnv, TExtra, Inject>;
  default?: TSearchLooseSource<RouteEnv, TExtra, Inject>;
  normalize?: TSearchLooseNormalize<RouteEnv, TExtra, Inject>;
  /** The names of `query.allow.tuning`. */
  allowedTuning: ReadonlySet<string>;
  catalog: ISearchFieldCatalog;
}

const SETTING_KEYS = new Set(['queryBy', 'queryByWeights', 'order', 'tuning']);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Reads, checks and merges the `query` settings of a search controller. */
export class SearchSettingsUtility {
  /** The trust boundary of a function source: the typed options erase the document and the engine here, and its result is checked on every request. */
  static isFunctionSource<
    RouteEnv extends Env = Env,
    TExtra extends object = {},
    Inject extends TInjectMap = {},
  >(source: unknown): source is TSearchLooseFunction<RouteEnv, TExtra, Inject> {
    return typeof source === 'function';
  }

  /** The same boundary for `query.normalize`. */
  static isNormalize<
    RouteEnv extends Env = Env,
    TExtra extends object = {},
    Inject extends TInjectMap = {},
  >(value: unknown): value is TSearchLooseNormalize<RouteEnv, TExtra, Inject> {
    return typeof value === 'function';
  }

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

    // The engine's own sort string: `price:desc`, `_text_match:desc,_eval([(status:=ACTIVATED):1]):desc`. Fields it names obey the rules of `order`; an `_eval` body is read for hidden fields.
    const checkSortBy = (value: unknown) => {
      if (typeof value !== 'string') {
        throw fail('tuning.sortBy must be a string');
      }

      for (const entry of SearchSettingsUtility.splitSortBy({ value })) {
        const field = entry.split(':')[0]?.trim() ?? '';

        if (field.startsWith('_eval(')) {
          for (const match of entry.matchAll(/([A-Za-z][\w.]*)\s*:/g)) {
            const name = match[1] ?? '';

            if (RequestFilterGuard.isHiddenByName({ key: name, hidden: catalog.hidden })) {
              throw fail(`tuning.sortBy names a hidden field | field: ${name}`);
            }
          }
        } else if (!field.startsWith('_')) {
          checkField({ name: field, where: 'tuning.sortBy' });
        }
      }
    };

    if (queryByWeights !== undefined) {
      checkKeyed({ record: queryByWeights, where: 'queryByWeights' });

      for (const [name, weight] of isPlainObject(queryByWeights)
        ? Object.entries(queryByWeights)
        : []) {
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
        let orderField: string;

        try {
          orderField = Sorts.parseEntry({ entry }).field;
        } catch (error) {
          throw SearchSettingsUtility.fail({
            scope,
            message: `order holds an entry that is not a field with an optional direction | entry: ${JSON.stringify(entry)}`,
            statusCode,
            cause: error,
          });
        }

        checkField({ name: orderField, where: 'order' });
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
        // `sortBy` is the one name that selects order and is allowed here: it is read below like `order`. The others select rows or fields.
        if (name !== 'sortBy' && SearchEngineParams.isNeverAllowed({ name })) {
          throw fail(
            `tuning '${name}' selects rows, fields or order | set queryBy, order or the scope for that, or pass it in server code on a repository call`,
          );
        }

        if (
          isFixed &&
          [...allowedTuning].some((allowed) =>
            SearchEngineParams.isSameName({ left: allowed, right: name }),
          )
        ) {
          throw fail(
            `tuning '${name}' is fixed and also in allow.tuning | a name is fixed or open to the client, never both`,
          );
        }

        if (name === 'sortBy') {
          checkSortBy(value);
        } else if (isPlainObject(value)) {
          checkKeyed({ record: value, where: `tuning.${name}` });
        }
      }
    }

    return settings;
  }

  /** The top-level entries of an engine sort string: commas inside parentheses and brackets do not split. */
  static splitSortBy(opts: { value: string }): string[] {
    const entries: string[] = [];
    let depth = 0;
    let start = 0;

    for (let index = 0; index < opts.value.length; index++) {
      const character = opts.value[index];

      if (character === '(' || character === '[') {
        depth += 1;
      } else if (character === ')' || character === ']') {
        depth -= 1;
      } else if (character === ',' && depth === 0) {
        entries.push(opts.value.slice(start, index));
        start = index + 1;
      }
    }

    entries.push(opts.value.slice(start));

    return entries.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  }

  /** A source's settings for this request: a value as it is, a function called with `{ context, input }` and its result checked like a definition. A function that throws, or returns what is not a valid shape, answers 500: the value is the server's. */
  static async resolveSource<
    RouteEnv extends Env = Env,
    TExtra extends object = {},
    Inject extends TInjectMap = {},
  >(opts: {
    source?: TSearchLooseSource<RouteEnv, TExtra, Inject>;
    context: TRouteContext<RouteEnv>;
    input: TNonRawInput & TExtra;
    injected: TInjected<Inject>;
    query: ISearchResolvedQuery<RouteEnv, TExtra, Inject>;
    isFixed: boolean;
  }): Promise<ISearchLooseSettings> {
    const { source, context, input, injected, query, isFixed } = opts;
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
      const result = await source({ context, input, injected });
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
  }): {
    input: Record<string, unknown>;
    serverTuning: Record<string, unknown>;
    serverOrder?: string[];
  } {
    const { input, fixed, defaults, catalog } = opts;
    const next: Record<string, unknown> = { ...input };
    const serverTuning: Record<string, unknown> = {};
    const refuse = (what: string) =>
      SearchSettingsUtility.fail({
        scope: 'search',
        message: `${what} is fixed by this search controller and cannot be sent`,
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
      });
    // The fields a keyed setting aligns to: the client's own `queryBy` makes a gap its mistake (400); the server's list or the model's makes it the server's (500).
    const isNamesFromClient =
      fixed.queryBy === undefined && 'queryBy' in input && input.queryBy !== undefined;
    const notNamed = (what: string) =>
      SearchSettingsUtility.fail({
        scope: 'search',
        message: `the fixed ${what} does not name every queryBy field of this request`,
        statusCode: isNamesFromClient
          ? HTTP.ResultCodes.RS_4.BadRequest
          : HTTP.ResultCodes.RS_5.InternalServerError,
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
      } else if (input.mode === SearchModes.HYBRID) {
        // The schema asks a hybrid body for `queryBy`; with none from anywhere, the model's own list or a 400.
        if (names.length === 0) {
          throw SearchSettingsUtility.fail({
            scope: 'search',
            message:
              'hybrid search needs queryBy: send it, or set it in query.fixed or query.default',
            statusCode: HTTP.ResultCodes.RS_4.BadRequest,
          });
        }

        next['queryBy'] = [...names];
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

    const serverOrder = Array.isArray(sort) ? sort : undefined;

    if (serverOrder) {
      next['filter'] = { ...input.filter, order: serverOrder };
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
        if (
          Object.keys(clientTuning).some((sent) =>
            SearchEngineParams.isSameName({ left: sent, right: name }),
          )
        ) {
          throw refuse(`tuning '${name}'`);
        }

        // A semantic search has no `queryBy`, so a keyed knob has nothing to align to: it is left out, as a fixed `queryBy` is.
        if (input.mode === SearchModes.SEMANTIC && isPlainObject(fixed.tuning[name])) {
          continue;
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
        if (input.mode === SearchModes.SEMANTIC && isPlainObject(defaults.tuning?.[name])) {
          continue;
        }

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

    return { input: next, serverTuning, serverOrder };
  }

  /**
   * The input with the query text `query.normalize` returned: `query` of a keyword or hybrid request, `queryText` of a
   * semantic one. A request without text is left as it is. A throw, or a result that is not a string, answers 500: the
   * function is the server's.
   */
  static async normalize<
    RouteEnv extends Env = Env,
    TExtra extends object = {},
    Inject extends TInjectMap = {},
  >(opts: {
    query: ISearchResolvedQuery<RouteEnv, TExtra, Inject>;
    context: TRouteContext<RouteEnv>;
    input: TNonRawInput & TExtra;
    injected: TInjected<Inject>;
  }): Promise<TNonRawInput & TExtra> {
    const { query, context, input, injected } = opts;
    const text = input.mode === SearchModes.SEMANTIC ? input.queryText : input.query;

    if (!query.normalize || text === undefined) {
      return input;
    }

    let normalized: unknown;

    try {
      const result = await query.normalize({ text, context, input, injected });
      normalized = result;
    } catch (error) {
      throw SearchSettingsUtility.fail({
        scope: 'search | query.normalize',
        message: 'the normalize function threw',
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        cause: error,
      });
    }

    if (typeof normalized !== 'string') {
      throw SearchSettingsUtility.fail({
        scope: 'search | query.normalize',
        message: `the normalize function must return a string | got: ${typeof normalized}`,
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
      });
    }

    return input.mode === SearchModes.SEMANTIC
      ? { ...input, queryText: normalized }
      : { ...input, query: normalized };
  }

  /**
   * The input of a request with the controller's `query` settings applied. What the server chose is checked with the engine's
   * own converter before the repository runs, so a bad value (`numTypos: -1`) is the server's 500 and not the client's 400.
   * The result is parsed with `SearchInputSchema`, which also drops the keys `request.body.extend` added.
   */
  static async apply<
    RouteEnv extends Env = Env,
    TExtra extends object = {},
    Inject extends TInjectMap = {},
  >(opts: {
    query: ISearchResolvedQuery<RouteEnv, TExtra, Inject>;
    context: TRouteContext<RouteEnv>;
    input: TSearchInput & TExtra;
    injected: TInjected<Inject>;
    dialect: ISearchQueryDialect;
  }): Promise<TSearchInput> {
    const { query, context, input: received, injected, dialect } = opts;

    if (received.mode === SearchModes.RAW) {
      return received;
    }

    // First: every function source below reads the text `normalize` returns.
    const input = await SearchSettingsUtility.normalize({
      query,
      context,
      input: received,
      injected,
    });

    const [fixed, defaults] = await Promise.all([
      SearchSettingsUtility.resolveSource({
        source: query.fixed,
        context,
        input,
        injected,
        query,
        isFixed: true,
      }),
      SearchSettingsUtility.resolveSource({
        source: query.default,
        context,
        input,
        injected,
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

    if (Object.keys(merged.serverTuning).length > 0 || merged.serverOrder !== undefined) {
      try {
        dialect.toWireParams({ query: { engineParams: merged.serverTuning } });

        if (merged.serverOrder !== undefined) {
          dialect.build({ filter: { order: merged.serverOrder } });
        }
      } catch (error) {
        throw SearchSettingsUtility.fail({
          scope: 'search | query',
          message: 'the engine refuses the sort or tuning the server chose',
          statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
          cause: error,
        });
      }
    }

    return SearchInputSchema.parse(merged.input);
  }
}
