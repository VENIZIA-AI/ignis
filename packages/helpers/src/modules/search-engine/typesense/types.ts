import type { CollectionCreateSchema } from 'typesense/lib/Typesense/Collections';
import type { CollectionSchema, CollectionFieldSchema } from 'typesense/lib/Typesense/Collection';
import type {
  SearchParams,
  SearchResponse,
  SearchOptions,
  ImportResponse,
  DocumentSchema,
} from 'typesense/lib/Typesense/Documents';
import type { TConstValue } from '@/common/types';
import type { ISearchEngineHelperCallbacks, ISearchEngineTypeMap } from '../types';

// Re-export Typesense types under stable T-prefixed aliases (type-only; erased at runtime).
// VERIFIED against typesense@3.0.6:
//  - CollectionFieldSchema is exported from Collection (singular), NOT Collections.
//  - SearchParams<TDoc, Infix> and SearchResponse<T> are generic over the document type.
//  - typesense's MultiSearchRequestsSchema / MultiSearchResponse are conditional generics
//    unsuitable for a clean passthrough API, so we define helper-owned IMultiSearchEntry /
//    IMultiSearchResult below instead of re-exporting them.
export type TDocumentSchema = DocumentSchema;
export type TCollectionCreateSchema = CollectionCreateSchema;
export type TCollectionSchema = CollectionSchema;
export type TCollectionFieldSchema = CollectionFieldSchema;
export type TSearchParams = SearchParams<TDocumentSchema>;
export type TSearchResponse<T extends TDocumentSchema = TDocumentSchema> = SearchResponse<T>;
// Per-request client options (abortSignal, cacheSearchResultsForSeconds) — a sibling argument to
// SearchParams in typesense's search()/multiSearch.perform(), forwarded verbatim by the helper.
export type TSearchOptions = SearchOptions;
export type TImportResponse = ImportResponse;

// Helper-owned multi-search shapes (passthrough): each entry is a search-params object plus the
// target collection; the result is the non-union { results: [...] } shape typesense returns.
// eslint-disable-next-line @typescript-eslint/naming-convention
export type IMultiSearchEntry = Partial<TSearchParams> & { collection: string };
export interface IMultiSearchResult<T extends TDocumentSchema = TDocumentSchema> {
  results: TSearchResponse<T>[];
}

export interface ITypesenseTypeMap extends ISearchEngineTypeMap {
  schema: TCollectionCreateSchema;
  collection: TCollectionSchema;
  field: TCollectionFieldSchema;
  searchParams: TSearchParams;
  searchResult: TSearchResponse;
  multiSearchRequest: IMultiSearchEntry;
  multiSearchResult: IMultiSearchResult;
  importResponse: TImportResponse;
}

export interface ITypesenseNode {
  host: string;
  port: number;
  protocol?: string;
}

export interface ITypesenseHelperOptions extends ISearchEngineHelperCallbacks {
  name: string;
  nodes: ITypesenseNode[];
  apiKey: string;
  connectionTimeoutSeconds?: number;
  numRetries?: number;
  scope?: string;
  identifier?: string;
}

export class TypesenseImportActions {
  static readonly CREATE = 'create';
  static readonly UPSERT = 'upsert';
  static readonly UPDATE = 'update';
  static readonly EMPLACE = 'emplace';
  static readonly SCHEME_SET = new Set<string>([
    this.CREATE,
    this.UPSERT,
    this.UPDATE,
    this.EMPLACE,
  ]);
  static isValid(value: string): value is TTypesenseImportAction {
    return this.SCHEME_SET.has(value);
  }
}

export type TTypesenseImportAction = TConstValue<typeof TypesenseImportActions>;

export class TypesenseDirtyValues {
  static readonly COERCE_OR_REJECT = 'coerce_or_reject';
  static readonly COERCE_OR_DROP = 'coerce_or_drop';
  static readonly DROP = 'drop';
  static readonly REJECT = 'reject';
  static readonly SCHEME_SET = new Set<string>([
    this.COERCE_OR_REJECT,
    this.COERCE_OR_DROP,
    this.DROP,
    this.REJECT,
  ]);
  static isValid(value: string): value is TTypesenseDirtyValue {
    return this.SCHEME_SET.has(value);
  }
}

export type TTypesenseDirtyValue = TConstValue<typeof TypesenseDirtyValues>;
