import type { ISynonym } from '@/connectors/typesense/models';
import type { ValueOrPromise } from '@venizia/ignis-helpers';
import { BaseHelper, getError } from '@venizia/ignis-helpers';
import { Client } from 'typesense';
import { TypesenseInternal } from './internal/connector-internal';
import { SearchConnectorInternal } from './internal/search-connector-internal';
import type {
  IMultiSearchResult,
  ITypesenseConnectorOptions,
  IUnionSearchResult,
  TCollectionCreateSchema,
  TCollectionFieldSchema,
  TCollectionSchema,
  TDocumentSchema,
  TImportResponse,
  TSearchOptions,
  TSearchParams,
  TSearchResponse,
  TTypesenseDirtyValue,
  TTypesenseImportAction,
} from './types';
import { TypesenseDirtyValues, TypesenseImportActions } from './types';

export interface IImportResult<TResponse = unknown> {
  count: { success: number; fail: number };
  responses: TResponse[];
}

export interface IAliasInfo {
  name: string;
  collection: string;
}

export interface ISearchConnectorCallbacks {
  onInitialized?: (opts: { name: string }) => void;
  onError?: (opts: { name: string; error: unknown }) => void;
}

/** Search-response envelope - the read-path counterpart to IImportResult, consumed by ReadableSearchRepository without a boundary cast. */
export interface ISearchResult<
  DocumentType extends object = object,
  HighlightType = unknown,
  FacetCountType = unknown,
  GroupedHitType = unknown,
> {
  found: number;
  outOf?: number;
  searchTimeMs?: number;
  hits?: Array<{
    document: DocumentType;
    highlight?: HighlightType;
    highlights?: HighlightType[];
    textMatch?: number;
  }>;
  facetCounts?: FacetCountType[];
  groupedHits?: GroupedHitType[];
}

// The schema/field types are engine-specific, not caller-owned - so they are interface-level
// generics (the engine's connector fills them), not per-method generics like `document`. They
// default to `unknown` so the neutral `ISearchConnector` stays engine-agnostic.
export interface ISearchCollectionScoped<
  CreateSchema = unknown,
  Schema = unknown,
  FieldSchema = unknown,
> {
  create(opts: { schema: CreateSchema }): Promise<Schema | void>;
  ensure(opts: { schema: CreateSchema }): Promise<Schema>;
  get(opts: { name: string }): Promise<Schema>;
  list(): Promise<Schema[]>;
  exists(opts: { name: string }): Promise<boolean>;
  patchSchema(opts: { name: string; fields: FieldSchema[] }): Promise<void>;
  delete(opts: { name: string }): Promise<boolean>;
}

export interface ISearchAliasScoped {
  upsert(opts: { name: string; collection: string }): Promise<void>;
  get(opts: { name: string }): Promise<IAliasInfo | null>;
}

// Synonym SETS (Typesense v30+): a named set of items, linked to one or more collections. Replaces
// the removed per-collection synonyms API. `ISynonym` is the item shape ({ id, synonyms, root? }).
export interface ISearchSynonymSetScoped {
  upsert(opts: { name: string; items: ISynonym[] }): Promise<void>;
  get(opts: { name: string }): Promise<ISynonym[] | null>;
  list(): Promise<string[]>;
  delete(opts: { name: string }): Promise<boolean>;
  link(opts: { collection: string; synonymSets: string[] }): Promise<void>;
}

export interface ISearchDocumentScoped {
  get<T extends object>(opts: { collection: string; id: string }): Promise<T>;

  create<T extends object>(opts: { collection: string; document: T }): Promise<T>;

  upsert<T extends object>(opts: { collection: string; document: T }): Promise<T>;
  update<T extends object>(opts: {
    collection: string;
    id: string;
    document: Partial<T>;
  }): Promise<T>;
  updateBy<T extends object>(opts: {
    collection: string;
    document: Partial<T>;
    filterBy: string;
  }): Promise<{ updatedCount: number }>;

  delete(opts: { collection: string; id: string }): Promise<boolean>;
  deleteBy(opts: { collection: string; filterBy: string }): Promise<number>;
  deleteAll(opts: { collection: string }): Promise<boolean>;

  import<T extends object>(opts: {
    collection: string;
    documents: T[];
    batchSize?: number;
  }): Promise<IImportResult<unknown>>;
  export(opts: {
    collection: string;
    filterBy?: string;
    includeFields?: string[];
  }): Promise<string>;
}

/** Verb contract every search-engine connector implements - kept as an interface so tests can fake one without a real typesense Client. */
export interface ISearchConnector {
  getHealth(): Promise<{ ok: boolean }>;
  ping(): Promise<boolean>;

