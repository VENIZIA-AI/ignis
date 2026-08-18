import { QueryOperators, type TFilter, type TWhere } from '@venizia/ignis-filter';
import type {
  ISearchCompileCapabilities,
  ISearchQuery,
  ISearchQueryDialect,
  TCompiledWhere,
  TSearchInput,
} from '@/search/core/repositories/common';
import { SearchFilterOutcomes, SearchModes } from '@/search/core/repositories/common';
import {
  assertKnownField,
  isOperatorObject,
  parenthesize,
  reduceCompiled,
  throwUnsupportedOperator,
  toFieldsCsv,
  toFilterClause,
  toSearchPage,
} from '@/search/core/repositories/common/dialect-helpers';
import { SearchErrors } from '@/search/core/common';
import { getError } from '@venizia/ignis-helpers/core';
import type { IMeilisearchSearchQuery } from '../common';

/** The non-raw search inputs the dialect translates; `raw` bypasses the dialect entirely. */
type TTranslatableSearchInput = Exclude<TSearchInput, { mode: typeof SearchModes.RAW }>;

/** Names the engine in every rejection, so a caller reading the error knows it is the ENGINE CHOICE that decided it, not the operator. */
const ENGINE = 'Meilisearch';

/**
 * Which neutral operators this engine can express. EVERY member of `QueryOperators.SCHEME_SET`
 * has a cell; a conformance test pins the key set against the vocabulary so a newly added
 * operator cannot reach this engine unclassified.
 *
 * Note where this DIVERGES from Typesense: Meilisearch has real null and presence predicates
 * (`IS NULL`, `EXISTS`), so `exists`/`notExists`/`is: null` are expressible here and are not on
 * Typesense. Levelling the two engines down to their intersection would delete working behaviour.
 */
const CAN_EXPRESS: Record<string, boolean> = {
  [QueryOperators.EQ]: true,
  [QueryOperators.NE]: true,
  [QueryOperators.NEQ]: true,
  [QueryOperators.GT]: true,
  [QueryOperators.GTE]: true,
  [QueryOperators.LT]: true,
  [QueryOperators.LTE]: true,

  // Pattern matching is a relevance concern in Meilisearch too - it lives in `q`, not `filter`.
  [QueryOperators.LIKE]: false,
  [QueryOperators.NOT_LIKE]: false,
  [QueryOperators.ILIKE]: false,
  [QueryOperators.NOT_ILIKE]: false,
  [QueryOperators.REGEXP]: false,
  [QueryOperators.IREGEXP]: false,

  // Including the `: null` form, which maps to Meilisearch's own IS NULL / IS NOT NULL.
  [QueryOperators.IS]: true,
  [QueryOperators.IS_NOT]: true,

  [QueryOperators.IN]: true,
  [QueryOperators.INQ]: true,
  [QueryOperators.NIN]: true,

  // Native `EXISTS` / `NOT EXISTS`. Expressible here and NOT on Typesense - a deliberate asymmetry.
  [QueryOperators.EXISTS]: true,
  [QueryOperators.NOT_EXISTS]: true,

  [QueryOperators.BETWEEN]: true,
  // Rewritten by De Morgan into `< min OR > max` - see compileOperatorClause.
  [QueryOperators.NOT_BETWEEN]: true,

  // Postgres array-containment semantics; Meilisearch array filtering answers a different question.
  [QueryOperators.CONTAINS]: false,
  [QueryOperators.CONTAINED_BY]: false,
  [QueryOperators.OVERLAPS]: false,

  // Classified unsupported on BOTH engines on purpose: negating an arbitrary subtree needs De
  // Morgan through the whole tree, and shipping only the easy shapes gives a caller an operator
  // that works until it doesn't.
  [QueryOperators.NOT]: false,

  [QueryOperators.AND]: true,
  [QueryOperators.OR]: true,
};

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

/** `ISearchQuery` fields Meilisearch has no equivalent for. Each THROWS - silently dropping or half-mapping a param produces a query that quietly does not mean what was asked. */
const UNSUPPORTED_QUERY_FIELDS: Record<string, string> = {
  excludeFields: 'Meilisearch has no exclude-fields param; declare displayedAttributes instead',
  facetQuery: 'Meilisearch exposes facet search on its own /facet-search route',
  maxFacetValues: 'Meilisearch sets this via the faceting.maxValuesPerFacet index setting',
  snippetThreshold: 'Meilisearch uses cropLength instead',
  // Meilisearch's search param is `distinct` (one attribute name) while `distinctAttribute` is an index-level SETTING, and neither expresses grouped hits.
  groupBy: 'Meilisearch has no result grouping; set the distinct search param on the raw client',
  groupLimit: 'Meilisearch has no result grouping, so no per-group limit',
  groupMissingValues: 'Meilisearch has no result grouping, so no missing-values flag',
  // Rejected here as well as in applySearchInput, so the multiSearch path (which never calls applySearchInput) cannot forward it to the engine as an unknown param.
  queryByWeights: 'Meilisearch has no per-field query weights',
};

