import type { TConstValue } from '@/common/types';

/** The HTTP clients a fetcher can be built on. */
export class FetcherVariants {
  static readonly NODE_FETCH = 'node-fetch';
  static readonly AXIOS = 'axios';
}

/** Valid fetcher variant values. */
export type TFetcherVariant = TConstValue<typeof FetcherVariants>;