  collection: ISearchCollectionScoped;
  alias: ISearchAliasScoped;
  synonymSet: ISearchSynonymSetScoped;
  document: ISearchDocumentScoped;

  search<TDocument extends object = object>(opts: {
    collection: string;
    params: unknown;
  }): Promise<ISearchResult<TDocument>>;

  multiSearch(opts: {
    searches: unknown[];
    union?: boolean;
    commonParams?: unknown;
    options?: unknown;
  }): Promise<unknown>;
}

export abstract class BaseSearchConnector extends BaseHelper implements ISearchConnector {
  constructor(opts: { scope: string; identifier: string }) {
    super(opts);
  }

  async ping(): Promise<boolean> {
    const health = await this.getHealth();
    return health.ok;
  }

  protected assertNonEmpty(opts: { value?: string | null; name: string; method: string }): void {
    const { value, name, method } = opts;
    if (!value || value.trim().length === 0) {
      throw getError({ message: `[${method}] Missing or empty value | name: ${name}` });
    }
  }

  // Runs the engine verb; tolerated errors route to the caller's branch, everything else becomes a sanitized 503.
  protected async runEngineCall<T>(opts: {
    method: string;
    run: () => ValueOrPromise<T>;
    tolerate?: { when: (error: unknown) => boolean; handle: (error: unknown) => ValueOrPromise<T> };
  }) {
    const { method, run, tolerate } = opts;

    try {
      const rs = await run();
      return rs;
    } catch (error) {
      if (tolerate?.when(error)) {
        const rs = await tolerate.handle(error);
        return rs;
      }

      SearchConnectorInternal.wrapDependencyError({ method, error, logger: this.logger });
    }
  }

  /** Tolerated-404 branch shared by getCollection/patchCollectionSchema/getDocument/updateDocument: throws the sanitized not-found error. */
  protected notFoundTolerance(opts: { method: string; subject: string }): {
    when: (error: unknown) => boolean;
    handle: (error: unknown) => never;
  } {
    const { method, subject } = opts;

    return {
      when: error => TypesenseInternal.isNotFoundError({ error }),
      handle: () => {
        this.logger.for(method).debug('%s not found', subject);
        SearchConnectorInternal.throwNotFoundError({ method, subject });
      },
    };
  }

  /** Tolerated-404 branch shared by deleteCollection/getAlias/getSynonymSet/deleteSynonymSet/deleteDocument: logs and returns a benign sentinel instead of throwing. */
  protected notFoundFallback<T>(opts: {
    method: string;
    message: string;
    args?: unknown[];
    fallback: T;
  }): { when: (error: unknown) => boolean; handle: (error: unknown) => T } {
    const { method, message, args, fallback } = opts;

    return {
      when: error => TypesenseInternal.isNotFoundError({ error }),
      handle: () => {
        this.logger.for(method).debug(message, ...(args ?? []));
        return fallback;
      },
    };
  }

  abstract getHealth(): Promise<{ ok: boolean }>;

  // Resource-scoped verb groups; the concrete connector supplies each as a facade object.
  abstract collection: ISearchCollectionScoped;
  abstract alias: ISearchAliasScoped;
  abstract synonymSet: ISearchSynonymSetScoped;
  abstract document: ISearchDocumentScoped;

  abstract search<TDocument extends object = object>(opts: {
    collection: string;
    params: unknown;
  }): Promise<ISearchResult<TDocument>>;

  abstract multiSearch(opts: {
    searches: unknown[];
    union?: boolean;
    commonParams?: unknown;
  }): Promise<unknown>;
}

// Narrow runtime readers for the `unknown` payloads ITypesenseClientLike hands back - each is the
// single narrowest cast for its field, isolated here instead of repeated ad hoc at every call site.
const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const readBooleanFlag = (opts: { value: unknown; key: string }): boolean => {
  const { value, key } = opts;
  return isRecord(value) ? Boolean(value[key]) : false;
};

const readNumberField = (opts: { value: unknown; key: string }): number => {
  const { value, key } = opts;
  if (!isRecord(value) || typeof value[key] !== 'number') {
    return 0;
  }
  return value[key];
};

const readStringField = (opts: { value: unknown; key: string }): string | undefined => {
  const { value, key } = opts;
  if (!isRecord(value) || typeof value[key] !== 'string') {
    return undefined;
  }
  return value[key];
};

