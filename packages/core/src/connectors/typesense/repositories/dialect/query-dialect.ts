import { QueryOperators, Sorts, type TFilter, type TWhere } from '@venizia/ignis-filter';
import type {
  ISearchCompileCapabilities,
  ISearchQuery,
  ISearchQueryDialect,
  TCompiledWhere,
  TSearchInput,
} from '@/connectors/search/repositories/common';
import { SearchFilterOutcomes, SearchModes } from '@/connectors/search/repositories/common';
import {
  assertKnownField,
  isOperatorObject,
  parenthesize,
  reduceCompiled,
  throwUnsupportedOperator,
  toFieldsCsv,
  toFilterClause,
  toSearchPage,
} from '@/connectors/search/repositories/common/dialect-helpers';
import type { ITypesenseSearchQuery } from '@/connectors/typesense/repositories/common';
import { SearchErrors } from '@/connectors/search/common';
import { getError } from '@venizia/ignis-helpers';

/** The non-raw search inputs the dialect translates; `raw` bypasses the dialect entirely. */
type TTranslatableSearchInput = Exclude<TSearchInput, { mode: typeof SearchModes.RAW }>;

/** Maximum number of `order` entries Typesense `sort_by` can express. */
const MAX_SORT_FIELDS = 3;

/** Names the engine in every rejection, so a caller reading the error knows it is the ENGINE CHOICE that decided it, not the operator. */
const ENGINE = 'Typesense';

/**
 * Typesense has no null: an optional field is either present with a value or absent, and
 * `filter_by` cannot test which. That single fact is why `is: null`, `isn: null`, `exists` and
 * `notExists` are all unexpressible - they are one limitation, not four. The only documented
 * workaround is an INDEXING-time placeholder (write a sentinel, add it to `symbols_to_index`),
 * which is a schema decision the caller owns; a dialect cannot synthesise it.
 */
const NO_NULL_REASON =
  'Typesense has no null representation - an optional field is either present or absent, and filter_by cannot test presence; model it with an explicit sentinel value instead';

/**
 * Which neutral operators this engine can express. EVERY member of `QueryOperators.SCHEME_SET`
 * has a cell - `canExpress` asserts that at construction, so an operator added to the vocabulary
 * cannot reach an engine unclassified and start silently falling through to a default branch.
 */
const CAN_EXPRESS: Record<string, boolean> = {
  [QueryOperators.EQ]: true,
  [QueryOperators.NE]: true,
  [QueryOperators.NEQ]: true,
  [QueryOperators.GT]: true,
  [QueryOperators.GTE]: true,
  [QueryOperators.LT]: true,
  [QueryOperators.LTE]: true,

  // Pattern matching is a RELEVANCE concern in Typesense - it lives in `q`/`query_by`, not filter_by.
  [QueryOperators.LIKE]: false,
  [QueryOperators.NOT_LIKE]: false,
  [QueryOperators.ILIKE]: false,
  [QueryOperators.NOT_ILIKE]: false,
  [QueryOperators.REGEXP]: false,
  [QueryOperators.IREGEXP]: false,

  // Expressible against a VALUE; the `: null` form is refused at the value level (see NO_NULL_REASON).
  [QueryOperators.IS]: true,
  [QueryOperators.IS_NOT]: true,

  [QueryOperators.IN]: true,
  [QueryOperators.INQ]: true,
  [QueryOperators.NIN]: true,

  // See NO_NULL_REASON - the same limitation as `is: null`, deliberately not solved twice.
  [QueryOperators.EXISTS]: false,
  [QueryOperators.NOT_EXISTS]: false,

  [QueryOperators.BETWEEN]: true,
  // Rewritten by De Morgan into `< min OR > max` - see compileOperatorClause.
  [QueryOperators.NOT_BETWEEN]: true,

  // Postgres array-containment semantics; Typesense array fields match by value, which is not the same question.
  [QueryOperators.CONTAINS]: false,
  [QueryOperators.CONTAINED_BY]: false,
  [QueryOperators.OVERLAPS]: false,

  // Negating an ARBITRARY subtree needs De Morgan through the whole tree. Partial support would be
  // worse than none: `not: 'x'` would work and `not: { and: [...] }` would not, with no way for a
  // caller to tell which shape they had until it failed.
  [QueryOperators.NOT]: false,

  [QueryOperators.AND]: true,
  [QueryOperators.OR]: true,
};

