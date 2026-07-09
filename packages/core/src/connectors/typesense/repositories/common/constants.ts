import {
  FieldsSchema,
  LimitSchema,
  OffsetSchema,
  OrderBySchema,
  SkipSchema,
  WhereSchema,
} from '@/base/repositories/query-schemas';
import { z } from '@hono/zod-openapi';
import type { TConstValue } from '@venizia/ignis-helpers';
import type { ISearchQuery } from './types';

/** Discriminant values for `TSearchInput.mode` - which search strategy `ReadableSearchRepository.search()` runs. */
export class SearchModes {
  static readonly KEYWORD = 'keyword';
  static readonly SEMANTIC = 'semantic';
  static readonly HYBRID = 'hybrid';
  static readonly RAW = 'raw';

  static readonly SCHEME_SET = new Set([this.KEYWORD, this.SEMANTIC, this.HYBRID, this.RAW]);

  static isValid(input: string): input is TSearchMode {
    return this.SCHEME_SET.has(input);
  }
}
export type TSearchMode = TConstValue<typeof SearchModes>;

/**
 * `FilterSchema` (`@/base/repositories/query-schemas`) is unusable here: it embeds `include`,
 * which recurses through `InclusionSchema`'s `z.lazy(() => FilterSchema)` - and the Typesense
 * dialect's `build()` unconditionally throws on `include` anyway (search has no relations).
 * Reassembled from the same atomic pieces minus `include`, so `z.infer` stays finite - embedding
 * the recursive `FilterSchema` instead collapses TypeScript's optional-key inference for every
 * sibling field in the containing `z.object`, silently turning `filter` into a required `any`.
 */
const SearchFilterSchema = z
  .object({
    where: WhereSchema.optional(),
    fields: FieldsSchema,
    order: OrderBySchema,
    limit: LimitSchema,
    offset: OffsetSchema,
    skip: SkipSchema,
  })
  .optional()
  .openapi({
    description:
      'Search-scoped filter - same shape as the repository TFilter minus include (search has no relations)',
  });

/** Shape object (NOT a z.object) so it can be spread into each mode's z.object - faceting/highlighting/
 * grouping/tuning params shared by keyword/semantic/hybrid. `raw` mode skips this - params go verbatim. */
const commonSearchParamsShape = {
  facetBy: z.array(z.string()).optional(),
  facetQuery: z.string().optional(),
  maxFacetValues: z.number().optional(),

  highlightFields: z.array(z.string()).optional(),
  highlightFullFields: z.array(z.string()).optional(),
  highlightStartTag: z.string().optional(),
  highlightEndTag: z.string().optional(),
  snippetThreshold: z.number().optional(),

  groupBy: z.array(z.string()).optional(),
  groupLimit: z.number().optional(),
  groupMissingValues: z.boolean().optional(),

  numTypos: z.union([z.number(), z.string()]).optional(),
  prefix: z.union([z.boolean(), z.string()]).optional(),
  infix: z.string().optional(),
  useCache: z.boolean().optional(),
  cacheTtl: z.number().optional(),
  exhaustiveSearch: z.boolean().optional(),
  pinnedHits: z.string().optional(),
  hiddenHits: z.string().optional(),

  queryByWeights: z.array(z.number()).optional(),
  prioritizeExactMatch: z.boolean().optional(),
  dropTokensThreshold: z.number().optional(),
  preset: z.string().optional(),
};

const KeywordSearchSchema = z
  .object({
    mode: z.literal(SearchModes.KEYWORD),
    query: z.string().optional(),
    queryBy: z.array(z.string()).optional(),
    filter: SearchFilterSchema,
    ...commonSearchParamsShape,
  })
  .openapi({ description: 'Keyword full-text search' });