/** Maps a raw Typesense search hit (snake_case `text_match`) onto the camelCase `ISearchResult` hit shape; read via bracket string access so no snake_case identifier is declared here. */
const mapSearchHit = <TDocument extends object>(
  hit: unknown,
): {
  document: TDocument;
  highlight?: unknown;
  highlights?: unknown[];
  textMatch?: number;
} => {
  if (!isRecord(hit)) {
    return { document: {} as TDocument };
  }

  const mapped: {
    document: TDocument;
    highlight?: unknown;
    highlights?: unknown[];
    textMatch?: number;
  } = {
    document: hit['document'] as TDocument,
  };

  if (hit['highlight'] !== undefined) {
    mapped.highlight = hit['highlight'];
  }

  if (Array.isArray(hit['highlights'])) {
    mapped.highlights = hit['highlights'];
  }

  if (typeof hit['text_match'] === 'number') {
    mapped.textMatch = hit['text_match'];
  }

  return mapped;
};

/** Maps a raw Typesense search response onto the camelCase `ISearchResult` - snake_case wire fields
 * (`out_of`/`search_time_ms`/`facet_counts`/`grouped_hits`) are read only via bracket string access,
 * never as identifiers. Absent fields are omitted rather than mapped as `undefined`. */
const mapSearchResult = <TDocument extends object>(raw: unknown): ISearchResult<TDocument> => {
  if (!isRecord(raw)) {
    return { found: 0 };
  }

  const result: ISearchResult<TDocument> = {
    found: readNumberField({ value: raw, key: 'found' }),
  };

  if (typeof raw['out_of'] === 'number') {
    result.outOf = raw['out_of'];
  }
  if (typeof raw['search_time_ms'] === 'number') {
    result.searchTimeMs = raw['search_time_ms'];
  }
  if (Array.isArray(raw['facet_counts'])) {
    result.facetCounts = raw['facet_counts'];
  }
  if (Array.isArray(raw['grouped_hits'])) {
    result.groupedHits = raw['grouped_hits'];
  }
  if (Array.isArray(raw['hits'])) {
    result.hits = raw['hits'].map(hit => mapSearchHit<TDocument>(hit));
  }

  return result;
};

/** Empty TSearchResponse shape returned when search() tolerates a missing collection; built via bracket assignment so no snake_case identifier is declared here. */
const buildEmptySearchResponse = (): unknown => {
  const response: Record<string, unknown> = { found: 0, page: 1, hits: [] };
  response['out_of'] = 0;
  response['search_time_ms'] = 0;
  response['request_params'] = {};
  return response;
};

// Typesense's wire shape for a synonym set; `root` is only present for one-way synonyms.
const isSynonymResponse = (
  value: unknown,
): value is { id: string; synonyms: string[]; root?: string } => {
  return isRecord(value) && typeof value.id === 'string' && Array.isArray(value.synonyms);
};

const toSynonym = (value: { id: string; synonyms: string[]; root?: string }): ISynonym => {
  const { id, synonyms, root } = value;
  // Multi-way sets come back with root: "" - treat empty/absent alike so only one-way keeps a root.
  return root ? { id, synonyms, root } : { id, synonyms };
};

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

/** Typesense engine connector - built/injected by TypesenseDataSource, which exposes the raw client via getClient(). */
export class TypesenseConnector extends BaseSearchConnector {
  private readonly client: ITypesenseClientLike;

  constructor(opts: ITypesenseConnectorOptions & { client?: ITypesenseClientLike }) {
    super({
      scope: opts.scope ?? TypesenseConnector.name,
      identifier: opts.identifier ?? opts.name,
    });

    try {
      this.client =
        opts.client ??
        new Client({
          apiKey: opts.apiKey,
          // NodeConfiguration.protocol is required upstream though ITypesenseNode.protocol is optional; default 'http', cloud users pass 'https'.
          nodes: opts.nodes.map(node => ({ ...node, protocol: node.protocol ?? 'http' })),
          connectionTimeoutSeconds: opts.connectionTimeoutSeconds ?? 5,
          numRetries: opts.numRetries,
        });

      opts.onInitialized?.({ name: opts.name });
    } catch (error) {
      this.logger
        .for('constructor')
        .error(
          'Failed to initialize Typesense client | error: %j',
          SearchConnectorInternal.describeError({ error }),
        );

      opts.onError?.({ name: opts.name, error });
      throw error;
    }
  }

  getClient(): Client {
    return this.client as Client;
  }

  readonly collection: ISearchCollectionScoped<
    TCollectionCreateSchema,
    TCollectionSchema,
    TCollectionFieldSchema
  > = {
    create: opts => this.createCollection(opts),
    ensure: opts => this.ensureCollection(opts),
    get: opts => this.getCollection(opts),
    list: () => this.listCollections(),
    exists: opts => this.collectionExists(opts),
    patchSchema: opts => this.patchCollectionSchema(opts),
    delete: opts => this.deleteCollection(opts),
  };