/** Translates repository-level TFilter/TWhere into Meilisearch search params - pure string building, no dependency on the `meilisearch` package. Untranslatable shapes throw rather than degrade. */
export class MeilisearchQueryDialect implements ISearchQueryDialect {
  build(opts: {
    filter?: TFilter;
    hiddenFields?: string[];
    capabilities?: ISearchCompileCapabilities;
  }): IMeilisearchSearchQuery {
    const { filter, capabilities } = opts;

    // `hiddenFields` is accepted and deliberately NOT translated: Meilisearch has no per-query field exclusion, only index-level `displayedAttributes`, so `SearchBaseRepository` strips hidden fields from every returned document one layer up.
    const { where, fields, order, limit, skip, offset, include } = filter ?? {};

    if (include) {
      throw getError({
        message:
          '[MeilisearchQueryDialect][build] search() does not support "include" - relations cannot be translated to a Meilisearch filter',
      });
    }

    const query: IMeilisearchSearchQuery = { query: '*' };

    if (where) {
      const compiled = this.compileWhere({ where, capabilities });

      if (compiled.outcome === SearchFilterOutcomes.FILTER) {
        query.filterBy = compiled.filterBy;
      } else if (compiled.outcome === SearchFilterOutcomes.MATCH_NONE) {
        // Marked, never expressed as a filter: the repository answers empty without a round-trip
        // rather than sending the engine something that approximates "nothing".
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

    return query;
  }

  /** Maps the neutral query onto Meilisearch wire params. Pagination always uses the exhaustive `page`/`hitsPerPage` mode (exact `totalHits`), never `offset`/`limit`; `engineParams` merges last, verbatim. */
  toWireParams(opts: { query: Partial<ISearchQuery> }): Record<string, unknown> {
    const { query } = opts;
    const { engineParams, ...rest } = query as Partial<IMeilisearchSearchQuery>;

    // `matchNone` is a repository-tier instruction, not a search param - dropped here so it can
    // never reach Meilisearch as an unknown key. `rest` is already a fresh object.
    delete rest.matchNone;

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

    // Engine-specific tuning arrives keyed by Meilisearch's own wire names in engineParams; copied onto the query here so the single-search path reaches toWireParams' verbatim merge.
    if (input.engineParams) {
      searchQuery.engineParams = input.engineParams;
    }
  }

  /**
   * @deprecated Use `compileWhere`. A filter STRING cannot represent "matches nothing", so this
   * returned `''` for it - indistinguishable from "no constraint", which is precisely how an empty
   * `or` came to widen the query it was written to narrow. It now throws on that input.
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
          message: `[MeilisearchQueryDialect][toWhere] This where compiles to MATCH-NOTHING, which a filter string cannot express | engine: '${ENGINE}' | returning '' here would match EVERYTHING - call compileWhere() and honour its 'matchNone' outcome instead`,
        });
      }
    }
  }

  /** Compiles a `TWhere` into a Meilisearch filter expression or one of the two absorbing outcomes. Top-level keys conjoin. */
  compileWhere(opts: { where: TWhere; capabilities?: ISearchCompileCapabilities }): TCompiledWhere {
    const { where, capabilities } = opts;
    const clauses: TCompiledWhere[] = [];

    for (const key in where) {
      // TWhere<T = any> is a mapped-over-`any` type with no narrower runtime shape to recover here.
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

    return reduceCompiled({ clauses, isDisjunction: false, joiner: ' AND ' });
  }

  /** @see ISearchQueryDialect.canExpress */
  canExpress(opts: { operator: string }): boolean {
    return CAN_EXPRESS[opts.operator] ?? false;
  }

  /** @see ISearchQueryDialect.conjoin */
  conjoin(opts: { clauses: TCompiledWhere[] }): TCompiledWhere {
    const { clauses } = opts;
    const combined = reduceCompiled({ clauses, isDisjunction: false, joiner: ' AND ' });

    // Parenthesised once two clauses actually join, reproducing byte-for-byte what the previous
    // `{ and: [defaultWhere, where] }` merge emitted through the logical-group path.
    return clauses.filter(clause => clause.outcome === SearchFilterOutcomes.FILTER).length > 1
      ? parenthesize(combined)
      : combined;
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
      reduceCompiled({ clauses, isDisjunction, joiner: isDisjunction ? ' OR ' : ' AND ' }),
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
        message: `[MeilisearchQueryDialect][toWhere] search() does not support JSON-path fields | field: '${field}'`,
      });
    }

    assertKnownField({ field, engine: ENGINE, capabilities });

    if (Array.isArray(value)) {
      // Mirrors relational `buildValueCondition`: an empty IN-list can match nothing, so it is
      // absorbing false - NOT the malformed `field IN []` this used to emit.
      return value.length === 0
        ? { outcome: SearchFilterOutcomes.MATCH_NONE }
        : toFilterClause(`${field} IN [${this.escapeArray({ field, value })}]`);
    }

    if (!isOperatorObject(value)) {
      return toFilterClause(`${field} = ${this.escapeValue({ field, value })}`);
    }

    const clauses = Object.entries(value).map(([operator, operand]) =>
      this.compileOperatorClause({ field, operator, value: operand }),
    );

    const combined = reduceCompiled({ clauses, isDisjunction: false, joiner: ' AND ' });

    // Parenthesised only when more than one operator actually contributed a filter, preserving the
    // exact shape callers already assert on for the single-operator case.
    return clauses.filter(clause => clause.outcome === SearchFilterOutcomes.FILTER).length > 1
      ? parenthesize(combined)
      : combined;
  }

