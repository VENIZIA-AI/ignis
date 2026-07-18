import { QueryOperators } from '@/base/repositories/common/operators';
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
import { getError } from '@venizia/ignis-helpers';
import type { IMeilisearchSearchQuery } from '../common';

/** The non-raw search inputs the dialect translates; `raw` bypasses the dialect entirely. */
type TTranslatableSearchInput = Exclude<TSearchInput, { mode: typeof SearchModes.RAW }>;

/** `mode: 'semantic'` is pure vector search; Meilisearch expresses that as an all-semantic hybrid. */
const SEMANTIC_ONLY_RATIO = 1;

/** Meilisearch's own default blend when the caller gives no `alpha`. */
const DEFAULT_SEMANTIC_RATIO = 0.5;

/** Typesense-only tuning knobs. Setting one against Meilisearch is a caller error, never a silent no-op. */
const UNSUPPORTED_TUNING_KNOBS = [
  'numTypos',
  'infix',
  'useCache',
  'cacheTtl',
  'exhaustiveSearch',
  'pinnedHits',
  'hiddenHits',
  'prioritizeExactMatch',
  'dropTokensThreshold',
  'preset',
  'queryByWeights',
  'prefix',
] as const;

/** camelCase `ISearchQuery` field -> Meilisearch wire field. Values only, never identifiers. */
class SearchWireKeys {
  static readonly QUERY = { from: 'query', to: 'q' };
  static readonly FILTER_BY = { from: 'filterBy', to: 'filter' };
  static readonly PER_PAGE = { from: 'perPage', to: 'hitsPerPage' };
  static readonly HIGHLIGHT_START_TAG = { from: 'highlightStartTag', to: 'highlightPreTag' };
  static readonly HIGHLIGHT_END_TAG = { from: 'highlightEndTag', to: 'highlightPostTag' };

  private static readonly ENTRIES = [
    SearchWireKeys.QUERY,
    SearchWireKeys.FILTER_BY,
    SearchWireKeys.PER_PAGE,
    SearchWireKeys.HIGHLIGHT_START_TAG,
    SearchWireKeys.HIGHLIGHT_END_TAG,
  ];

  /** Resolves a camelCase field to its wire key; unmapped keys (`page`) pass through. */
  static wireKey(field: string): string {
    return SearchWireKeys.ENTRIES.find(entry => entry.from === field)?.to ?? field;
  }
}

/** Comma-joined `ISearchQuery` fields Meilisearch expects as arrays, and the wire name of each. */
const CSV_TO_ARRAY_KEYS: Record<string, string> = {
  sortBy: 'sort',
  includeFields: 'attributesToRetrieve',
  queryBy: 'attributesToSearchOn',
  facetBy: 'facets',
  highlightFields: 'attributesToHighlight',
  highlightFullFields: 'attributesToCrop',
};

/** `ISearchQuery` fields Meilisearch has no equivalent for. Each THROWS - silently dropping or
 * half-mapping a param produces a query that quietly does not mean what was asked. */
const UNSUPPORTED_QUERY_FIELDS: Record<string, string> = {
  excludeFields: 'Meilisearch has no exclude-fields param; declare displayedAttributes instead',
  facetQuery: 'Meilisearch exposes facet search on its own /facet-search route',
  maxFacetValues: 'Meilisearch sets this via the faceting.maxValuesPerFacet index setting',
  snippetThreshold: 'Meilisearch uses cropLength instead',
  // Meilisearch's search param is `distinct` (one attribute name); `distinctAttribute` is an
  // index-level SETTING, not a search param, and neither expresses grouped hits.
  groupBy: 'Meilisearch has no result grouping; set the distinct search param on the raw client',
  groupLimit: 'Meilisearch has no result grouping, so no per-group limit',
  groupMissingValues: 'Meilisearch has no result grouping, so no missing-values flag',
  // Rejected here as well as in applySearchInput, so the multiSearch path (which never calls
  // applySearchInput) cannot forward it to the engine as an unknown param.
  queryByWeights: 'Meilisearch has no per-field query weights',
};

/**
 * Translates repository-level TFilter/TWhere into Meilisearch search params. Pure string building -
 * no dependency on the `meilisearch` package. Untranslatable shapes throw rather than degrade.
 */
export class MeilisearchQueryDialect implements ISearchQueryDialect {
  build(opts: { filter?: TFilter; hiddenFields?: string[] }): IMeilisearchSearchQuery {
    const { filter } = opts;

    // `hiddenFields` is accepted and deliberately NOT translated: Meilisearch has no per-query field
    // exclusion (only index-level `displayedAttributes`). The guarantee is upheld one layer up -
    // `SearchBaseRepository` strips hidden fields from every returned document, so nothing escapes.
    const { where, fields, order, limit, skip, offset, include } = filter ?? {};

    if (include) {
      throw getError({
        message:
          '[MeilisearchQueryDialect][build] search() does not support "include" - relations cannot be translated to a Meilisearch filter',
      });
    }

    const query: IMeilisearchSearchQuery = { query: '*' };

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

    return query;
  }