/** camelCase `ISearchQuery` field -> Typesense wire (snake_case) field; the snake_case strings are values only, never identifiers. */
class SearchWireKeys {
  static readonly QUERY = { from: 'query', to: 'q' };
  static readonly FILTER_BY = { from: 'filterBy', to: 'filter_by' };
  static readonly SORT_BY = { from: 'sortBy', to: 'sort_by' };
  static readonly PER_PAGE = { from: 'perPage', to: 'per_page' };
  static readonly INCLUDE_FIELDS = { from: 'includeFields', to: 'include_fields' };
  static readonly EXCLUDE_FIELDS = { from: 'excludeFields', to: 'exclude_fields' };
  static readonly QUERY_BY = { from: 'queryBy', to: 'query_by' };
  static readonly VECTOR_QUERY = { from: 'vectorQuery', to: 'vector_query' };
  static readonly FACET_BY = { from: 'facetBy', to: 'facet_by' };
  static readonly FACET_QUERY = { from: 'facetQuery', to: 'facet_query' };
  static readonly MAX_FACET_VALUES = { from: 'maxFacetValues', to: 'max_facet_values' };
  static readonly HIGHLIGHT_FIELDS = { from: 'highlightFields', to: 'highlight_fields' };
  static readonly HIGHLIGHT_FULL_FIELDS = {
    from: 'highlightFullFields',
    to: 'highlight_full_fields',
  };
  static readonly HIGHLIGHT_START_TAG = { from: 'highlightStartTag', to: 'highlight_start_tag' };
  static readonly HIGHLIGHT_END_TAG = { from: 'highlightEndTag', to: 'highlight_end_tag' };
  static readonly SNIPPET_THRESHOLD = { from: 'snippetThreshold', to: 'snippet_threshold' };
  static readonly GROUP_BY = { from: 'groupBy', to: 'group_by' };
  static readonly GROUP_LIMIT = { from: 'groupLimit', to: 'group_limit' };
  static readonly GROUP_MISSING_VALUES = {
    from: 'groupMissingValues',
    to: 'group_missing_values',
  };
  static readonly QUERY_BY_WEIGHTS = { from: 'queryByWeights', to: 'query_by_weights' };

  private static readonly ENTRIES = [
    SearchWireKeys.QUERY,
    SearchWireKeys.FILTER_BY,
    SearchWireKeys.SORT_BY,
    SearchWireKeys.PER_PAGE,
    SearchWireKeys.INCLUDE_FIELDS,
    SearchWireKeys.EXCLUDE_FIELDS,
    SearchWireKeys.QUERY_BY,
    SearchWireKeys.VECTOR_QUERY,
    SearchWireKeys.FACET_BY,
    SearchWireKeys.FACET_QUERY,
    SearchWireKeys.MAX_FACET_VALUES,
    SearchWireKeys.HIGHLIGHT_FIELDS,
    SearchWireKeys.HIGHLIGHT_FULL_FIELDS,
    SearchWireKeys.HIGHLIGHT_START_TAG,
    SearchWireKeys.HIGHLIGHT_END_TAG,
    SearchWireKeys.SNIPPET_THRESHOLD,
    SearchWireKeys.GROUP_BY,
    SearchWireKeys.GROUP_LIMIT,
    SearchWireKeys.GROUP_MISSING_VALUES,
    SearchWireKeys.QUERY_BY_WEIGHTS,
  ];

  /** camelCase field -> wire key, built once from ENTRIES so `wireKey` is O(1) per lookup, not O(n) per field per query. */
  private static readonly WIRE_BY_FIELD: Record<string, string> = Object.fromEntries(
    SearchWireKeys.ENTRIES.map(entry => [entry.from, entry.to]),
  );