  readonly alias: ISearchAliasScoped = {
    upsert: opts => this.upsertAlias(opts),
    get: opts => this.getAlias(opts),
  };

  readonly synonymSet: ISearchSynonymSetScoped = {
    upsert: opts => this.upsertSynonymSet(opts),
    get: opts => this.getSynonymSet(opts),
    list: () => this.listSynonymSets(),
    delete: opts => this.deleteSynonymSet(opts),
    link: opts => this.linkSynonymSets(opts),
  };

  readonly document: ISearchDocumentScoped = {
    create: <T extends object>(opts: { collection: string; document: T }) =>
      this.createDocument(opts),
    get: <T extends object>(opts: { collection: string; id: string }) => this.getDocument<T>(opts),
    upsert: <T extends object>(opts: { collection: string; document: T }) =>
      this.upsertDocument(opts),
    update: <T extends object>(opts: { collection: string; id: string; document: Partial<T> }) =>
      this.updateDocument(opts),
    delete: opts => this.deleteDocument(opts),
    import: <T extends object>(opts: { collection: string; documents: T[]; batchSize?: number }) =>
      this.importDocuments(opts),
    updateBy: <T extends object>(opts: {
      collection: string;
      document: Partial<T>;
      filterBy: string;
    }) => this.updateByFilter(opts),
    deleteBy: opts => this.deleteByFilter(opts),
    deleteAll: opts => this.deleteAllDocuments(opts),
    export: opts => this.exportDocuments(opts),
  };

  async getHealth(): Promise<{ ok: boolean }> {
    try {
      const health = await this.client.health.retrieve();
      return { ok: readBooleanFlag({ value: health, key: 'ok' }) };
    } catch (error) {
      this.logger
        .for(this.getHealth.name)
        .warn('Health probe failed | error: %j', SearchConnectorInternal.describeError({ error }));
      return { ok: false };
    }
  }

  async createCollection(opts: {
    schema: TCollectionCreateSchema;
  }): Promise<TCollectionSchema | void> {
    const { schema } = opts;
    const logger = this.logger.for(this.createCollection.name);

    const rs = await this.runEngineCall<TCollectionSchema | void>({
      method: this.createCollection.name,
      run: async () => {
        const created = (await this.client.collections().create(schema)) as TCollectionSchema;
        logger.info('Created collection | name: %s', schema.name);
        return created;
      },
      tolerate: {
        when: error => TypesenseInternal.isAlreadyExistsError({ error }),
        handle: () => {
          logger.info('Collection already exists, skipping | name: %s', schema.name);
        },
      },
    });
    return rs;
  }

  async ensureCollection(opts: { schema: TCollectionCreateSchema }): Promise<TCollectionSchema> {
    const { schema } = opts;

    const isExists = await this.collectionExists({ name: schema.name });
    if (isExists) {
      return this.getCollection({ name: schema.name });
    }

    // The create response IS the collection schema. Reading it back immediately instead is a
    // read-after-write race on multi-node clusters (follower may 404 before the raft log catches
    // up) - found live on a real 3-node cluster. Only the tolerated already-exists path re-reads.
    const created = await this.createCollection({ schema });
    if (created) {
      return created;
    }

    return this.getCollection({ name: schema.name });
  }

  async getCollection(opts: { name: string }): Promise<TCollectionSchema> {
    const { name } = opts;
    this.assertNonEmpty({ value: name, name: 'collection', method: this.getCollection.name });

    const rs = await this.runEngineCall({
      method: this.getCollection.name,
      run: async () => {
        const collection = (await this.client.collections(name).retrieve()) as TCollectionSchema;
        return collection;
      },
      tolerate: this.notFoundTolerance({
        method: this.getCollection.name,
        subject: `Collection '${name}'`,
      }),
    });
    return rs;
  }

  async listCollections(): Promise<TCollectionSchema[]> {
    const rs = await this.runEngineCall({
      method: this.listCollections.name,
      run: async () => {
        const collections = (await this.client.collections().retrieve()) as TCollectionSchema[];
        return collections;
      },
    });
    return rs;
  }

  async collectionExists(opts: { name: string }): Promise<boolean> {
    const { name } = opts;

    if (!name || name.trim().length === 0) {
      return false;
    }

    try {
      const isExists = await this.client.collections(name).exists();
      return isExists;
    } catch (error) {
      this.logger
        .for(this.collectionExists.name)
        .warn(
          'Existence check failed, treating as absent | name: %s | error: %j',
          name,
          SearchConnectorInternal.describeError({ error }),
        );
      return false;
    }
  }

