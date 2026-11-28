import type { SearchModes, TSearchInput } from '@/search/core/repositories/common';

/** The inputs a dialect translates: `raw` has already returned by the time these are resolved, and `applySearchInput` accepts only this narrowed union. */
export type TTranslatableSearchInput = Exclude<TSearchInput, { mode: typeof SearchModes.RAW }>;