  /** Resolves a camelCase field to its wire key; unmapped keys (`page`, `offset`) pass through. */
  static wireKey(field: string): string {
    return SearchWireKeys.WIRE_BY_FIELD[field] ?? field;
  }
}

/** Translates repository-level TFilter/TWhere into Typesense search params - pure string building, no dependency on the `typesense` package. Untranslatable shapes (relations, pattern/regex, JSON-path) throw. */
export class TypesenseQueryDialect implements ISearchQueryDialect {
  build(opts: {
    filter?: TFilter;
    hiddenFields?: string[];
    capabilities?: ISearchCompileCapabilities;
  }): ITypesenseSearchQuery {
    const { filter, hiddenFields, capabilities } = opts;

    // No early return on a missing filter: `search({ mode: 'keyword', query: 'john' })` carries none, and short-circuiting here skips the exclude-fields block below, leaking the model's `hiddenProperties`.
    const { where, fields, order, limit, skip, offset, include } = filter ?? {};

    if (include) {
      throw getError({
        message:
          '[TypesenseQueryDialect][build] search() does not support "include" - relations cannot be translated to a Typesense filter',
      });
    }

    const query: ITypesenseSearchQuery = { query: '*' };

    if (where) {
      const compiled = this.compileWhere({ where, capabilities });

      if (compiled.outcome === SearchFilterOutcomes.FILTER) {
        query.filterBy = compiled.filterBy;
      } else if (compiled.outcome === SearchFilterOutcomes.MATCH_NONE) {
        // Marked, never expressed as a filter: Typesense has no match-nothing primitive, and the
        // repository answers empty without a round-trip rather than sending something approximate.
        query.matchNone = true;
      }
    }

    if (order) {
      query.sortBy = this.toOrderBy({ order });
    }

    if (limit !== undefined) {
      query.perPage = limit;
    }

    const effectiveSkip = skip ?? offset;
    if (effectiveSkip !== undefined) {
      query.page = toSearchPage({ skip: effectiveSkip, limit });
    }

    if (fields) {
      query.includeFields = toFieldsCsv({ fields });
    }

    if (hiddenFields && hiddenFields.length > 0) {
      query.excludeFields = hiddenFields.join(',');
    }

    return query;
  }

  /** Maps a camelCase `ISearchQuery` onto Typesense's snake_case wire params via `SearchWireKeys.wireKey`; unmapped keys (`page`, `offset`) pass through unchanged and `engineParams` merges last, verbatim. */
  toWireParams(opts: { query: Partial<ISearchQuery> }): Record<string, unknown> {
    const { query } = opts;
    const { engineParams, ...rest } = query;

    // `matchNone` is a repository-tier instruction, not a search param - dropped here so it can
    // never reach Typesense as an unknown key. `rest` is already a fresh object.
    delete rest.matchNone;

    const wire: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(rest)) {
      if (value === undefined) {
        continue;
      }

      wire[SearchWireKeys.wireKey(key)] = value;
    }