  async patchCollectionSchema(opts: {
    name: string;
    fields: TCollectionFieldSchema[];
  }): Promise<void> {
    const { name, fields } = opts;
    this.assertNonEmpty({
      value: name,
      name: 'collection',
      method: this.patchCollectionSchema.name,
    });
    const logger = this.logger.for(this.patchCollectionSchema.name);

    await this.runEngineCall<void>({
      method: this.patchCollectionSchema.name,
      run: async () => {
        await this.client.collections(name).update({ fields });
        logger.info('Patched schema | name: %s | fields: %d', name, fields.length);
      },
      tolerate: this.notFoundTolerance({
        method: this.patchCollectionSchema.name,
        subject: `Collection '${name}'`,
      }),
    });
  }

  async deleteCollection(opts: { name: string }): Promise<boolean> {
    const { name } = opts;
    this.assertNonEmpty({ value: name, name: 'collection', method: this.deleteCollection.name });
    const logger = this.logger.for(this.deleteCollection.name);

    const rs = await this.runEngineCall({
      method: this.deleteCollection.name,
      run: async () => {
        await this.client.collections(name).delete();
        logger.info('Deleted collection | name: %s', name);
        return true;
      },
      tolerate: this.notFoundFallback({
        method: this.deleteCollection.name,
        message: 'Collection not found, treating as already deleted | name: %s',
        args: [name],
        fallback: false,
      }),
    });
    return rs;
  }

  async upsertAlias(opts: { name: string; collection: string }): Promise<void> {
    const { name, collection } = opts;
    this.assertNonEmpty({ value: name, name: 'alias', method: this.upsertAlias.name });
    this.assertNonEmpty({ value: collection, name: 'collection', method: this.upsertAlias.name });
    const logger = this.logger.for(this.upsertAlias.name);

    await this.runEngineCall<void>({
      method: this.upsertAlias.name,
      run: async () => {
        const mapping: Record<string, unknown> = {};
        mapping['collection_name'] = collection;
        await this.client.aliases().upsert(name, mapping);
        logger.info('Upserted alias | %s -> %s', name, collection);
      },
    });
  }

  async getAlias(opts: { name: string }): Promise<IAliasInfo | null> {
    const { name } = opts;
    this.assertNonEmpty({ value: name, name: 'alias', method: this.getAlias.name });

    const rs = await this.runEngineCall<IAliasInfo | null>({
      method: this.getAlias.name,
      run: async () => {
        const alias = await this.client.aliases(name).retrieve();
        const aliasName = readStringField({ value: alias, key: 'name' });
        const collectionName = readStringField({ value: alias, key: 'collection_name' });

        if (aliasName === undefined || collectionName === undefined) {
          SearchConnectorInternal.throwNotFoundError({
            method: this.getAlias.name,
            subject: `Alias '${name}'`,
          });
        }

        return { name: aliasName, collection: collectionName };
      },
      tolerate: this.notFoundFallback({
        method: this.getAlias.name,
        message: 'Alias not found | name: %s',
        args: [name],
        fallback: null,
      }),
    });
    return rs;
  }

  async upsertSynonymSet(opts: { name: string; items: ISynonym[] }): Promise<void> {
    const { name, items } = opts;
    this.assertNonEmpty({
      value: name,
      name: 'synonym set name',
      method: this.upsertSynonymSet.name,
    });
    const logger = this.logger.for(this.upsertSynonymSet.name);

    await this.runEngineCall({
      method: this.upsertSynonymSet.name,
      run: async () => {
        const payload = items.map(item =>
          item.root
            ? { id: item.id, synonyms: item.synonyms, root: item.root }
            : { id: item.id, synonyms: item.synonyms },
        );
        await this.client.synonymSets(name).upsert({ items: payload });
        logger.info('Upserted synonym set | name: %s | items: %s', name, items.length);
      },
    });
  }

  async getSynonymSet(opts: { name: string }): Promise<ISynonym[] | null> {
    const { name } = opts;
    this.assertNonEmpty({ value: name, name: 'synonym set name', method: this.getSynonymSet.name });

    const rs = await this.runEngineCall<ISynonym[] | null>({
      method: this.getSynonymSet.name,
      run: async () => {
        const result = await this.client.synonymSets(name).retrieve();
        const items = isRecord(result) && Array.isArray(result.items) ? result.items : [];
        return items.filter(isSynonymResponse).map(toSynonym);
      },
      tolerate: this.notFoundFallback({
        method: this.getSynonymSet.name,
        message: 'Synonym set not found | name: %s',
        args: [name],
        fallback: null,
      }),
    });
    return rs;
  }

