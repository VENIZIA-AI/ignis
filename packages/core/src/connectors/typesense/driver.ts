import { BaseHelper, getError, ValueOrPromise } from '@venizia/ignis-helpers';
import { Client } from 'typesense';
import { TypesenseInternal } from './internal/driver-internal';
import { SearchDriverInternal } from './internal/search-driver-internal';
import {
  IMultiSearchEntry,
  IMultiSearchResult,
  ITypesenseDriverOptions,
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
  TypesenseDirtyValues,
  TypesenseImportActions,
} from './types';

// Driver-contract types live here (sole consumer) instead of a common/ folder. LIFT RULE: move
// to src/base/datasources if a second search connector appears.

export interface IImportResult<TResponse = unknown> {
  successCount: number;
  failCount: number;
  responses: TResponse[];
}

export interface IAliasInfo {
  name: string;
  collection: string;
}

export interface ISearchDriverCallbacks {
  onInitialized?: (opts: { name: string }) => void;
  onError?: (opts: { name: string; error: unknown }) => void;
}

/** Search-response envelope - the read-path counterpart to IImportResult, consumed by ReadableSearchRepository without a boundary cast. */
export interface ISearchResult<TDocument extends object = object> {
  found: number;
  hits?: Array<{ document: TDocument }>;
}

/**
 * Verb contract every search-engine driver implements (`unknown` payload/result types).
 * Kept as an interface so tests can fake a driver without a real `typesense` `Client`.
 */
export interface ISearchDriver {
  getHealth(): Promise<{ ok: boolean }>;
  ping(): Promise<boolean>;

  createCollection(opts: { schema: unknown }): Promise<unknown>;
  ensureCollection(opts: { schema: unknown }): Promise<unknown>;
  getCollection(opts: { name: string }): Promise<unknown>;
  listCollections(): Promise<unknown[]>;
  collectionExists(opts: { name: string }): Promise<boolean>;
  patchCollectionSchema(opts: { name: string; fields: unknown[] }): Promise<void>;
  deleteCollection(opts: { name: string }): Promise<boolean>;

  upsertAlias(opts: { name: string; collection: string }): Promise<void>;
  getAlias(opts: { name: string }): Promise<IAliasInfo | null>;

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
  }): Promise<IImportResult<unknown>>;
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

  // Raw passthrough; TDocument lets typed callers get ISearchResult<TDocument> without a cast.
  // Backends may widen further as long as it stays assignable to ISearchResult.
  search<TDocument extends object = object>(opts: {
    collection: string;
    params: unknown;
  }): Promise<ISearchResult<TDocument>>;
  multiSearch(opts: { searches: unknown[]; commonParams?: unknown }): Promise<unknown>;
}

/** Shared base every concrete search driver (e.g. TypesenseDriver) extends. */
export abstract class BaseSearchDriver extends BaseHelper implements ISearchDriver {
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

  // Runs the engine verb; routes tolerated errors (benign 404/409) to the caller-provided branch,
  // wraps everything else as a sanitized 503. `tolerate.handle` may return a fallback or throw.
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

      SearchDriverInternal.wrapDependencyError({ method, error, logger: this.logger });
    }
  }

  abstract getHealth(): Promise<{ ok: boolean }>;

  abstract createCollection(opts: { schema: unknown }): Promise<unknown | void>;
  abstract ensureCollection(opts: { schema: unknown }): Promise<unknown>;
  abstract getCollection(opts: { name: string }): Promise<unknown>;
  abstract listCollections(): Promise<unknown[]>;
  abstract collectionExists(opts: { name: string }): Promise<boolean>;
  abstract patchCollectionSchema(opts: { name: string; fields: unknown[] }): Promise<void>;
  abstract deleteCollection(opts: { name: string }): Promise<boolean>;

  abstract upsertAlias(opts: { name: string; collection: string }): Promise<void>;
  abstract getAlias(opts: { name: string }): Promise<IAliasInfo | null>;

  abstract createDocument<T extends object>(opts: { collection: string; document: T }): Promise<T>;
  abstract getDocument<T extends object>(opts: { collection: string; id: string }): Promise<T>;
  abstract upsertDocument<T extends object>(opts: { collection: string; document: T }): Promise<T>;
  abstract updateDocument<T extends object>(opts: {
    collection: string;
    id: string;
    document: Partial<T>;
  }): Promise<T>;
  abstract deleteDocument(opts: { collection: string; id: string }): Promise<boolean>;
  // Engine-specific import tuning (e.g. typesense's action/dirtyValues) lives on each backend's widened override.
  abstract importDocuments<T extends object>(opts: {
    collection: string;
    documents: T[];
    batchSize?: number;
  }): Promise<IImportResult<unknown>>;
  abstract updateByFilter<T extends object>(opts: {
    collection: string;
    document: Partial<T>;
    filterBy: string;
  }): Promise<{ updatedCount: number }>;
  abstract deleteByFilter(opts: { collection: string; filterBy: string }): Promise<number>;
  abstract deleteAllDocuments(opts: { collection: string }): Promise<boolean>;
  abstract exportDocuments(opts: {
    collection: string;
    filterBy?: string;
    includeFields?: string[];
  }): Promise<string>;

  abstract search<TDocument extends object = object>(opts: {
    collection: string;
    params: unknown;
  }): Promise<ISearchResult<TDocument>>;
  abstract multiSearch(opts: { searches: unknown[]; commonParams?: unknown }): Promise<unknown>;
}

