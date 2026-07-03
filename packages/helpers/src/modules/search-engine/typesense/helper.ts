import { getError } from '@/modules/error';
import { Client } from 'typesense';
import { BaseSearchEngineHelper } from '../base';
import { SearchEngineInternal } from '../internal';
import { IAliasInfo, IImportResult } from '../types';
import { TypesenseInternal } from './internal/typesense-internal.helper';
import {
  IMultiSearchEntry,
  IMultiSearchResult,
  ITypesenseHelperOptions,
  ITypesenseTypeMap,
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

// Narrow structural view of the Typesense client surface this helper depends on. It mirrors the
// EXACT chained calls the verb implementations make: method names + arity are type-checked, while
// payloads/results are `unknown` and narrowed with a cast at the boundary (this helper is a
// passthrough). typesense splits documents() (collection-level) from documents(id) (single-doc)
// into different types, so we model that overload faithfully. Both the real `new Client(...)` and
// the in-test fake-client fixture structurally satisfy this shape (verified against
// typesense@3.0.6), so neither needs an `as any`.
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

export class TypesenseHelper extends BaseSearchEngineHelper<ITypesenseTypeMap> {
  private readonly client: ITypesenseClientLike;

  constructor(opts: ITypesenseHelperOptions & { client?: ITypesenseClientLike }) {
    super({
      scope: opts.scope ?? TypesenseHelper.name,
      identifier: opts.identifier ?? opts.name,
    });

    try {
      this.client =
        opts.client ??
        new Client({
          apiKey: opts.apiKey,
          // typesense's NodeConfiguration.protocol is required; ITypesenseNode.protocol is optional.
          // Default to 'http' (matches the BANA reference). Cloud users pass 'https'.
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
          SearchEngineInternal.describeError({ error }),
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
      return { ok: Boolean((health as { ok?: boolean }).ok) };
    } catch (error) {
      this.logger
        .for(this.getHealth.name)
        .warn('Health probe failed | error: %j', SearchEngineInternal.describeError({ error }));
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

    await this.createCollection({ schema });
    return this.getCollection({ name: schema.name });
  }

  async getCollection(opts: { name: string }): Promise<TCollectionSchema> {
    const { name } = opts;
    this.assertNonEmpty({ value: name, name: 'collection' });
    const logger = this.logger.for(this.getCollection.name);

    const rs = await this.runEngineCall({
      method: this.getCollection.name,
      run: async () => {
        const collection = (await this.client.collections(name).retrieve()) as TCollectionSchema;
        return collection;
      },
      tolerate: {
        when: error => TypesenseInternal.isNotFoundError({ error }),
        handle: () => {
          logger.debug('Collection not found | name: %s', name);
          SearchEngineInternal.throwNotFoundError({
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
          SearchEngineInternal.describeError({ error }),
        );
      return false;
    }
  }

  async patchCollectionSchema(opts: {
    name: string;
    fields: TCollectionFieldSchema[];
  }): Promise<void> {
    const { name, fields } = opts;
    this.assertNonEmpty({ value: name, name: 'collection' });
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
          SearchEngineInternal.throwNotFoundError({
            method: this.patchCollectionSchema.name,
            subject: `Collection '${name}'`,
          });
        },
      },
    });
  }

  async deleteCollection(opts: { name: string }): Promise<boolean> {
    const { name } = opts;
    this.assertNonEmpty({ value: name, name: 'collection' });
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
    this.assertNonEmpty({ value: name, name: 'alias' });
    this.assertNonEmpty({ value: collection, name: 'collection' });
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
    this.assertNonEmpty({ value: name, name: 'alias' });
    const logger = this.logger.for(this.getAlias.name);

    const rs = await this.runEngineCall<IAliasInfo | null>({
      method: this.getAlias.name,
      run: async () => {
        const alias = await this.client.aliases(name).retrieve();
        // eslint-disable-next-line @typescript-eslint/naming-convention
        const mapped = alias as { name: string; collection_name: string };
        return { name: mapped.name, collection: mapped.collection_name };
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
    this.assertNonEmpty({ value: collection, name: 'collection' });

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
    this.assertNonEmpty({ value: collection, name: 'collection' });
    this.assertNonEmpty({ value: id, name: 'document id' });
    const logger = this.logger.for(this.getDocument.name);

    const rs = await this.runEngineCall({
      method: this.getDocument.name,
      run: async () => {
        const document = (await this.client.collections(collection).documents(id).retrieve()) as T;
        return document;
      },
      tolerate: {
        when: error => TypesenseInternal.isNotFoundError({ error }),
        handle: () => {
          logger.debug('Document not found | collection: %s | id: %s', collection, id);
          SearchEngineInternal.throwNotFoundError({
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
    this.assertNonEmpty({ value: collection, name: 'collection' });

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
    this.assertNonEmpty({ value: collection, name: 'collection' });
    this.assertNonEmpty({ value: id, name: 'document id' });
    const logger = this.logger.for(this.updateDocument.name);

    const rs = await this.runEngineCall({
      method: this.updateDocument.name,
      run: async () => {
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
          SearchEngineInternal.throwNotFoundError({
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
    this.assertNonEmpty({ value: collection, name: 'collection' });
    this.assertNonEmpty({ value: id, name: 'document id' });
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
    this.assertNonEmpty({ value: collection, name: 'collection' });

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

        // Real typesense Documents.import defaults throwOnFail:true (throws ImportError on any failed
        // row). We opt out so import() RETURNS the per-row ImportResponse[] we aggregate below.
        const importParams: {
          action: TTypesenseImportAction;
          // eslint-disable-next-line @typescript-eslint/naming-convention
          dirty_values?: TTypesenseDirtyValue;
          throwOnFail: false;
        } = { action, throwOnFail: false };
        if (dirtyValues) {
          importParams.dirty_values = dirtyValues;
        }

        const batchResult = (await this.client
          .collections(collection)
          .documents()
          .import(batch, importParams)) as TImportResponse[];

        for (const row of batchResult) {
          responses.push(row);

          if ((row as { success?: boolean }).success) {
            successCount += 1;
          } else {
            failCount += 1;
          }
        }
      }
    } catch (error) {
      // Batches before the failure ARE persisted server-side — expose the partial progress on the
      // thrown error so callers can make resume/retry decisions instead of blindly re-importing.
      SearchEngineInternal.wrapDependencyError({
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
    this.assertNonEmpty({ value: collection, name: 'collection' });
    this.assertNonEmpty({ value: filterBy, name: 'filterBy' });

    const rs = await this.runEngineCall({
      method: this.updateByFilter.name,
      run: async () => {
        const result = await this.client
          .collections(collection)
          .documents()
          // eslint-disable-next-line @typescript-eslint/naming-convention
          .update(document, { filter_by: filterBy });

        // eslint-disable-next-line @typescript-eslint/naming-convention
        return { updatedCount: (result as { num_updated?: number }).num_updated ?? 0 };
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
    this.assertNonEmpty({ value: collection, name: 'collection' });
    this.assertNonEmpty({ value: filterBy, name: 'filterBy' });

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
        // eslint-disable-next-line @typescript-eslint/naming-convention
        return (result as { num_deleted?: number }).num_deleted ?? 0;
      },
    });
    return rs;
  }

  async deleteAllDocuments(opts: { collection: string }): Promise<boolean> {
    const { collection } = opts;
    this.assertNonEmpty({ value: collection, name: 'collection' });
    const logger = this.logger.for(this.deleteAllDocuments.name);

    const rs = await this.runEngineCall({
      method: this.deleteAllDocuments.name,
      run: async () => {
        // typesense's DeleteQuery has a dedicated `truncate` branch — the purpose-built full wipe.
        // A hand-rolled filter_by cannot reliably express "match everything" (and scans O(n)).
        const result = await this.client
          .collections(collection)
          .documents()
          .delete({ truncate: true });

        logger.info(
          'Truncated collection | name: %s | deleted: %d',
          collection,
          // eslint-disable-next-line @typescript-eslint/naming-convention
          (result as { num_deleted?: number }).num_deleted ?? 0,
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
    this.assertNonEmpty({ value: collection, name: 'collection' });

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
    this.assertNonEmpty({ value: collection, name: 'collection' });
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

          // Missing collection → empty result (not a 500). Shape it fully so consumers reading
          // out_of/page/search_time_ms don't get undefined.

          /* eslint-disable @typescript-eslint/naming-convention */
          return {
            found: 0,
            out_of: 0,
            page: 1,
            search_time_ms: 0,
            request_params: {},
            hits: [],
          } as TSearchResponse<T>;
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
        // Passthrough: typesense's perform() is an overloaded conditional generic. Cast at this
        // single boundary rather than leaking that machinery through the helper's public API.
        const result = await this.client.multiSearch.perform(
          { searches } as never,
          (commonParams ?? {}) as never,
          options,
        );
        return result as unknown as IMultiSearchResult<T>;
      },
    });
    return rs;
  }
}