  async listSynonymSets(): Promise<string[]> {
    const rs = await this.runEngineCall({
      method: this.listSynonymSets.name,
      run: async () => {
        const result = await this.client.synonymSets().retrieve();
        const sets = Array.isArray(result) ? result : [];
        return sets
          .filter(isRecord)
          .map(set => set.name)
          .filter((setName): setName is string => typeof setName === 'string');
      },
    });
    return rs;
  }

  async deleteSynonymSet(opts: { name: string }): Promise<boolean> {
    const { name } = opts;
    this.assertNonEmpty({
      value: name,
      name: 'synonym set name',
      method: this.deleteSynonymSet.name,
    });
    const logger = this.logger.for(this.deleteSynonymSet.name);

    const rs = await this.runEngineCall({
      method: this.deleteSynonymSet.name,
      run: async () => {
        await this.client.synonymSets(name).delete();
        logger.info('Deleted synonym set | name: %s', name);
        return true;
      },
      tolerate: this.notFoundFallback({
        method: this.deleteSynonymSet.name,
        message: 'Synonym set not found, treating as already deleted | name: %s',
        args: [name],
        fallback: false,
      }),
    });
    return rs;
  }

  async linkSynonymSets(opts: { collection: string; synonymSets: string[] }): Promise<void> {
    const { collection, synonymSets } = opts;
    this.assertNonEmpty({
      value: collection,
      name: 'collection',
      method: this.linkSynonymSets.name,
    });
    const logger = this.logger.for(this.linkSynonymSets.name);

    await this.runEngineCall({
      method: this.linkSynonymSets.name,
      run: async () => {
        await this.client.collections(collection).update({ ['synonym_sets']: synonymSets });
        logger.info('Linked synonym set(s) | collection: %s | sets: %j', collection, synonymSets);
      },
    });
  }

  async createDocument<T extends object>(opts: { collection: string; document: T }): Promise<T> {
    const { collection, document } = opts;
    this.assertNonEmpty({
      value: collection,
      name: 'collection',
      method: this.createDocument.name,
    });

    const rs = await this.runEngineCall({
      method: this.createDocument.name,
      run: async () => {
        const created = (await this.client
          .collections(collection)
          .documents()
          .create(document)) as T;
        return created;
      },
    });
    return rs;
  }

  async getDocument<T extends object>(opts: { collection: string; id: string }): Promise<T> {
    const { collection, id } = opts;
    this.assertNonEmpty({ value: collection, name: 'collection', method: this.getDocument.name });
    this.assertNonEmpty({ value: id, name: 'document id', method: this.getDocument.name });

    const rs = await this.runEngineCall({
      method: this.getDocument.name,
      run: async () => {
        const document = (await this.client.collections(collection).documents(id).retrieve()) as T;
        return document;
      },
      tolerate: this.notFoundTolerance({
        method: this.getDocument.name,
        subject: `Document '${id}' in collection '${collection}'`,
      }),
    });
    return rs;
  }

  async upsertDocument<T extends object>(opts: { collection: string; document: T }): Promise<T> {
    const { collection, document } = opts;
    this.assertNonEmpty({
      value: collection,
      name: 'collection',
      method: this.upsertDocument.name,
    });

    const rs = await this.runEngineCall({
      method: this.upsertDocument.name,
      run: async () => {
        const upserted = (await this.client
          .collections(collection)
          .documents()
          .upsert(document)) as T;
        return upserted;
      },
    });
    return rs;
  }

  async updateDocument<T extends object>(opts: {
    collection: string;
    id: string;
    document: Partial<T>;
  }): Promise<T> {
    const { collection, id, document } = opts;
    this.assertNonEmpty({
      value: collection,
      name: 'collection',
      method: this.updateDocument.name,
    });
    this.assertNonEmpty({ value: id, name: 'document id', method: this.updateDocument.name });

    const rs = await this.runEngineCall({
      method: this.updateDocument.name,
      run: async () => {
        const updated = (await this.client
          .collections(collection)
          .documents(id)
          .update(document)) as T;
        return updated;
      },
      tolerate: this.notFoundTolerance({
        method: this.updateDocument.name,
        subject: `Document '${id}' in collection '${collection}'`,
      }),
    });
    return rs;
  }

  async deleteDocument(opts: { collection: string; id: string }): Promise<boolean> {
    const { collection, id } = opts;
    this.assertNonEmpty({
      value: collection,
      name: 'collection',
      method: this.deleteDocument.name,
    });
    this.assertNonEmpty({ value: id, name: 'document id', method: this.deleteDocument.name });

    const rs = await this.runEngineCall({
      method: this.deleteDocument.name,
      run: async () => {
        await this.client.collections(collection).documents(id).delete();
        return true;
      },
      tolerate: this.notFoundFallback({
        method: this.deleteDocument.name,
        message: 'Document not found, returning false | collection: %s | id: %s',
        args: [collection, id],
        fallback: false,
      }),
    });
    return rs;
  }