// Narrow runtime readers for the `unknown` payloads ITypesenseClientLike hands back - each is the
// single narrowest cast for its field, isolated here instead of repeated ad hoc at every call site.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readBooleanFlag(opts: { value: unknown; key: string }): boolean {
  const { value, key } = opts;
  return isRecord(value) ? Boolean(value[key]) : false;
}

function readNumberField(opts: { value: unknown; key: string }): number {
  const { value, key } = opts;
  if (!isRecord(value) || typeof value[key] !== 'number') {
    return 0;
  }
  return value[key];
}

// eslint-disable-next-line @typescript-eslint/naming-convention
function isAliasResponse(value: unknown): value is { name: string; collection_name: string } {
  return (
    isRecord(value) && typeof value.name === 'string' && typeof value.collection_name === 'string'
  );
}

// Narrow structural view of the client surface this driver needs; payloads/results are `unknown`
// and cast at the boundary. Both the real Client and the in-test fake satisfy this shape without `as any`.
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
  health: { retrieve(): Promise<unknown> };
  multiSearch: {
    perform(searchRequests: unknown, commonParams?: unknown, options?: unknown): Promise<unknown>;
  };
}

/** Typesense engine driver - built/injected by TypesenseDataSource, which exposes the raw client via getClient(). */
export class TypesenseDriver extends BaseSearchDriver {
  private readonly client: ITypesenseClientLike;

  constructor(opts: ITypesenseDriverOptions & { client?: ITypesenseClientLike }) {
    super({
      scope: opts.scope ?? TypesenseDriver.name,
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
          SearchDriverInternal.describeError({ error }),
        );
      opts.onError?.({ name: opts.name, error });
      throw error;
    }
  }

  // -------------------------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------------------------
  getClient(): ITypesenseClientLike {
    return this.client;
  }

  async getHealth(): Promise<{ ok: boolean }> {
    try {
      const health = await this.client.health.retrieve();
      return { ok: readBooleanFlag({ value: health, key: 'ok' }) };
    } catch (error) {
      this.logger
        .for(this.getHealth.name)
        .warn('Health probe failed | error: %j', SearchDriverInternal.describeError({ error }));
      return { ok: false };
    }
  }