const SemanticSearchSchema = z
  .object({
    mode: z.literal(SearchModes.SEMANTIC),
    vectorField: z.string(),
    nearVector: z.array(z.number()).optional(),
    queryText: z.string().optional(),
    k: z.number().optional(),
    filter: SearchFilterSchema,
    ...commonSearchParamsShape,
    distanceThreshold: z.number().optional(),
    ef: z.number().optional(),
  })
  .openapi({ description: 'Vector / semantic search' });

const HybridSearchSchema = z
  .object({
    mode: z.literal(SearchModes.HYBRID),
    query: z.string(),
    queryBy: z.array(z.string()),
    vectorField: z.string(),
    nearVector: z.array(z.number()).optional(),
    alpha: z.number().optional(),
    k: z.number().optional(),
    filter: SearchFilterSchema,
    ...commonSearchParamsShape,
    distanceThreshold: z.number().optional(),
    ef: z.number().optional(),
  })
  .openapi({ description: 'Hybrid keyword + vector search' });

const RawSearchSchema = z
  .object({
    mode: z.literal(SearchModes.RAW),
    params: z.record(z.string(), z.any()),
  })
  .openapi({ description: 'Raw engine passthrough' });

export const SearchInputSchema = z.discriminatedUnion('mode', [
  KeywordSearchSchema,
  SemanticSearchSchema,
  HybridSearchSchema,
  RawSearchSchema,
]);
export type TSearchInput = z.infer<typeof SearchInputSchema>;

/**
 * A single collection's query within a multi-search. Uses the SAME friendly field names as
 * single-collection `search()` - `query` (not `q`), `queryBy: string[]`, and the array-shaped
 * `commonSearchParamsShape` (`facetBy`/`highlightFields`/...) - so the two APIs read identically.
 * `filterBy` is a raw engine filter string: a cross-collection search has no per-collection model to
 * translate a `TFilter` against. The datasource maps every entry to snake_case wire via the dialect.
 */
export const MultiSearchEntrySchema = z
  .object({
    collection: z.string(),
    query: z.string().optional(),
    queryBy: z.array(z.string()).optional(),
    filterBy: z.string().optional(),
    sortBy: z.string().optional(),
    page: z.number().optional(),
    perPage: z.number().optional(),
    offset: z.number().optional(),
    includeFields: z.array(z.string()).optional(),
    excludeFields: z.array(z.string()).optional(),
    vectorQuery: z.string().optional(),
    ...commonSearchParamsShape,
  })
  .openapi({ description: 'A single collection query within a multi-search' });
export type TMultiSearchEntry = z.infer<typeof MultiSearchEntrySchema>;

/** List-shaped friendly fields that are comma-joined into their single `ISearchQuery` wire form. */
const MULTI_SEARCH_LIST_FIELDS = new Set([
  'queryBy',
  'includeFields',
  'excludeFields',
  'facetBy',
  'highlightFields',
  'highlightFullFields',
  'groupBy',
  'queryByWeights',
]);

/**
 * Friendly multi-search params -> `ISearchQuery`: `query` becomes `q`, list fields are comma-joined,
 * everything else passes through. The dialect then maps the result to snake_case wire, so single
 * `search()` and `multiSearch()` share one friendly-to-wire path. Also used for `commonParams`.
 */
export function toSearchQueryParams(input: Record<string, unknown>): Partial<ISearchQuery> {
  const params: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || key === 'collection') {
      continue;
    }

    if (key === 'query') {
      params.q = value;
      continue;
    }

    params[key] =
      MULTI_SEARCH_LIST_FIELDS.has(key) && Array.isArray(value) ? value.join(',') : value;
  }

  return params as Partial<ISearchQuery>;
}

/** Cross-collection multi-search input: friendly `searches` entries plus the union flag. */
export const MultiSearchInputSchema = z
  .object({
    searches: z.array(MultiSearchEntrySchema).min(1),
    union: z.boolean().optional(),
  })
  .openapi({
    description: 'Cross-collection multi-search (federated by default; union merges results)',
  });
export type TMultiSearchInput = z.infer<typeof MultiSearchInputSchema>;
