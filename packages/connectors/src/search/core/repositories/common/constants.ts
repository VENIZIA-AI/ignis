import { buildQuerySchemas } from '@venizia/ignis-filter/schemas';
import { z } from 'zod';
import type { TConstValue } from '@venizia/ignis-helpers/common';

const { FieldsSchema, LimitSchema, OffsetSchema, OrderBySchema, SkipSchema, WhereSchema } =
  buildQuerySchemas({
    // zod's own `.meta()`, which the OpenAPI generator reads: this layer must load without hono.
    decorate: (schema, metadata) => (schema instanceof z.ZodType ? schema.meta(metadata) : schema),
  });

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
  .describe(
    'Search-scoped filter - same shape as the repository TFilter minus include (search has no relations)',
  );

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
  .describe('Keyword full-text search');

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
  .describe('Vector / semantic search');

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
  .describe('Hybrid keyword + vector search');

const RawSearchSchema = z
  .object({
    mode: z.literal(SearchModes.RAW),
    params: z.record(z.string(), z.any()),
  })
  .describe('Raw engine passthrough');

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
  .describe('A single collection query within a multi-search');
export type TMultiSearchEntry = z.infer<typeof MultiSearchEntrySchema>;

/** Cross-collection multi-search input: friendly `searches` entries plus the union flag. */
export const MultiSearchInputSchema = z
  .object({
    searches: z.array(MultiSearchEntrySchema).min(1),
    union: z.boolean().optional(),
  })
  .describe('Cross-collection multi-search (federated by default; union merges results)');
export type TMultiSearchInput = z.infer<typeof MultiSearchInputSchema>;