  // -------------------------------------------------------------------------------------------
  // Collections
  // -------------------------------------------------------------------------------------------
  async createCollection(opts: {
    schema: TCollectionCreateSchema;
  }): Promise<TCollectionSchema | void> {
    const { schema } = opts;
    const logger = this.logger.for(this.createCollection.name);

    const rs = await this.runEngineCall<TCollectionSchema | void>({
      method: this.createCollection.name,
      run: async () => {
        // ITypesenseCollectionsApi.create() is `unknown` by contract (see interface above); the engine echoes back the created schema.
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
    const logger = this.logger.for(this.getCollection.name);

    const rs = await this.runEngineCall({
      method: this.getCollection.name,
      run: async () => {
        // Client-facade retrieve() is `unknown` by contract; engine guarantees a collection schema shape.
        const collection = (await this.client.collections(name).retrieve()) as TCollectionSchema;
        return collection;
      },
      tolerate: {
        when: error => TypesenseInternal.isNotFoundError({ error }),
        handle: () => {
          logger.debug('Collection not found | name: %s', name);
          SearchDriverInternal.throwNotFoundError({
            method: this.getCollection.name,
            subject: `Collection '${name}'`,
          });
        },
      },
    });
    return rs;
  }

  async listCollections(): Promise<TCollectionSchema[]> {
    const rs = await this.runEngineCall({
      method: this.listCollections.name,
      run: async () => {
        // Client-facade retrieve() is `unknown` by contract; engine guarantees an array of collection schemas.
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
          SearchDriverInternal.describeError({ error }),
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
      tolerate: {
        when: error => TypesenseInternal.isNotFoundError({ error }),
        handle: () => {
          logger.debug('Collection not found | name: %s', name);
          SearchDriverInternal.throwNotFoundError({
            method: this.patchCollectionSchema.name,
            subject: `Collection '${name}'`,
          });
        },
      },
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
      tolerate: {
        when: error => TypesenseInternal.isNotFoundError({ error }),
        handle: () => {
          logger.debug('Collection not found, treating as already deleted | name: %s', name);
          return false;
        },
      },
    });
    return rs;
  }

  // -------------------------------------------------------------------------------------------
  // Aliases (primitives only)
  // -------------------------------------------------------------------------------------------
  async upsertAlias(opts: { name: string; collection: string }): Promise<void> {
    const { name, collection } = opts;
    this.assertNonEmpty({ value: name, name: 'alias', method: this.upsertAlias.name });
    this.assertNonEmpty({ value: collection, name: 'collection', method: this.upsertAlias.name });
    const logger = this.logger.for(this.upsertAlias.name);

    await this.runEngineCall<void>({
      method: this.upsertAlias.name,
      run: async () => {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        await this.client.aliases().upsert(name, { collection_name: collection });
        logger.info('Upserted alias | %s -> %s', name, collection);
      },
    });
  }

  async getAlias(opts: { name: string }): Promise<IAliasInfo | null> {
    const { name } = opts;
    this.assertNonEmpty({ value: name, name: 'alias', method: this.getAlias.name });
    const logger = this.logger.for(this.getAlias.name);

    const rs = await this.runEngineCall<IAliasInfo | null>({
      method: this.getAlias.name,
      run: async () => {
        const alias = await this.client.aliases(name).retrieve();
        if (!isAliasResponse(alias)) {
          SearchDriverInternal.throwNotFoundError({
            method: this.getAlias.name,
            subject: `Alias '${name}'`,
          });
        }
        return { name: alias.name, collection: alias.collection_name };
      },
      tolerate: {
        when: error => TypesenseInternal.isNotFoundError({ error }),
        handle: () => {
          logger.debug('Alias not found | name: %s', name);
          return null;
        },
      },
    });
    return rs;
  }

  // -------------------------------------------------------------------------------------------
  // Documents
  // -------------------------------------------------------------------------------------------
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
        // Facade create() is `unknown` by contract; caller-supplied T can't be runtime-validated generically.
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
    const logger = this.logger.for(this.getDocument.name);

    const rs = await this.runEngineCall({
      method: this.getDocument.name,
      run: async () => {
        // Facade retrieve() is `unknown` by contract; caller-supplied T can't be runtime-validated generically.
        const document = (await this.client.collections(collection).documents(id).retrieve()) as T;
        return document;
      },
      tolerate: {
        when: error => TypesenseInternal.isNotFoundError({ error }),
        handle: () => {
          logger.debug('Document not found | collection: %s | id: %s', collection, id);
          SearchDriverInternal.throwNotFoundError({
            method: this.getDocument.name,
            subject: `Document '${id}' in collection '${collection}'`,
          });
        },
      },
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
        // Facade upsert() is `unknown` by contract; caller-supplied T can't be runtime-validated generically.
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
    const logger = this.logger.for(this.updateDocument.name);

    const rs = await this.runEngineCall({
      method: this.updateDocument.name,
      run: async () => {
        // Facade update() is `unknown` by contract; caller-supplied T can't be runtime-validated generically.
        const updated = (await this.client
          .collections(collection)
          .documents(id)
          .update(document)) as T;
        return updated;
      },
      tolerate: {
        when: error => TypesenseInternal.isNotFoundError({ error }),
        handle: () => {
          logger.debug('Document not found | collection: %s | id: %s', collection, id);
          SearchDriverInternal.throwNotFoundError({
            method: this.updateDocument.name,
            subject: `Document '${id}' in collection '${collection}'`,
          });
        },
      },
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
    const logger = this.logger.for(this.deleteDocument.name);

    const rs = await this.runEngineCall({
      method: this.deleteDocument.name,
      run: async () => {
        await this.client.collections(collection).documents(id).delete();
        return true;
      },
      tolerate: {
        when: error => TypesenseInternal.isNotFoundError({ error }),
        handle: () => {
          logger.debug(
            'Document not found, returning false | collection: %s | id: %s',
            collection,
            id,
          );
          return false;
        },
      },
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

        // typesense defaults to throwOnFail:true (throws on any failed row); opt out so import() returns per-row responses to aggregate below.
        const importParams: {
          action: TTypesenseImportAction;
          // eslint-disable-next-line @typescript-eslint/naming-convention
          dirty_values?: TTypesenseDirtyValue;
          throwOnFail: false;
        } = { action, throwOnFail: false };
        if (dirtyValues) {
          importParams.dirty_values = dirtyValues;
        }

        // Facade import() is `unknown` by contract; engine guarantees one ImportResponse row per submitted document.
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
      SearchDriverInternal.wrapDependencyError({
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
    return { successCount, failCount, responses };
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
        const result = await this.client
          .collections(collection)
          .documents()
          // eslint-disable-next-line @typescript-eslint/naming-convention
          .update(document, { filter_by: filterBy });

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
        /* eslint-disable @typescript-eslint/naming-convention */
        const deleteParams: {
          filter_by: string;
          batch_size?: number;
          ignore_not_found?: boolean;
        } = { filter_by: filterBy };
        /* eslint-enable @typescript-eslint/naming-convention */

        if (batchSize && batchSize > 0) {
          deleteParams.batch_size = batchSize;
        }

        if (ignoreNotFound !== undefined) {
          deleteParams.ignore_not_found = ignoreNotFound;
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
        // eslint-disable-next-line @typescript-eslint/naming-convention
        const exportParams: { filter_by?: string; include_fields?: string } = {};

        if (filterBy) {
          exportParams.filter_by = filterBy;
        }

        if (includeFields && includeFields.length > 0) {
          exportParams.include_fields = includeFields.join(',');
        }

        // Facade export() is `unknown` by contract; engine guarantees a JSONL string when no readable-stream option is passed.
        const exported = (await this.client
          .collections(collection)
          .documents()
          .export(exportParams)) as string;
        return exported;
      },
    });
    return rs;
  }

  // -------------------------------------------------------------------------------------------
  // Search (raw passthrough)
  // -------------------------------------------------------------------------------------------
  async search<T extends TDocumentSchema = TDocumentSchema>(opts: {
    collection: string;
    params: TSearchParams;
    options?: TSearchOptions;
  }): Promise<TSearchResponse<T>> {
    const { collection, params, options } = opts;
    this.assertNonEmpty({ value: collection, name: 'collection', method: this.search.name });
    const logger = this.logger.for(this.search.name);

    const rs = await this.runEngineCall({
      method: this.search.name,
      run: async () => {
        // Facade search() is `unknown` by contract; caller-supplied T can't be runtime-validated generically.
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
          /* eslint-disable @typescript-eslint/naming-convention */
          return {
            found: 0,
            out_of: 0,
            page: 1,
            search_time_ms: 0,
            request_params: {},
            hits: [],
          };
          /* eslint-enable @typescript-eslint/naming-convention */
        },
      },
    });
    return rs;
  }

  async multiSearch<T extends TDocumentSchema = TDocumentSchema>(opts: {
    searches: IMultiSearchEntry[];
    commonParams?: Partial<TSearchParams>;
    options?: TSearchOptions;
  }): Promise<IMultiSearchResult<T>> {
    const { searches, commonParams, options } = opts;

    const rs = await this.runEngineCall({
      method: this.multiSearch.name,
      run: async () => {
        const result = await this.client.multiSearch.perform(
          { searches },
          commonParams ?? {},
          options,
        );
        // Facade perform() is `unknown` by contract; caller-supplied T can't be runtime-validated generically.
        return result as IMultiSearchResult<T>;
      },
    });
    return rs;
  }
}