  private compileOperatorClause(opts: {
    field: string;
    operator: string;
    value: unknown;
  }): TCompiledWhere {
    const { field, operator, value } = opts;

    switch (operator) {
      case QueryOperators.EQ:
      case QueryOperators.IS: {
        return toFilterClause(
          value === null ? `${field} IS NULL` : `${field} = ${this.escapeValue({ field, value })}`,
        );
      }
      case QueryOperators.NEQ:
      case QueryOperators.NE:
      case QueryOperators.IS_NOT: {
        return toFilterClause(
          value === null
            ? `${field} IS NOT NULL`
            : `${field} != ${this.escapeValue({ field, value })}`,
        );
      }
      case QueryOperators.GT: {
        return toFilterClause(`${field} > ${this.escapeValue({ field, value })}`);
      }
      case QueryOperators.GTE: {
        return toFilterClause(`${field} >= ${this.escapeValue({ field, value })}`);
      }
      case QueryOperators.LT: {
        return toFilterClause(`${field} < ${this.escapeValue({ field, value })}`);
      }
      case QueryOperators.LTE: {
        return toFilterClause(`${field} <= ${this.escapeValue({ field, value })}`);
      }
      case QueryOperators.IN:
      case QueryOperators.INQ: {
        // Relational: `inq: []` -> sql`false`. Nothing is a member of the empty set.
        if (Array.isArray(value) && value.length === 0) {
          return { outcome: SearchFilterOutcomes.MATCH_NONE };
        }
        return toFilterClause(`${field} IN [${this.escapeArray({ field, value })}]`);
      }
      case QueryOperators.NIN: {
        // Relational: `nin: []` -> sql`true`. Excluding nothing excludes nothing.
        if (Array.isArray(value) && value.length === 0) {
          return { outcome: SearchFilterOutcomes.MATCH_ALL };
        }
        return toFilterClause(`${field} NOT IN [${this.escapeArray({ field, value })}]`);
      }
      case QueryOperators.BETWEEN: {
        return toFilterClause(`${field} ${this.escapeBetween({ field, value })}`);
      }
      case QueryOperators.NOT_BETWEEN: {
        // De Morgan: NOT (min <= x <= max) is (x < min) OR (x > max). Exact for any field that
        // HAS a value; see the missing-value note on the Typesense side.
        const [min, max] = this.assertBetweenTuple({ field, value });
        return toFilterClause(
          `(${field} < ${this.escapeValue({ field, value: min })} OR ${field} > ${this.escapeValue({ field, value: max })})`,
        );
      }
      case QueryOperators.EXISTS: {
        return toFilterClause(value === false ? `${field} NOT EXISTS` : `${field} EXISTS`);
      }
      case QueryOperators.NOT_EXISTS: {
        return toFilterClause(`${field} NOT EXISTS`);
      }
      default: {
        return throwUnsupportedOperator({ operator, field, engine: ENGINE });
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

  /** Shared by `between` and `notBetween` so the two cannot disagree on what a valid range is. */
  private assertBetweenTuple(opts: { field?: string; value: unknown }): [unknown, unknown] {
    const { field, value } = opts;

    if (!Array.isArray(value) || value.length !== 2) {
      throw getError({
        message: `[MeilisearchQueryDialect][toWhere] search() 'between' requires a [min, max] tuple | field: '${field}' | value: ${JSON.stringify(value)}`,
      });
    }

    return [value[0], value[1]];
  }

  private escapeBetween(opts: { field?: string; value: unknown }): string {
    const { field, value } = opts;
    const [min, max] = this.assertBetweenTuple({ field, value });

    return `${this.escapeValue({ field, value: min })} TO ${this.escapeValue({ field, value: max })}`;
  }
}
