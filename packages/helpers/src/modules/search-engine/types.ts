export interface ISearchEngineTypeMap {
  schema: unknown;
  collection: unknown;
  field: unknown;
  searchParams: unknown;
  searchResult: unknown;
  multiSearchRequest: unknown;
  multiSearchResult: unknown;
  importResponse: unknown;
}

export interface IImportResult<TResponse = unknown> {
  successCount: number;
  failCount: number;
  responses: TResponse[];
}

export interface IAliasInfo {
  name: string;
  collection: string;
}

export interface ISearchEngineHelperCallbacks {
  onInitialized?: (opts: { name: string }) => void;
  onError?: (opts: { name: string; error: unknown }) => void;
}

export interface ISearchEngineHelper<TMap extends ISearchEngineTypeMap = ISearchEngineTypeMap> {
  // lifecycle
  getHealth(): Promise<{ ok: boolean }>;
  ping(): Promise<boolean>;

  // collections
  createCollection(opts: { schema: TMap['schema'] }): Promise<TMap['collection'] | void>;
  ensureCollection(opts: { schema: TMap['schema'] }): Promise<TMap['collection']>;
  getCollection(opts: { name: string }): Promise<TMap['collection']>;
  listCollections(): Promise<TMap['collection'][]>;
  collectionExists(opts: { name: string }): Promise<boolean>;
  patchCollectionSchema(opts: { name: string; fields: TMap['field'][] }): Promise<void>;
  deleteCollection(opts: { name: string }): Promise<boolean>;

  // aliases (primitives only)
  upsertAlias(opts: { name: string; collection: string }): Promise<void>;
  getAlias(opts: { name: string }): Promise<IAliasInfo | null>;

  // documents
  createDocument<T extends object>(opts: { collection: string; document: T }): Promise<T>;
  getDocument<T extends object>(opts: { collection: string; id: string }): Promise<T>;
  upsertDocument<T extends object>(opts: { collection: string; document: T }): Promise<T>;
  updateDocument<T extends object>(opts: {
    collection: string;
    id: string;
    document: Partial<T>;
  }): Promise<T>;
  deleteDocument(opts: { collection: string; id: string }): Promise<boolean>;
  // Engine-specific import tuning (e.g. typesense's action/dirtyValues) is added by each
  // backend's widened override, keeping this contract engine-agnostic.
  importDocuments<T extends object>(opts: {
    collection: string;
    documents: T[];
    batchSize?: number;
  }): Promise<IImportResult<TMap['importResponse']>>;
  updateByFilter<T extends object>(opts: {
    collection: string;
    document: Partial<T>;
    filterBy: string;
  }): Promise<{ updatedCount: number }>;
  deleteByFilter(opts: { collection: string; filterBy: string }): Promise<number>;
  deleteAllDocuments(opts: { collection: string }): Promise<boolean>;
  exportDocuments(opts: {
    collection: string;
    filterBy?: string;
    includeFields?: string[];
  }): Promise<string>;

  // search (raw passthrough; concrete backends MAY widen with a document generic)
  search(opts: { collection: string; params: TMap['searchParams'] }): Promise<TMap['searchResult']>;
  multiSearch(opts: {
    searches: TMap['multiSearchRequest'][];
    commonParams?: Partial<TMap['searchParams']>;
  }): Promise<TMap['multiSearchResult']>;
}
