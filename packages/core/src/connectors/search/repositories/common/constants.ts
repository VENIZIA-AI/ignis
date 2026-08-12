import {
  FieldsSchema,
  LimitSchema,
  OffsetSchema,
  OrderBySchema,
  SkipSchema,
  WhereSchema,
} from '@/base/repositories/query-schemas';
import { z } from '@hono/zod-openapi';
import type { TConstValue } from '@venizia/ignis-helpers/common';
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

/** Reassembled from FilterSchema's atomic pieces minus `include` (search has no relations) so `z.infer` stays finite - embedding the recursive FilterSchema collapses optional-key inference for every sibling field, silently turning `filter` into a required `any`. */
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

/** Shape object (NOT a z.object) so it spreads into each mode's z.object; `raw` mode skips it. Only cross-engine params live here - engine-specific tuning goes through `engineParams`. */
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

  queryByWeights: z.array(z.number()).optional(),

  /** Escape hatch for engine-specific tuning: keys are the engine's OWN wire names (`num_typos`, not `numTypos`), merged verbatim and unvalidated after every neutral param. */
  engineParams: z.record(z.string(), z.unknown()).optional(),
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

/** One collection's query within a multi-search - same friendly field names as `search()`. `filterBy` is a raw engine filter string because cross-collection search has no per-collection model to translate a `TFilter` against; the datasource maps entries to wire form via the dialect. */
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

/** Friendly multi-search params -> `ISearchQuery`: list fields comma-joined, the rest pass through; keeps `search()`, `multiSearch()` and `commonParams` on one friendly-to-wire path. */
export const toSearchQueryParams = (input: Record<string, unknown>): Partial<ISearchQuery> => {
  const params: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || key === 'collection') {
      continue;
    }

    params[key] =
      MULTI_SEARCH_LIST_FIELDS.has(key) && Array.isArray(value) ? value.join(',') : value;
  }

  return params as Partial<ISearchQuery>;
};

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
