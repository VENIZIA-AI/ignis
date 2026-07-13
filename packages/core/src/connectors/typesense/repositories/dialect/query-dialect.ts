import { QueryOperators, Sorts } from '@/base/repositories/common/operators';
import type { TFilter, TWhere } from '@/base/repositories/query-schemas';
import type {
  ISearchQuery,
  ISearchQueryDialect,
  TSearchInput,
} from '@/connectors/search/repositories/common';
import { SearchModes } from '@/connectors/search/repositories/common';
import {
  isOperatorObject,
  toFieldsCsv,
  toSearchPage,
} from '@/connectors/search/repositories/common/dialect-helpers';
import type { ITypesenseSearchQuery } from '@/connectors/typesense/repositories/common';
import { getError } from '@venizia/ignis-helpers';

/** The non-raw search inputs the dialect translates; `raw` bypasses the dialect entirely. */
type TTranslatableSearchInput = Exclude<TSearchInput, { mode: typeof SearchModes.RAW }>;

/** Maximum number of `order` entries Typesense `sort_by` can express. */
const MAX_SORT_FIELDS = 3;

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

/** Translates repository-level TFilter/TWhere into Typesense search params. Pure string building
 * - no dependency on the `typesense` package. Untranslatable shapes (relations, pattern/regex, JSON-path) throw. */
