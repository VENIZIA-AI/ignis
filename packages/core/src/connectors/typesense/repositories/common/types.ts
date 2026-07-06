import { TFilter, TWhere } from '@/base/repositories/common';

/** Search-engine query parameters produced by translating a repository-level TFilter. Shaped after Typesense's search params, but pure data - no SDK import. */
// Property names below mirror Typesense's actual search-param field names verbatim
// (snake_case is the wire format) - they are not restyleable to camelCase.
/* eslint-disable @typescript-eslint/naming-convention */
export interface ISearchQuery {
  /** Search query string. Use '*' for pure filter listings (no full-text search term). */
  q: string;
  filter_by?: string;
  sort_by?: string;
  page?: number;
  per_page?: number;
  include_fields?: string;
  exclude_fields?: string;
  // Native offset pagination for engines that support it; the Typesense dialect keeps page/per_page and never sets this.
  offset?: number;
}
/* eslint-enable @typescript-eslint/naming-convention */

/** Translates repository-level `TFilter`/`TWhere` into a search-engine-specific query. */
export interface ISearchQueryDialect {
  translate(opts: { filter?: TFilter; hiddenFields?: string[] }): ISearchQuery;
  translateWhere(opts: { where: TWhere }): string;
}
