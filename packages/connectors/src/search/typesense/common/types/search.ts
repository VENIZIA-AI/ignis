import type {
  SearchParams,
  SearchResponse,
  SearchOptions,
  ImportResponse,
} from 'typesense/lib/Typesense/Documents';
import type { UnionSearchResponse } from 'typesense/lib/Typesense/Types';
import type { TDocumentSchema } from './schema';

/** The `typesense` package's `SearchParams` for documents of `TDocumentSchema`. */
export type TSearchParams = SearchParams<TDocumentSchema>;
/** The `typesense` package's `SearchResponse` for documents of type `T`. */
export type TSearchResponse<T extends TDocumentSchema = TDocumentSchema> = SearchResponse<T>;

// Per-request client options, forwarded verbatim by the connector alongside SearchParams.
/** The `typesense` package's per-request `SearchOptions`. */
export type TSearchOptions = SearchOptions;
/** The `typesense` package's `ImportResponse`, the per-row result of an import. */
export type TImportResponse = ImportResponse;

/** Result of a federated multi-search: one `SearchResponse` per search, in request order. */
export interface IMultiSearchResult<T extends TDocumentSchema = TDocumentSchema> {
  results: TSearchResponse<T>[];
}
// Union multi-search merges every `searches` entry into ONE result set instead of side-by-side `results[]` - extends typesense's own merged-response shape (SearchResponse minus `request_params`, plus `union_request_params` describing each contributing search).
/** Result of a union multi-search: all searches merged into one result set. */
export interface IUnionSearchResult<
  T extends TDocumentSchema = TDocumentSchema,
> extends UnionSearchResponse<T> {}