  async importDocuments<T extends object>(opts: {
    collection: string;
    documents: T[];
    action?: TTypesenseImportAction;
    batchSize?: number;
    dirtyValues?: TTypesenseDirtyValue;
  }): Promise<IImportResult<TImportResponse>> {
    const { collection, documents, dirtyValues } = opts;
    this.assertNonEmpty({
      value: collection,
      name: 'collection',
      method: this.importDocuments.name,
    });

    // typesense's own default action is 'create'; keep runtime validation for untyped callers.
    const action = opts.action ?? TypesenseImportActions.CREATE;
    if (!TypesenseImportActions.isValid(action)) {
      throw getError({
        message: `[importDocuments] Invalid action | action: ${action} | valids: ${[...TypesenseImportActions.SCHEME_SET]}`,
      });
    }

    if (dirtyValues && !TypesenseDirtyValues.isValid(dirtyValues)) {
      throw getError({
        message: `[importDocuments] Invalid dirtyValues | value: ${dirtyValues} | valids: ${[...TypesenseDirtyValues.SCHEME_SET]}`,
      });
    }

    const logger = this.logger.for(this.importDocuments.name);
    const batchSize = opts.batchSize && opts.batchSize > 0 ? opts.batchSize : 100;
    const responses: TImportResponse[] = [];
    let successCount = 0;
    let failCount = 0;

    try {
      for (let start = 0; start < documents.length; start += batchSize) {
        const batch = documents.slice(start, start + batchSize);

        // opt out of typesense's default throwOnFail:true so import() returns per-row responses to aggregate below.
        const importParams: Record<string, unknown> = { action, throwOnFail: false };
        if (dirtyValues) {
          importParams['dirty_values'] = dirtyValues;
        }

        const batchResult = (await this.client
          .collections(collection)
          .documents()
          .import(batch, importParams)) as TImportResponse[];

        for (const row of batchResult) {
          responses.push(row);

          if (row.success) {
            successCount += 1;
          } else {
            failCount += 1;
          }
        }
      }
    } catch (error) {
      // Batches before the failure are already persisted server-side; attach partial progress so callers can decide to resume or retry.
      SearchConnectorInternal.wrapDependencyError({
        method: this.importDocuments.name,
        error,
        logger: this.logger,
        details: {
          totalCount: documents.length,
          processedCount: successCount + failCount,
          successCount,
          failCount,
        },
      });
    }

    logger.info(
      'Imported documents | collection: %s | ok: %d | fail: %d',
      collection,
      successCount,
      failCount,
    );
    return { count: { success: successCount, fail: failCount }, responses };
  }

  async updateByFilter<T extends object>(opts: {
    collection: string;
    document: Partial<T>;
    filterBy: string;
  }): Promise<{ updatedCount: number }> {
    const { collection, document, filterBy } = opts;
    this.assertNonEmpty({
      value: collection,
      name: 'collection',
      method: this.updateByFilter.name,
    });
    this.assertNonEmpty({ value: filterBy, name: 'filterBy', method: this.updateByFilter.name });

    const rs = await this.runEngineCall({
      method: this.updateByFilter.name,
      run: async () => {
        const updateOptions: Record<string, unknown> = {};
        updateOptions['filter_by'] = filterBy;

        const result = await this.client
          .collections(collection)
          .documents()
          .update(document, updateOptions);

        return { updatedCount: readNumberField({ value: result, key: 'num_updated' }) };
      },
    });
    return rs;
  }

  async deleteByFilter(opts: {
    collection: string;
    filterBy: string;
    batchSize?: number;
    ignoreNotFound?: boolean;
  }): Promise<number> {
    const { collection, filterBy, batchSize, ignoreNotFound } = opts;
    this.assertNonEmpty({
      value: collection,
      name: 'collection',
      method: this.deleteByFilter.name,
    });
    this.assertNonEmpty({ value: filterBy, name: 'filterBy', method: this.deleteByFilter.name });

    const rs = await this.runEngineCall({
      method: this.deleteByFilter.name,
      run: async () => {
        const deleteParams: Record<string, unknown> = {};
        deleteParams['filter_by'] = filterBy;

        if (batchSize && batchSize > 0) {
          deleteParams['batch_size'] = batchSize;
        }

        if (ignoreNotFound !== undefined) {
          deleteParams['ignore_not_found'] = ignoreNotFound;
        }

        const result = await this.client.collections(collection).documents().delete(deleteParams);
        return readNumberField({ value: result, key: 'num_deleted' });
      },
    });
    return rs;
  }

