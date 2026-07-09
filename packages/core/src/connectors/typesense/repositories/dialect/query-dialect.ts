import { QueryOperators, Sorts } from '@/base/repositories/common/operators';
import type { TFields, TFilter, TWhere } from '@/base/repositories/query-schemas';
import type { ISearchQuery, ISearchQueryDialect } from '@/connectors/typesense/repositories/common';
import { getError } from '@venizia/ignis-helpers';

/** Maximum number of `order` entries Typesense `sort_by` can express. */
const MAX_SORT_FIELDS = 3;

/** camelCase `ISearchQuery` field -> Typesense wire (snake_case) field; the snake_case strings are values only, never identifiers. */
class SearchWireKeys {
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
  static readonly NUM_TYPOS = { from: 'numTypos', to: 'num_typos' };
  static readonly USE_CACHE = { from: 'useCache', to: 'use_cache' };
  static readonly CACHE_TTL = { from: 'cacheTtl', to: 'cache_ttl' };
  static readonly EXHAUSTIVE_SEARCH = { from: 'exhaustiveSearch', to: 'exhaustive_search' };
  static readonly PINNED_HITS = { from: 'pinnedHits', to: 'pinned_hits' };
  static readonly HIDDEN_HITS = { from: 'hiddenHits', to: 'hidden_hits' };
  static readonly QUERY_BY_WEIGHTS = { from: 'queryByWeights', to: 'query_by_weights' };
  static readonly PRIORITIZE_EXACT_MATCH = {
    from: 'prioritizeExactMatch',
    to: 'prioritize_exact_match',
  };
  static readonly DROP_TOKENS_THRESHOLD = {
    from: 'dropTokensThreshold',
    to: 'drop_tokens_threshold',
  };

  private static readonly ENTRIES = [
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
    SearchWireKeys.NUM_TYPOS,
    SearchWireKeys.USE_CACHE,
    SearchWireKeys.CACHE_TTL,
    SearchWireKeys.EXHAUSTIVE_SEARCH,
    SearchWireKeys.PINNED_HITS,
    SearchWireKeys.HIDDEN_HITS,
    SearchWireKeys.QUERY_BY_WEIGHTS,
    SearchWireKeys.PRIORITIZE_EXACT_MATCH,
    SearchWireKeys.DROP_TOKENS_THRESHOLD,
  ];

  /** Resolves a camelCase field to its wire key; unmapped keys (`q`, `page`, `offset`) pass through. */
  static wireKey(field: string): string {
    return SearchWireKeys.ENTRIES.find(entry => entry.from === field)?.to ?? field;
  }
}

/** Translates repository-level TFilter/TWhere into Typesense search params. Pure string building
 * - no dependency on the `typesense` package. Untranslatable shapes (relations, pattern/regex, JSON-path) throw. */
export class TypesenseQueryDialect implements ISearchQueryDialect {
  build(opts: { filter?: TFilter; hiddenFields?: string[] }): ISearchQuery {
    const { filter, hiddenFields } = opts;

    if (!filter) {
      return { q: '*' };
    }

    const { where, fields, order, limit, skip, offset, include } = filter;

    if (include) {
      throw getError({
        message:
          '[TypesenseQueryDialect][build] search() does not support "include" - relations cannot be translated to a Typesense filter',
      });
    }

    const query: ISearchQuery = { q: '*' };

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
      query.page = this.toPage({ skip: effectiveSkip, limit });
    }

    if (fields) {
      query.includeFields = this.toFieldsCsv({ fields });
    }

    if (hiddenFields && hiddenFields.length > 0) {
      query.excludeFields = hiddenFields.join(',');
    }

    return query;
  }

  /** Maps a camelCase `ISearchQuery` onto Typesense's snake_case wire params via `SearchWireKeys.wireKey`; unmapped keys (`q`, `page`, `offset`) pass through unchanged. */
  toWireParams(opts: { query: Partial<ISearchQuery> }): Record<string, unknown> {
    const { query } = opts;
    const wire: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) {
        continue;
      }

      wire[SearchWireKeys.wireKey(key)] = value;
    }

    return wire;
  }

  /** Builds Typesense's `<field>:([v1, v2, ...], k: N, alpha: A)` vector-search clause. An
   * omitted `nearVector` emits an empty `[]` - Typesense's auto-embed path (server-side query
   * vectorization) - rather than requiring the caller to already hold a vector. */
  toVectorQuery(opts: {
    field: string;
    nearVector?: number[];
    k?: number;
    alpha?: number;
    distanceThreshold?: number;
    ef?: number;
  }): {
    vectorQuery: string;
  } {
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

    return { vectorQuery: clause };
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

    return clauses.join(' && ');
  }

  private toPage(opts: { skip: number; limit?: number }): number {
    const { skip, limit } = opts;

    if (limit === undefined) {
      throw getError({
        message:
          '[TypesenseQueryDialect][build] skip/offset requires limit for search() pagination - a page cannot be expressed without a page size',
      });
    }

    if (skip % limit !== 0) {
      throw getError({
        message: '[build] skip must be a multiple of limit for search pagination',
      });
    }

    return Math.floor(skip / limit) + 1;
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

  private toFieldsCsv(opts: { fields: TFields }): string {
    const { fields } = opts;

    if (Array.isArray(fields)) {
      return fields.join(',');
    }

    const included: string[] = [];
    for (const key in fields) {
      if (fields[key] === true) {
        included.push(key);
      }
    }

    return included.join(',');
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

    if (!this.isOperatorObject(value)) {
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

  private isOperatorObject(value: unknown): value is Record<string, unknown> {
    if (value === null || Array.isArray(value) || typeof value !== 'object') {
      return false;
    }

    return Object.keys(value).length > 0;
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