export class TypesenseQueryDialect implements ISearchQueryDialect {
  build(opts: { filter?: TFilter; hiddenFields?: string[] }): ITypesenseSearchQuery {
    const { filter, hiddenFields } = opts;

    // No early return on a missing filter: `search({ mode: 'keyword', query: 'john' })` carries no
    // filter at all, and short-circuiting here skipped the exclude-fields block below - so every
    // filterless search returned the model's `hiddenProperties`.
    const { where, fields, order, limit, skip, offset, include } = filter ?? {};

    if (include) {
      throw getError({
        message:
          '[TypesenseQueryDialect][build] search() does not support "include" - relations cannot be translated to a Typesense filter',
      });
    }

    const query: ITypesenseSearchQuery = { query: '*' };

    if (where) {
      const filterBy = this.toWhere({ where });
      if (filterBy) {
        query.filterBy = filterBy;
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

  /** Maps a camelCase `ISearchQuery` onto Typesense's snake_case wire params via `SearchWireKeys.wireKey`;
   * unmapped keys (`page`, `offset`) pass through unchanged, and `engineParams` merges last, verbatim. */
  toWireParams(opts: { query: Partial<ISearchQuery> }): Record<string, unknown> {
    const { query } = opts;
    const { engineParams, ...rest } = query;
    const wire: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(rest)) {
      if (value === undefined) {
        continue;
      }

      wire[SearchWireKeys.wireKey(key)] = value;
    }

    return engineParams ? { ...wire, ...engineParams } : wire;
  }

  /** Writes the mode dispatch, the vector clause and the `prefix` default onto `query`. Everything
   * engine-specific about a non-raw search lives here, so the repository tier stays neutral. */
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
        // Vector search: prefix matching is meaningless, and remote embedders reject it outright
        // ("Prefix search is not supported for remote embedders"). Default off; applyCommonParams
        // still lets an explicit caller override it.
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

  /** Builds Typesense's `<field>:([v1, v2, ...], k: N, alpha: A)` vector-search clause. An
   * omitted `nearVector` emits an empty `[]` - Typesense's auto-embed path (server-side query
   * vectorization) - rather than requiring the caller to already hold a vector. */
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

  /** Copies faceting/highlighting/grouping/tuning params (shared by keyword/semantic/hybrid, absent
   * from `raw`) onto the query - arrays are comma-joined the same way `build` joins queryBy/fields. */
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

    // engineParams carries Typesense's own wire-keyed tuning params (num_typos/prefix/pinned_hits/preset/...),
    // merged verbatim by toWireParams; carried onto the query here so the single-search path reaches that merge.
    if (input.engineParams) {
      query.engineParams = input.engineParams;
    }
  }

  /** Translates a `TWhere` into a Typesense `filter_by` expression. Public — reused by updateByFilter/deleteByFilter. */
  toWhere(opts: { where: TWhere }): string {
    const { where } = opts;
    const clauses: string[] = [];

    for (const key in where) {
      // TWhere<T = any> is a mapped-over-`any` type (see base/repositories/common/types.ts) with no
      // narrower runtime shape to recover here; `unknown` is the honest type for a `for...in` value.
      const value: unknown = where[key];

      if (value === undefined) {
        continue;
      }

      switch (key) {
        case QueryOperators.AND: {
          clauses.push(this.buildLogicalGroup({ value, joiner: ' && ' }));
          break;
        }
        case QueryOperators.OR: {
          clauses.push(this.buildLogicalGroup({ value, joiner: ' || ' }));
          break;
        }
        default: {
          clauses.push(this.buildFieldClause({ field: key, value }));
        }
      }
    }

    // An empty logical group (`and: []`, `or: [{}]`) compiles to '' - joining it would emit a
    // dangling '&&' Typesense rejects as a malformed filter_by.
    return clauses.filter(clause => clause.length > 0).join(' && ');
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

  private buildLogicalGroup(opts: { value: unknown; joiner: string }): string {
    const { value, joiner } = opts;
    const items = Array.isArray(value) ? value : [value];
    // Empty members (e.g. an `{}` where merged in by default-filter plumbing) are dropped - joining them would emit malformed filter_by fragments Typesense rejects.
    const sub = items
      .map(item => this.toWhere({ where: item as TWhere }))
      .filter(clause => clause.length > 0);

    if (sub.length === 0) {
      return '';
    }

    return `(${sub.join(joiner)})`;
  }

  private buildFieldClause(opts: { field: string; value: unknown }): string {
    const { field, value } = opts;

    if (field.includes('.')) {
      throw getError({
        message: `[TypesenseQueryDialect][toWhere] search() does not support JSON-path fields | field: '${field}'`,
      });
    }

    if (Array.isArray(value)) {
      return `${field}:=[${this.escapeArray({ field, value })}]`;
    }

    if (!isOperatorObject(value)) {
      return `${field}:=${this.escapeValue({ field, value })}`;
    }

    const entries = Object.entries(value);
    const clauses = entries.map(([op, opValue]) =>
      this.buildOperatorClause({ field, op, value: opValue }),
    );

    return clauses.length === 1 ? clauses[0] : `(${clauses.join(' && ')})`;
  }

  private buildOperatorClause(opts: { field: string; op: string; value: unknown }): string {
    const { field, op, value } = opts;

    switch (op) {
      case QueryOperators.EQ: {
        return `${field}:=${this.escapeValue({ field, value })}`;
      }
      case QueryOperators.NEQ:
      case QueryOperators.NE: {
        return `${field}:!=${this.escapeValue({ field, value })}`;
      }
      case QueryOperators.IS: {
        // Mirrors PostgresQueryOperators.FNS[IS] (maps null to isNull(column)); Typesense has no null representation.
        if (value === null) {
          throw getError({
            message: `[TypesenseQueryDialect][toWhere] search() cannot translate 'is: null' - Typesense has no null representation | field: '${field}'`,
          });
        }
        return `${field}:=${this.escapeValue({ field, value })}`;
      }
      case QueryOperators.IS_NOT: {
        // Mirrors PostgresQueryOperators.FNS[IS_NOT] (isNotNull) - same null-handling gap as IS.
        if (value === null) {
          throw getError({
            message: `[TypesenseQueryDialect][toWhere] search() cannot translate 'isn: null' - Typesense has no null representation | field: '${field}'`,
          });
        }
        return `${field}:!=${this.escapeValue({ field, value })}`;
      }
      case QueryOperators.GT: {
        return `${field}:>${this.escapeValue({ field, value })}`;
      }
      case QueryOperators.GTE: {
        return `${field}:>=${this.escapeValue({ field, value })}`;
      }
      case QueryOperators.LT: {
        return `${field}:<${this.escapeValue({ field, value })}`;
      }
      case QueryOperators.LTE: {
        return `${field}:<=${this.escapeValue({ field, value })}`;
      }
      case QueryOperators.IN:
      case QueryOperators.INQ: {
        return `${field}:=[${this.escapeArray({ field, value })}]`;
      }
      case QueryOperators.NIN: {
        return `${field}:!=[${this.escapeArray({ field, value })}]`;
      }
      case QueryOperators.BETWEEN: {
        return `${field}:[${this.escapeBetween({ field, value })}]`;
      }
      default: {
        throw getError({
          message: `[TypesenseQueryDialect][toWhere] search() does not support operator '${op}' | field: '${field}'`,
        });
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

  private escapeBetween(opts: { field?: string; value: unknown }): string {
    const { field, value } = opts;

    if (!Array.isArray(value) || value.length !== 2) {
      throw getError({
        message: `[TypesenseQueryDialect][toWhere] search() 'between' requires a [min, max] tuple | field: '${field}' | value: ${JSON.stringify(value)}`,
      });
    }

    const [min, max] = value;
    return `${this.escapeValue({ field, value: min })}..${this.escapeValue({ field, value: max })}`;
  }
}
