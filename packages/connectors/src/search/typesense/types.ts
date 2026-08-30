import type { CollectionCreateSchema } from 'typesense/lib/Typesense/Collections';
import type { CollectionSchema, CollectionFieldSchema } from 'typesense/lib/Typesense/Collection';
import type {
  SearchParams,
  SearchResponse,
  SearchOptions,
  ImportResponse,
  DocumentSchema,
} from 'typesense/lib/Typesense/Documents';
import type { UnionSearchResponse } from 'typesense/lib/Typesense/Types';
import type { TConstValue } from '@venizia/ignis-helpers/common';
import type { ISearchConnectorCallbacks } from '@/search/core';

// CollectionFieldSchema is exported from Collection (singular), not Collections.
export type TDocumentSchema = DocumentSchema;
export type TCollectionCreateSchema = CollectionCreateSchema;
export type TCollectionSchema = CollectionSchema;
export type TCollectionFieldSchema = CollectionFieldSchema;
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

export interface ITypesenseNode {
  host: string;
  port: number;
  protocol?: string;
}

export interface ITypesenseConnectorOptions extends ISearchConnectorCallbacks {
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

export interface ITypesenseDataSourceSettings {
  nodes: Array<{ host: string; port: number; protocol?: string }>;
  apiKey: string;
  connectionTimeoutSeconds?: number;
  numRetries?: number;
}

// Narrow structural view of the client surface this connector needs - both the real Client and the in-test fake satisfy it without `as any`.
interface ITypesenseDocumentsApi {
  create(document: unknown, options?: unknown): Promise<unknown>;
  upsert(document: unknown, options?: unknown): Promise<unknown>;
  update(document: unknown, options: unknown): Promise<unknown>;
  delete(query?: unknown): Promise<unknown>;
  import(documents: unknown[], options?: unknown): Promise<unknown>;
  search(searchParameters: unknown, options?: unknown): Promise<unknown>;
  export(options?: unknown): Promise<unknown>;
}
interface ITypesenseDocumentApi {
  retrieve(): Promise<unknown>;
  update(partialDocument: unknown, options?: unknown): Promise<unknown>;
  delete(options?: unknown): Promise<unknown>;
}
interface ITypesenseSynonymSetApi {
  upsert(params: unknown): Promise<unknown>;
  retrieve(): Promise<unknown>;
  delete(): Promise<unknown>;
}
interface ITypesenseSynonymSetsApi {
  retrieve(): Promise<unknown>;
}
interface ITypesenseCollectionApi {
  documents(): ITypesenseDocumentsApi;
  documents(documentId: string): ITypesenseDocumentApi;
  retrieve(): Promise<unknown>;
  update(schema: unknown): Promise<unknown>;
  delete(options?: unknown): Promise<unknown>;
  exists(): Promise<boolean>;
}
interface ITypesenseCollectionsApi {
  create(schema: unknown, options?: unknown): Promise<unknown>;
  retrieve(options?: unknown): Promise<unknown>;
}
interface ITypesenseAliasApi {
  retrieve(): Promise<unknown>;
}
interface ITypesenseAliasesApi {
  upsert(name: string, mapping: unknown): Promise<unknown>;
}
export interface ITypesenseClientLike {
  collections(): ITypesenseCollectionsApi;
  collections(collectionName: string): ITypesenseCollectionApi;
  aliases(): ITypesenseAliasesApi;
  aliases(aliasName: string): ITypesenseAliasApi;
  synonymSets(): ITypesenseSynonymSetsApi;
  synonymSets(synonymSetName: string): ITypesenseSynonymSetApi;
  health: { retrieve(): Promise<unknown> };
  multiSearch: {
    perform(searchRequests: unknown, commonParams?: unknown, options?: unknown): Promise<unknown>;
  };
}