    return engineParams ? { ...wire, ...engineParams } : wire;
  }

  /** Writes the mode dispatch, the vector clause and the `prefix` default onto `query`; everything engine-specific about a non-raw search lives here, so the repository tier stays neutral. */
  applySearchInput(opts: { query: ISearchQuery; input: TTranslatableSearchInput }): void {
    const { input } = opts;
    const searchQuery = opts.query as ITypesenseSearchQuery;

    switch (input.mode) {
      case SearchModes.KEYWORD: {
        if (input.query) {
          searchQuery.query = input.query;
        }

        if (input.queryBy) {
          searchQuery.queryBy = input.queryBy.join(',');
        }
        break;
      }
      case SearchModes.SEMANTIC: {
        // Vector search: prefix matching is meaningless and remote embedders reject it outright, so it defaults off - applyCommonParams still lets an explicit caller override it.
        searchQuery.prefix = false;

        if (input.nearVector) {
          searchQuery.vectorQuery = this.buildVectorClause({ ...input, field: input.vectorField });
          break;
        }

        if (!input.queryText) {
          throw getError({
            message: `[TypesenseQueryDialect][applySearchInput] semantic mode requires 'nearVector' or 'queryText'`,
          });
        }

        // Auto-embed: the engine vectorizes queryText against vectorField; vector_query carries k.
        searchQuery.query = input.queryText;
        searchQuery.queryBy = input.vectorField;
        searchQuery.vectorQuery = this.buildVectorClause({ ...input, field: input.vectorField });
        break;
      }
      case SearchModes.HYBRID: {
        // Same as semantic: the embedded query hits the remote embedder, which rejects prefix search.
        searchQuery.prefix = false;
        searchQuery.query = input.query;

        // Auto-embed (no nearVector) needs the embedding field in query_by; a supplied vector keeps text fields only.
        searchQuery.queryBy = input.nearVector
          ? input.queryBy.join(',')
          : [...input.queryBy, input.vectorField].join(',');

        searchQuery.vectorQuery = this.buildVectorClause({ ...input, field: input.vectorField });
        break;
      }
      default: {
        break;
      }
    }

    this.applyCommonParams({ query: searchQuery, input });
  }

  /** Builds Typesense's `<field>:([v1, v2, ...], k: N, alpha: A)` vector-search clause; an omitted `nearVector` emits an empty `[]`, Typesense's server-side auto-embed path, rather than requiring the caller to already hold a vector. */
  private buildVectorClause(opts: {
    field: string;
    nearVector?: number[];
    k?: number;
    alpha?: number;
    distanceThreshold?: number;
    ef?: number;
  }): string {
    const { field, nearVector, k, alpha, distanceThreshold, ef } = opts;

    const vectorCsv = (nearVector ?? [])
      .map(value => this.escapeValue({ field, value }))
      .join(', ');

    let clause = `${field}:([${vectorCsv}]`;

    if (k !== undefined) {
      clause += `, k: ${k}`;
    }

    if (alpha !== undefined) {
      clause += `, alpha: ${alpha}`;
    }

    if (distanceThreshold !== undefined) {
      clause += `, distance_threshold: ${distanceThreshold}`;
    }

    if (ef !== undefined) {
      clause += `, ef: ${ef}`;
    }

    clause += ')';

    return clause;
  }

  /** Copies faceting/highlighting/grouping/tuning params (shared by keyword/semantic/hybrid, absent from `raw`) onto the query; arrays are comma-joined as `build` joins queryBy/fields. */
  private applyCommonParams(opts: {
    query: ITypesenseSearchQuery;
    input: TTranslatableSearchInput;
  }): void {
    const { query, input } = opts;

    if (input.facetBy) {
      query.facetBy = input.facetBy.join(',');
    }

    if (input.facetQuery !== undefined) {
      query.facetQuery = input.facetQuery;
    }

    if (input.maxFacetValues !== undefined) {
      query.maxFacetValues = input.maxFacetValues;
    }

    if (input.highlightFields) {
      query.highlightFields = input.highlightFields.join(',');
    }

    if (input.highlightFullFields) {
      query.highlightFullFields = input.highlightFullFields.join(',');
    }

    if (input.highlightStartTag !== undefined) {
      query.highlightStartTag = input.highlightStartTag;
    }

    if (input.highlightEndTag !== undefined) {
      query.highlightEndTag = input.highlightEndTag;
    }

    if (input.snippetThreshold !== undefined) {
      query.snippetThreshold = input.snippetThreshold;
    }

    if (input.groupBy) {
      query.groupBy = input.groupBy.join(',');
    }

    if (input.groupLimit !== undefined) {
      query.groupLimit = input.groupLimit;
    }

    if (input.groupMissingValues !== undefined) {
      query.groupMissingValues = input.groupMissingValues;
    }

    if (input.queryByWeights) {
      query.queryByWeights = input.queryByWeights.join(',');
    }

    // engineParams carries Typesense's own wire-keyed tuning params, merged verbatim by toWireParams; copied onto the query here so the single-search path reaches that merge.
    if (input.engineParams) {
      query.engineParams = input.engineParams;
    }
  }

  /**
   * @deprecated Use `compileWhere`. A `filter_by` STRING cannot represent "matches nothing", so
   * this returned `''` for it - indistinguishable from "no constraint", which is precisely how an
   * empty `or` came to widen the query it was written to narrow. It now throws on that input.
   */
  toWhere(opts: { where: TWhere }): string {
    const compiled = this.compileWhere({ where: opts.where });

    switch (compiled.outcome) {
      case SearchFilterOutcomes.FILTER: {
        return compiled.filterBy;
      }
      case SearchFilterOutcomes.MATCH_ALL: {
        return '';
      }
      default: {
        throw getError({
          error: SearchErrors.UNSUPPORTED_OPERATOR,
          message: `[TypesenseQueryDialect][toWhere] This where compiles to MATCH-NOTHING, which a filter_by string cannot express | engine: '${ENGINE}' | returning '' here would match EVERYTHING - call compileWhere() and honour its 'matchNone' outcome instead`,
        });
      }
    }
  }

  /** Compiles a `TWhere` into a Typesense `filter_by` expression or one of the two absorbing outcomes. Top-level keys conjoin. */
  compileWhere(opts: { where: TWhere; capabilities?: ISearchCompileCapabilities }): TCompiledWhere {
    const { where, capabilities } = opts;
    const clauses: TCompiledWhere[] = [];

    for (const key in where) {
      // TWhere<T = any> is a mapped-over-`any` type with no narrower runtime shape to recover here; `unknown` is the honest type for a `for...in` value.
      const value: unknown = where[key];

      if (value === undefined) {
        continue;
      }

      switch (key) {
        case QueryOperators.AND: {
          clauses.push(this.compileLogicalGroup({ value, capabilities, isDisjunction: false }));
          break;
        }
        case QueryOperators.OR: {
          clauses.push(this.compileLogicalGroup({ value, capabilities, isDisjunction: true }));
          break;
        }
        default: {
          clauses.push(this.compileFieldClause({ field: key, value, capabilities }));
        }
      }
    }

    return reduceCompiled({ clauses, isDisjunction: false, joiner: ' && ' });
  }

  /** @see ISearchQueryDialect.canExpress */
  canExpress(opts: { operator: string }): boolean {
    return CAN_EXPRESS[opts.operator] ?? false;
  }

  /** @see ISearchQueryDialect.conjoin */
  conjoin(opts: { clauses: TCompiledWhere[] }): TCompiledWhere {
    const { clauses } = opts;
    const combined = reduceCompiled({ clauses, isDisjunction: false, joiner: ' && ' });

    // Parenthesised once two clauses actually join, reproducing byte-for-byte what the previous
    // `{ and: [defaultWhere, where] }` merge emitted through the logical-group path.
    return clauses.filter(clause => clause.outcome === SearchFilterOutcomes.FILTER).length > 1
      ? parenthesize(combined)
      : combined;
  }

  private toOrderBy(opts: { order: string[] }): string {
    const { order } = opts;

    if (order.length > MAX_SORT_FIELDS) {
      throw getError({
        message: `[TypesenseQueryDialect][build] search() sort_by supports at most ${MAX_SORT_FIELDS} fields | got: ${order.length}`,
      });
    }

    return order
      .map(entry => {
        const [field, direction = Sorts.ASC] = entry.trim().split(/\s+/);
        const normalizedDirection = direction.toLowerCase();

        if (!Sorts.isValid(normalizedDirection)) {
          throw getError({
            message: `[TypesenseQueryDialect][build] Invalid sort direction '${direction}' for field '${field}'`,
          });
        }

        return `${field}:${normalizedDirection}`;
      })
      .join(',');
  }

  /** A logical group always parenthesises, so precedence never depends on where the group sat in the tree. */
  private compileLogicalGroup(opts: {
    value: unknown;
    capabilities?: ISearchCompileCapabilities;
    isDisjunction: boolean;
  }): TCompiledWhere {
    const { value, capabilities, isDisjunction } = opts;
    const items = Array.isArray(value) ? value : [value];

    const clauses = items.map(item => this.compileWhere({ where: item as TWhere, capabilities }));

    // An empty member (`{}`) compiles to matchAll and the algebra absorbs it correctly: identity
    // under `and`, absorbing under `or`. Dropping it by string-length, as this once did, is what
    // turned `or: []` into "no constraint".
    return parenthesize(
      reduceCompiled({ clauses, isDisjunction, joiner: isDisjunction ? ' || ' : ' && ' }),
    );
  }

  private compileFieldClause(opts: {
    field: string;
    value: unknown;
    capabilities?: ISearchCompileCapabilities;
  }): TCompiledWhere {
    const { field, value, capabilities } = opts;

    if (field.includes('.')) {
      throw getError({
        message: `[TypesenseQueryDialect][toWhere] search() does not support JSON-path fields | field: '${field}'`,
      });
    }

    assertKnownField({ field, engine: ENGINE, capabilities });

    if (Array.isArray(value)) {
      // Mirrors relational `buildValueCondition`: an empty IN-list can match nothing, so it is
      // absorbing false - NOT the malformed `field:=[]` this used to emit.
      return value.length === 0
        ? { outcome: SearchFilterOutcomes.MATCH_NONE }
        : toFilterClause(`${field}:=[${this.escapeArray({ field, value })}]`);
    }

    if (!isOperatorObject(value)) {
      return toFilterClause(`${field}:=${this.escapeValue({ field, value })}`);
    }

    const clauses = Object.entries(value).map(([op, opValue]) =>
      this.compileOperatorClause({ field, op, value: opValue }),
    );

    const combined = reduceCompiled({ clauses, isDisjunction: false, joiner: ' && ' });

    // Parenthesised only when more than one operator actually contributed a filter, preserving the
    // exact shape callers already assert on for the single-operator case.
    return clauses.filter(clause => clause.outcome === SearchFilterOutcomes.FILTER).length > 1
      ? parenthesize(combined)
      : combined;
  }

  private compileOperatorClause(opts: {
    field: string;
    op: string;
    value: unknown;
  }): TCompiledWhere {
    const { field, op, value } = opts;

    switch (op) {
      case QueryOperators.EQ: {
        return toFilterClause(`${field}:=${this.escapeValue({ field, value })}`);
      }
      case QueryOperators.NEQ:
      case QueryOperators.NE: {
        return toFilterClause(`${field}:!=${this.escapeValue({ field, value })}`);
      }
      case QueryOperators.IS: {
        // Mirrors PostgresQueryOperators.FNS[IS] (maps null to isNull(column)) for a real value; the null form is the NO_NULL_REASON limitation.
        if (value === null) {
          return throwUnsupportedOperator({
            operator: op,
            field,
            engine: ENGINE,
            reason: NO_NULL_REASON,
          });
        }
        return toFilterClause(`${field}:=${this.escapeValue({ field, value })}`);
      }
      case QueryOperators.IS_NOT: {
        if (value === null) {
          return throwUnsupportedOperator({
            operator: op,
            field,
            engine: ENGINE,
            reason: NO_NULL_REASON,
          });
        }
        return toFilterClause(`${field}:!=${this.escapeValue({ field, value })}`);
      }
      case QueryOperators.GT: {
        return toFilterClause(`${field}:>${this.escapeValue({ field, value })}`);
      }
      case QueryOperators.GTE: {
        return toFilterClause(`${field}:>=${this.escapeValue({ field, value })}`);
      }
      case QueryOperators.LT: {
        return toFilterClause(`${field}:<${this.escapeValue({ field, value })}`);
      }
      case QueryOperators.LTE: {
        return toFilterClause(`${field}:<=${this.escapeValue({ field, value })}`);
      }
      case QueryOperators.IN:
      case QueryOperators.INQ: {
        // Relational: `inq: []` -> sql`false`. Nothing is a member of the empty set.
        if (Array.isArray(value) && value.length === 0) {
          return { outcome: SearchFilterOutcomes.MATCH_NONE };
        }
        return toFilterClause(`${field}:=[${this.escapeArray({ field, value })}]`);
      }
      case QueryOperators.NIN: {
        // Relational: `nin: []` -> sql`true`. Excluding nothing excludes nothing.
        if (Array.isArray(value) && value.length === 0) {
          return { outcome: SearchFilterOutcomes.MATCH_ALL };
        }
        return toFilterClause(`${field}:!=[${this.escapeArray({ field, value })}]`);
      }
      case QueryOperators.BETWEEN: {
        return toFilterClause(`${field}:[${this.escapeBetween({ field, value })}]`);
      }
      case QueryOperators.NOT_BETWEEN: {
        // De Morgan: NOT (min <= x <= max) is (x < min) OR (x > max). Typesense has no negated
        // range, but the rewrite is exact for any field that HAS a value.
        const [min, max] = this.assertBetweenTuple({ field, value });
        return toFilterClause(
          `(${field}:<${this.escapeValue({ field, value: min })} || ${field}:>${this.escapeValue({ field, value: max })})`,
        );
      }
      case QueryOperators.EXISTS:
      case QueryOperators.NOT_EXISTS: {
        // The same limitation as `is: null` - stated once, in NO_NULL_REASON.
        return throwUnsupportedOperator({
          operator: op,
          field,
          engine: ENGINE,
          reason: NO_NULL_REASON,
        });
      }
      default: {
        return throwUnsupportedOperator({ operator: op, field, engine: ENGINE });
      }
    }
  }

  private escapeValue(opts: { field?: string; value: unknown }): string {
    const { field, value } = opts;

    if (typeof value === 'string') {
      if (value.includes('`')) {
        throw getError({
          message: `[TypesenseQueryDialect][toWhere] search() cannot safely represent a value containing a backtick | field: '${field}' | value: '${value}'`,
        });
      }

      return `\`${value}\``;
    }

    if (typeof value === 'number') {
      // NaN/Infinity would silently produce an unparseable filter_by token (e.g. 'price:>NaN') instead of a clear rejection.
      if (!Number.isFinite(value)) {
        throw getError({
          message: `[TypesenseQueryDialect][toWhere] search() does not support non-finite numbers (NaN/Infinity) | field: '${field}' | value: ${value}`,
        });
      }

      return String(value);
    }

    if (typeof value === 'boolean') {
      return String(value);
    }

    throw getError({
      message: `[TypesenseQueryDialect][toWhere] search() does not support this value type | field: '${field}' | value: ${JSON.stringify(value)}`,
    });
  }

  private escapeArray(opts: { field?: string; value: unknown }): string {
    const { field, value } = opts;

    if (!Array.isArray(value)) {
      throw getError({
        message: `[TypesenseQueryDialect][toWhere] search() expected an array value | field: '${field}' | value: ${JSON.stringify(value)}`,
      });
    }

    return value.map(item => this.escapeValue({ field, value: item })).join(',');
  }

  /** Shared by `between` and `notBetween` so the two cannot disagree on what a valid range is. */
  private assertBetweenTuple(opts: { field?: string; value: unknown }): [unknown, unknown] {
    const { field, value } = opts;

    if (!Array.isArray(value) || value.length !== 2) {
      throw getError({
        message: `[TypesenseQueryDialect][toWhere] search() 'between' requires a [min, max] tuple | field: '${field}' | value: ${JSON.stringify(value)}`,
      });
    }

    return [value[0], value[1]];
  }

  private escapeBetween(opts: { field?: string; value: unknown }): string {
    const { field, value } = opts;
    const [min, max] = this.assertBetweenTuple({ field, value });

    return `${this.escapeValue({ field, value: min })}..${this.escapeValue({ field, value: max })}`;
  }
}