  async deleteAllDocuments(opts: { collection: string }): Promise<boolean> {
    const { collection } = opts;
    this.assertNonEmpty({
      value: collection,
      name: 'collection',
      method: this.deleteAllDocuments.name,
    });
    const logger = this.logger.for(this.deleteAllDocuments.name);

    const rs = await this.runEngineCall({
      method: this.deleteAllDocuments.name,
      run: async () => {
        // truncate:true is typesense's purpose-built full wipe; a hand-rolled filter_by can't reliably match everything and scans O(n).
        const result = await this.client
          .collections(collection)
          .documents()
          .delete({ truncate: true });

        logger.info(
          'Truncated collection | name: %s | deleted: %d',
          collection,
          readNumberField({ value: result, key: 'num_deleted' }),
        );
        return true;
      },
    });
    return rs;
  }

  async exportDocuments(opts: {
    collection: string;
    filterBy?: string;
    includeFields?: string[];
  }): Promise<string> {
    const { collection, filterBy, includeFields } = opts;
    this.assertNonEmpty({
      value: collection,
      name: 'collection',
      method: this.exportDocuments.name,
    });

    const rs = await this.runEngineCall({
      method: this.exportDocuments.name,
      run: async () => {
        const exportParams: Record<string, unknown> = {};

        if (filterBy) {
          exportParams['filter_by'] = filterBy;
        }

        if (includeFields && includeFields.length > 0) {
          exportParams['include_fields'] = includeFields.join(',');
        }

        const exported = (await this.client
          .collections(collection)
          .documents()
          .export(exportParams)) as string;
        return exported;
      },
    });
    return rs;
  }

  async search<T extends TDocumentSchema = TDocumentSchema>(opts: {
    collection: string;
    params: TSearchParams;
    options?: TSearchOptions;
  }): Promise<ISearchResult<T>> {
    const { collection, params, options } = opts;
    this.assertNonEmpty({ value: collection, name: 'collection', method: this.search.name });
    const logger = this.logger.for(this.search.name);

    const rs = await this.runEngineCall({
      method: this.search.name,
      run: async () => {
        const result = (await this.client
          .collections(collection)
          .documents()
          .search(params, options)) as TSearchResponse<T>;
        return result;
      },
      tolerate: {
        when: error => TypesenseInternal.isNotFoundError({ error }),
        handle: () => {
          logger.warn('Search on missing collection, returning empty | name: %s', collection);

          // Missing collection -> empty result (not a 500); shape fully so consumers don't see undefined fields.
          return buildEmptySearchResponse() as TSearchResponse<T>;
        },
      },
    });
    return mapSearchResult<T>(rs);
  }

  // `union: true` merges every `searches` entry into ONE result set (IUnionSearchResult); the
  // default federates them side-by-side into `results[]` (IMultiSearchResult) - overloaded so
  // callers get the right shape back at compile time instead of a runtime-checked union.
  // Wire boundary: `searches`/`commonParams` are the engine's NATIVE snake_case params (the datasource
  // maps camelCase -> here). Typed as TSearchParams (not a loose record) so the raw getConnector()
  // escape hatch still gets full LSP on the snake_case wire fields.
  async multiSearch<T extends TDocumentSchema = TDocumentSchema>(opts: {
    searches: Array<{ collection: string } & Partial<TSearchParams>>;
    union: true;
    commonParams?: Partial<TSearchParams>;
    options?: TSearchOptions;
  }): Promise<IUnionSearchResult<T>>;
  async multiSearch<T extends TDocumentSchema = TDocumentSchema>(opts: {
    searches: Array<{ collection: string } & Partial<TSearchParams>>;
    union?: false;
    commonParams?: Partial<TSearchParams>;
    options?: TSearchOptions;
  }): Promise<IMultiSearchResult<T>>;
  async multiSearch<T extends TDocumentSchema = TDocumentSchema>(opts: {
    searches: Array<{ collection: string } & Partial<TSearchParams>>;
    union?: boolean;
    commonParams?: Partial<TSearchParams>;
    options?: TSearchOptions;
  }): Promise<IMultiSearchResult<T> | IUnionSearchResult<T>> {
    const { searches, union: isUnion, commonParams, options } = opts;

    const rs = await this.runEngineCall({
      method: this.multiSearch.name,
      run: async () => {
        const result = await this.client.multiSearch.perform(
          isUnion ? { union: true, searches } : { searches },
          commonParams ?? {},
          options,
        );
        return result as IMultiSearchResult<T> | IUnionSearchResult<T>;
      },
    });
    return rs;
  }
}
