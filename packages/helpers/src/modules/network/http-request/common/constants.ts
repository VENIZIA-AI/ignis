import type { TConstValue } from '@/common/types';

/** The HTTP clients a fetcher can be built on. */
export class FetcherVariants {
  /** The built-in `fetch` (Bun's, or a browser's). */
  static readonly NATIVE = 'native';
  static readonly AXIOS = 'axios';
}

/** Valid fetcher variant values. */
export type TFetcherVariant = TConstValue<typeof FetcherVariants>;