  /** Maps the neutral query onto Meilisearch wire params. Pagination always uses the exhaustive
   * `page`/`hitsPerPage` mode (exact `totalHits`), never `offset`/`limit`. `engineParams` merges
   * last, verbatim. */
  toWireParams(opts: { query: Partial<ISearchQuery> }): Record<string, unknown> {
    const { query } = opts;
    const { engineParams, ...rest } = query as Partial<IMeilisearchSearchQuery>;
    const wire: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(rest)) {
      if (value === undefined) {
        continue;
      }

      const unsupported = UNSUPPORTED_QUERY_FIELDS[key];
      if (unsupported) {
        throw getError({
          message: `[MeilisearchQueryDialect][toWireParams] '${key}' is not supported | ${unsupported}`,
        });
      }

      const arrayKey = CSV_TO_ARRAY_KEYS[key];
      if (arrayKey) {
        wire[arrayKey] = String(value).split(',');
        continue;
      }

      wire[SearchWireKeys.wireKey(key)] = value;
    }

    return engineParams ? { ...wire, ...engineParams } : wire;
  }

  /** Writes the mode dispatch and the hybrid/vector params onto `query`, and refuses any knob Meilisearch cannot honor. */
  applySearchInput(opts: { query: ISearchQuery; input: TTranslatableSearchInput }): void {
    const { input } = opts;
    const searchQuery = opts.query as IMeilisearchSearchQuery;

    this.assertNoUnsupportedKnobs({ input });

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
        searchQuery.hybrid = {
          semanticRatio: SEMANTIC_ONLY_RATIO,
          embedder: input.vectorField,
        };

        if (input.nearVector) {
          searchQuery.vector = input.nearVector;
          break;
        }

        if (!input.queryText) {
          throw getError({
            message: `[MeilisearchQueryDialect][applySearchInput] semantic mode requires 'nearVector' or 'queryText'`,
          });
        }

        // Auto-embed: the engine vectorizes queryText with the named embedder.
        searchQuery.query = input.queryText;
        break;
      }
      case SearchModes.HYBRID: {
        searchQuery.query = input.query;
        searchQuery.queryBy = input.queryBy.join(',');
        searchQuery.hybrid = {
          semanticRatio: input.alpha ?? DEFAULT_SEMANTIC_RATIO,
          embedder: input.vectorField,
        };

        if (input.nearVector) {
          searchQuery.vector = input.nearVector;
        }
        break;
      }
      default: {
        break;
      }
    }

    if (input.facetBy) {
      searchQuery.facetBy = input.facetBy.join(',');
    }

    if (input.highlightFields) {
      searchQuery.highlightFields = input.highlightFields.join(',');
    }

    if (input.highlightStartTag !== undefined) {
      searchQuery.highlightStartTag = input.highlightStartTag;
    }

    if (input.highlightEndTag !== undefined) {
      searchQuery.highlightEndTag = input.highlightEndTag;
    }

    // Engine-specific tuning arrives keyed by Meilisearch's own wire names in engineParams; carried
    // onto the query here so the single-search path reaches toWireParams' verbatim merge.
    if (input.engineParams) {
      searchQuery.engineParams = input.engineParams;
    }
  }

  /** Translates a `TWhere` into a Meilisearch filter expression. Public - reused by updateBy/deleteBy. */
  toWhere(opts: { where: TWhere }): string {
    const { where } = opts;
    const clauses: string[] = [];

    for (const key in where) {
      // TWhere<T = any> is a mapped-over-`any` type with no narrower runtime shape to recover here.
      const value: unknown = where[key];

      if (value === undefined) {
        continue;
      }

      switch (key) {
        case QueryOperators.AND: {
          clauses.push(this.buildLogicalGroup({ value, joiner: ' AND ' }));
          break;
        }
        case QueryOperators.OR: {
          clauses.push(this.buildLogicalGroup({ value, joiner: ' OR ' }));
          break;
        }
        default: {
          clauses.push(this.buildFieldClause({ field: key, value }));
        }
      }
    }

    return clauses.filter(clause => clause.length > 0).join(' AND ');
  }

  private assertNoUnsupportedKnobs(opts: { input: TTranslatableSearchInput }): void {
    const input = opts.input as Record<string, unknown>;

    for (const knob of UNSUPPORTED_TUNING_KNOBS) {
      if (input[knob] === undefined) {
        continue;
      }

      throw getError({
        message: `[MeilisearchQueryDialect][applySearchInput] '${knob}' is a Typesense-only search parameter and has no Meilisearch equivalent - remove it, or reach the raw client for engine-specific tuning`,
      });
    }
  }

  private toOrderBy(opts: { order: string[] }): string {
    return opts.order
      .map(entry => {
        const [field, direction = 'asc'] = entry.trim().split(/\s+/);
        const normalizedDirection = direction.toLowerCase();

        if (normalizedDirection !== 'asc' && normalizedDirection !== 'desc') {
          throw getError({
            message: `[MeilisearchQueryDialect][build] Invalid sort direction '${direction}' for field '${field}'`,
          });
        }

        return `${field}:${normalizedDirection}`;
      })
      .join(',');
  }

  private buildLogicalGroup(opts: { value: unknown; joiner: string }): string {
    const { value, joiner } = opts;
    const items = Array.isArray(value) ? value : [value];
    // Empty members (an `{}` merged in by default-filter plumbing) would emit malformed fragments.
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
        message: `[MeilisearchQueryDialect][toWhere] search() does not support JSON-path fields | field: '${field}'`,
      });
    }

    if (Array.isArray(value)) {
      return `${field} IN [${this.escapeArray({ field, value })}]`;
    }

    if (!isOperatorObject(value)) {
      return `${field} = ${this.escapeValue({ field, value })}`;
    }

    const clauses = Object.entries(value).map(([operator, operand]) =>
      this.buildOperatorClause({ field, operator, value: operand }),
    );

    return clauses.length === 1 ? clauses[0] : `(${clauses.join(' AND ')})`;
  }

  private buildOperatorClause(opts: { field: string; operator: string; value: unknown }): string {
    const { field, operator, value } = opts;

    switch (operator) {
      case QueryOperators.EQ:
      case QueryOperators.IS: {
        return value === null
          ? `${field} IS NULL`
          : `${field} = ${this.escapeValue({ field, value })}`;
      }
      case QueryOperators.NEQ:
      case QueryOperators.NE:
      case QueryOperators.IS_NOT: {
        return value === null
          ? `${field} IS NOT NULL`
          : `${field} != ${this.escapeValue({ field, value })}`;
      }
      case QueryOperators.GT: {
        return `${field} > ${this.escapeValue({ field, value })}`;
      }
      case QueryOperators.GTE: {
        return `${field} >= ${this.escapeValue({ field, value })}`;
      }
      case QueryOperators.LT: {
        return `${field} < ${this.escapeValue({ field, value })}`;
      }
      case QueryOperators.LTE: {
        return `${field} <= ${this.escapeValue({ field, value })}`;
      }
      case QueryOperators.IN:
      case QueryOperators.INQ: {
        return `${field} IN [${this.escapeArray({ field, value })}]`;
      }
      case QueryOperators.NIN: {
        return `${field} NOT IN [${this.escapeArray({ field, value })}]`;
      }
      case QueryOperators.BETWEEN: {
        return `${field} ${this.escapeBetween({ field, value })}`;
      }
      case QueryOperators.EXISTS: {
        return value === false ? `${field} NOT EXISTS` : `${field} EXISTS`;
      }
      case QueryOperators.NOT_EXISTS: {
        return `${field} NOT EXISTS`;
      }
      default: {
        throw getError({
          message: `[MeilisearchQueryDialect][toWhere] search() does not support operator '${operator}' | field: '${field}'`,
        });
      }
    }
  }

  private escapeValue(opts: { field?: string; value: unknown }): string {
    const { field, value } = opts;

    if (typeof value === 'string') {
      return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
    }

    if (typeof value === 'number') {
      // NaN/Infinity would produce an unparseable filter token instead of a clear rejection.
      if (!Number.isFinite(value)) {
        throw getError({
          message: `[MeilisearchQueryDialect][toWhere] search() does not support non-finite numbers (NaN/Infinity) | field: '${field}' | value: ${value}`,
        });
      }

      return String(value);
    }

    if (typeof value === 'boolean') {
      return String(value);
    }

    throw getError({
      message: `[MeilisearchQueryDialect][toWhere] search() does not support this value type | field: '${field}' | value: ${JSON.stringify(value)}`,
    });
  }

  private escapeArray(opts: { field?: string; value: unknown }): string {
    const { field, value } = opts;

    if (!Array.isArray(value)) {
      throw getError({
        message: `[MeilisearchQueryDialect][toWhere] search() expected an array value | field: '${field}' | value: ${JSON.stringify(value)}`,
      });
    }

    return value.map(item => this.escapeValue({ field, value: item })).join(', ');
  }

  private escapeBetween(opts: { field?: string; value: unknown }): string {
    const { field, value } = opts;

    if (!Array.isArray(value) || value.length !== 2) {
      throw getError({
        message: `[MeilisearchQueryDialect][toWhere] search() 'between' requires a [min, max] tuple | field: '${field}' | value: ${JSON.stringify(value)}`,
      });
    }

    const [min, max] = value;
    return `${this.escapeValue({ field, value: min })} TO ${this.escapeValue({ field, value: max })}`;
  }
}
