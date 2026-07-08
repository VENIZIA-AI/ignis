import { z } from '@hono/zod-openapi';
import { TConstValue } from '@venizia/ignis-helpers';
import {
  FieldsSchema,
  LimitSchema,
  OffsetSchema,
  OrderBySchema,
  SkipSchema,
  WhereSchema,
} from '@/base/repositories/query-schemas';

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
 * Cross-collection multi-search input. Each entry is `{ collection }` plus arbitrary NATIVE engine
 * params via `.catchall` - the deliberate escape hatch for multi-search (unlike single-collection
 * `TSearchInput`, there is no per-engine dialect translation here; entries are forwarded verbatim
 * to `dataSource.multiSearch()`, same raw-passthrough contract as `SearchModes.RAW`).
 */
export const MultiSearchInputSchema = z
  .object({
    searches: z.array(z.object({ collection: z.string() }).catchall(z.any())).min(1),
    union: z.boolean().optional(),
  })
  .openapi({
    description: 'Cross-collection multi-search (federated by default; union merges results)',
  });
export type TMultiSearchInput = z.infer<typeof MultiSearchInputSchema>;
