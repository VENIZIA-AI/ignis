import type { TFilter, TWhere } from '@venizia/ignis-kernel';
import type { TConstValue } from '@venizia/ignis-helpers/common';
import type { SearchModes, TSearchInput } from './constants';

/**
 * What a `where` tree compiled down to. A filter STRING cannot express the two absorbing
 * outcomes: `''` is indistinguishable from "no constraint", which is why an empty `or` used to
 * compile to a filter byte-identical to the unscoped query - widening the very clause meant to
 * narrow it. The relational branch has always had this vocabulary (`sql\`false\`` vs `undefined`,
 * relational/repositories/dialect/filter.ts:637-641); this is that vocabulary for the search branch.
 */
export class SearchFilterOutcomes {
  /** A real filter expression the engine should run. */
  static readonly FILTER = 'filter';
  /** Vacuously true - impose no constraint. */
  static readonly MATCH_ALL = 'matchAll';
  /** Absorbing false - can never match, so the engine must not be asked. */
  static readonly MATCH_NONE = 'matchNone';

  static readonly SCHEME_SET = new Set([this.FILTER, this.MATCH_ALL, this.MATCH_NONE]);

  static isValid(input: string): input is TSearchFilterOutcome {
    return this.SCHEME_SET.has(input);
  }
}
export type TSearchFilterOutcome = TConstValue<typeof SearchFilterOutcomes>;

export type TCompiledWhere =
  | { outcome: typeof SearchFilterOutcomes.FILTER; filterBy: string }
  | { outcome: typeof SearchFilterOutcomes.MATCH_ALL }
  | { outcome: typeof SearchFilterOutcomes.MATCH_NONE };

/**
 * Query-time capabilities a dialect compiles against. Passed per call, never stored: every
 * datasource shares ONE dialect instance (`typesense/datasources/datasource.ts:29` holds it in a
 * static), so a dialect that remembered a collection would answer the next collection's query
 * with the previous one's fields.
 */
export interface ISearchCompileCapabilities {
  /**
   * Field names the collection declares. ABSENT means "unvalidated" - an entity carrying no
   * collection definition must still compile, exactly as it did before field checking existed.
   */
  fields?: ReadonlySet<string>;
}

/** Search-engine query parameters translated from a repository-level TFilter. Only the cross-engine intersection lives here - an engine's own tuning knobs go on its own extension. Field names stay camelCase; wire format is produced only at the dialect's `toWireParams` boundary. */
export interface ISearchQuery {
  /** Full-text search term. Use '*' for pure filter listings. */
  query: string;
  filterBy?: string;
  sortBy?: string;
  page?: number;
  perPage?: number;
  includeFields?: string;
  excludeFields?: string;

  // Native offset pagination for engines that support it; the Typesense dialect keeps page/perPage and never sets this.
  offset?: number;

  // Field-list form of `q` for keyword/hybrid search, comma-joined.
  queryBy?: string;

  // Per-field relevance weights paralleling `queryBy`, comma-joined (e.g. '2,1').
  queryByWeights?: string;

  // Faceting
  facetBy?: string;
  facetQuery?: string;
  maxFacetValues?: number;

  // Highlighting
  highlightFields?: string;
  highlightFullFields?: string;
  highlightStartTag?: string;
  highlightEndTag?: string;
  snippetThreshold?: number;

  // Grouping
  groupBy?: string;
  groupLimit?: number;
  groupMissingValues?: boolean;

  /** Engine-native wire parameters, merged last into `toWireParams` output verbatim and unvalidated; keys use the engine's own vocabulary (`num_typos`, not `numTypos`). */
  engineParams?: Record<string, unknown>;

  /** The `where` compiled to an absorbing false: no query can match, so the repository answers empty WITHOUT calling the engine. Internal - `toWireParams` strips it, so it never reaches the wire. */
  matchNone?: boolean;
}

/** Translates repository-level `TFilter`/`TWhere` into a search-engine-specific query. */
export interface ISearchQueryDialect {
  build(opts: {
    filter?: TFilter;
    hiddenFields?: string[];
    capabilities?: ISearchCompileCapabilities;
  }): ISearchQuery;

  /**
   * @deprecated Use `compileWhere`, which can express the absorbing outcomes a filter STRING
   * cannot. This signature has no representation for "matches nothing" - it returned `''`, which
   * the caller could not tell from "no constraint", so an empty `or` widened the query it was
   * meant to narrow. It now THROWS on that input rather than answering wrongly.
   */
  toWhere(opts: { where: TWhere }): string;

  /**
   * Compiles a `where` tree, resolving what a filter string cannot express. `capabilities` is
   * per-call, never retained - one dialect instance serves every datasource.
   */
  compileWhere(opts: { where: TWhere; capabilities?: ISearchCompileCapabilities }): TCompiledWhere;

  /**
   * Whether this engine can express `operator` at all. Published by the dialect rather than
   * hand-copied by callers, so it cannot drift from the engine's own `switch`; every member of
   * `QueryOperators.SCHEME_SET` has an answer, which is what stops a new engine from silently
   * leaving one unclassified.
   */
  canExpress(opts: { operator: string }): boolean;

  /**
   * ANDs already-compiled clauses using this engine's own conjunction, honouring the absorbing
   * outcomes. The repository needs this to combine a caller clause with a repository-owned one it
   * compiled SEPARATELY - the joiner belongs to the engine, so the dialect supplies it rather
   * than the caller guessing `&&` versus `AND`.
   */
  conjoin(opts: { clauses: TCompiledWhere[] }): TCompiledWhere;

  /** Writes every engine-specific consequence of a non-raw search input onto `query` (mode dispatch, vector clause, tuning knobs) - keeping `ReadableSearchRepository` engine-free. */
  applySearchInput(opts: {
    query: ISearchQuery;
    input: Exclude<TSearchInput, { mode: typeof SearchModes.RAW }>;
  }): void;

  /** Maps a camelCase query record onto the engine's wire-format field names via a key lookup, never a wire-cased identifier; `engineParams` merges last. */
  toWireParams(opts: { query: Partial<ISearchQuery> }): Record<string, unknown>;
}
