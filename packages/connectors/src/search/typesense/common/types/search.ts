import type {
  SearchParams,
  SearchResponse,
  SearchOptions,
  ImportResponse,
} from 'typesense/lib/Typesense/Documents';
import type { UnionSearchResponse } from 'typesense/lib/Typesense/Types';
import type { TDocumentSchema } from './schema';

export type TSearchParams = SearchParams<TDocumentSchema>;
export type TSearchResponse<T extends TDocumentSchema = TDocumentSchema> = SearchResponse<T>;

// Per-request client options, forwarded verbatim by the connector alongside SearchParams.
export type TSearchOptions = SearchOptions;
export type TImportResponse = ImportResponse;

export interface IMultiSearchResult<T extends TDocumentSchema = TDocumentSchema> {
  results: TSearchResponse<T>[];
}
// Union multi-search merges every `searches` entry into ONE result set instead of side-by-side `results[]` - extends typesense's own merged-response shape (SearchResponse minus `request_params`, plus `union_request_params` describing each contributing search).
export interface IUnionSearchResult<
  T extends TDocumentSchema = TDocumentSchema,
> extends UnionSearchResponse<T> {}
