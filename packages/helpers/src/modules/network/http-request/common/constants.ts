import type { TConstValue } from '@/common/types';

/** The HTTP clients a fetcher can be built on. */
export class FetcherVariants {
  static readonly NODE_FETCH = 'node-fetch';
  static readonly AXIOS = 'axios';

  static readonly SCHEME_SET = new Set<string>([this.NODE_FETCH, this.AXIOS]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

/** Valid fetcher variant values. */
export type TFetcherVariant = TConstValue<typeof FetcherVariants>;
