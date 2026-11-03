import { SearchErrors } from '@/search/core/common';
import type {
  IAliasInfo,
  IImportResult,
  ISearchAliasScoped,
  ISearchCollectionScoped,
  ISearchDocumentScoped,
  ISearchResult,
  ISearchSynonymSetScoped,
} from '@/search/core';
import { BaseSearchConnector } from '@/search/core';
import { RecordUtility } from '@/common/internal';
import { SearchConnectorInternal } from '@/search/core/internal';
import type { ISynonym } from '@/search/core/models';
import { HTTP } from '@venizia/ignis-helpers/common';
import { getError, isApplicationError } from '@venizia/ignis-helpers/core';
import { Client } from 'typesense';
import {
  EntryOutcomes,
  isSynonymResponse,
  TypesenseInternal,
  TypesenseMapper,
  TypesensePayloadReader,
} from './internal';
import {
  MAX_HITS_PER_PAGE,
  MAX_MULTI_SEARCH_ENTRIES,
  TypesenseSearchWindows,
  type ISearchWindow,
} from './internal/pagination-windows';
import type {
  IMultiSearchResult,
  ITypesenseClientLike,
  ITypesenseConnectorOptions,
  ITypesenseCallOptions,
  IUnionSearchResult,
  TCollectionCreateSchema,
  TCollectionFieldSchema,
  TCollectionSchema,
  TDocumentSchema,
  TImportResponse,
  TSearchOptions,
  TSearchParams,
  TTypesenseDirtyValue,
  TTypesenseImportAction,
} from './common';
import { TypesenseDirtyValues, TypesenseImportActions } from './common';

// Re-exported for back-compat: callers and test fakes historically imported the client-shape type from this module rather than from `./common`, its new home.
export type { ITypesenseClientLike } from './common';

/** Typesense engine connector - built/injected by TypesenseDataSource, which exposes the raw client via getClient(). */
export class TypesenseConnector extends BaseSearchConnector {
  private readonly client: ITypesenseClientLike;
  private readonly createClient: (opts: {
    connectionTimeoutSeconds: number;
  }) => ITypesenseClientLike;
  /** An injected client is not built from `nodes` and `apiKey`, so a client for a call cannot be built from them either. */
  private readonly canBuildCallClient: boolean;

  constructor(opts: ITypesenseConnectorOptions & { client?: ITypesenseClientLike }) {
    super({
      scope: opts.scope ?? TypesenseConnector.name,
      identifier: opts.identifier ?? opts.name,
    });

    const build = (clientOpts: { connectionTimeoutSeconds: number }) =>
      new Client({
        apiKey: opts.apiKey,
        // NodeConfiguration.protocol is required upstream though ITypesenseNode.protocol is optional; default 'http', cloud users pass 'https'.
        nodes: opts.nodes.map((node) => ({ ...node, protocol: node.protocol ?? 'http' })),
        connectionTimeoutSeconds: clientOpts.connectionTimeoutSeconds,
        numRetries: opts.numRetries,
      });
    this.createClient = opts.createClient ?? build;
    this.canBuildCallClient = opts.client === undefined || opts.createClient !== undefined;

    try {
      this.client =
        opts.client ?? build({ connectionTimeoutSeconds: opts.connectionTimeoutSeconds ?? 5 });

      opts.onInitialized?.({ name: opts.name });
    } catch (error) {
      this.logger
        .for('constructor')
        .error(
          'Failed to initialize Typesense client | error: %s',
          SearchConnectorInternal.describeError({ error }),
        );

      opts.onError?.({ name: opts.name, error });
      throw error;
    }
  }

  getClient(): Client {
    return this.client as Client;
  }

  /**
   * The client one call runs on. Without `timeoutMs` it is the connector's own; with it, a client whose
   * `connectionTimeoutSeconds` is that many milliseconds, because `typesense-js` has no timeout per call. What it bounds
   * is the wait for the response (an import answers after the batch is processed) and then the longest silence on the
   * socket, not the whole transfer: a download that keeps arriving never trips it.
   */
  private clientFor(opts: ITypesenseCallOptions & { method: string }): ITypesenseClientLike {
    const { timeoutMs, method } = opts;

    if (timeoutMs === undefined) {
      return this.client;
    }

    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      throw getError({
        message: `[${method}] Invalid timeoutMs | Expected a positive integer of milliseconds | Got: ${String(timeoutMs)}`,
      });
    }

    if (!this.canBuildCallClient) {
      throw getError({
        message: `[${method}] timeoutMs needs createClient | This connector was given its own client, so it cannot build the client of a call from nodes and apiKey: pass createClient in the connector options`,
      });
    }

    return this.createClient({ connectionTimeoutSeconds: timeoutMs / 1000 });
  }

  protected isNotFoundError(opts: { error: unknown }): boolean {
    return TypesenseInternal.isNotFoundError(opts);
  }

  readonly collection: ISearchCollectionScoped<
    TCollectionCreateSchema,
    TCollectionSchema,
    TCollectionFieldSchema
  > = {
    create: (opts) => this.createCollection(opts),
    ensure: (opts) => this.ensureCollection(opts),
    get: (opts) => this.getCollection(opts),
    list: () => this.listCollections(),
    exists: (opts) => this.collectionExists(opts),
    patchSchema: (opts) => this.patchCollectionSchema(opts),
    delete: (opts) => this.deleteCollection(opts),
  };

  readonly alias: ISearchAliasScoped = {
    upsert: (opts) => this.upsertAlias(opts),
    get: (opts) => this.getAlias(opts),
  };

  readonly synonymSet: ISearchSynonymSetScoped = {
    upsert: (opts) => this.upsertSynonymSet(opts),
    get: (opts) => this.getSynonymSet(opts),
    list: () => this.listSynonymSets(),
    delete: (opts) => this.deleteSynonymSet(opts),
    link: (opts) => this.linkSynonymSets(opts),
  };

  readonly document: ISearchDocumentScoped & {
    find: <T extends object>(opts: { collection: string; id: string }) => Promise<T | null>;
  } = {
    find: <T extends object>(opts: { collection: string; id: string }) =>
      this.findDocument<T>(opts),
    create: <T extends object>(opts: { collection: string; document: T }) =>
      this.createDocument(opts),
    get: <T extends object>(opts: { collection: string; id: string }) => this.getDocument<T>(opts),
    count: (opts) => this.countDocuments(opts),
    upsert: <T extends object>(opts: { collection: string; document: T }) =>
      this.upsertDocument(opts),
    update: <T extends object>(opts: { collection: string; id: string; document: Partial<T> }) =>
      this.updateDocument(opts),
    delete: (opts) => this.deleteDocument(opts),
    import: <T extends object>(opts: { collection: string; documents: T[]; batchSize?: number }) =>
      this.importDocuments(opts),
    updateBy: <T extends object>(opts: {
      collection: string;
      document: Partial<T>;
      filterBy: string;
    }) => this.updateByFilter(opts),
    deleteBy: (opts) => this.deleteByFilter(opts),
    deleteAll: (opts) => this.deleteAllDocuments(opts),
    export: (opts) => this.exportDocuments(opts),
  };

  async getHealth(): Promise<{ ok: boolean }> {
    try {
      const health = await this.client.health.retrieve();
      return { ok: TypesensePayloadReader.readBooleanFlag({ value: health, key: 'ok' }) };
    } catch (error) {
      this.logger
        .for(this.getHealth.name)
        .warn('Health probe failed | error: %s', SearchConnectorInternal.describeError({ error }));
      return { ok: false };
    }
  }

  async createCollection(
    opts: { schema: TCollectionCreateSchema } & ITypesenseCallOptions,
  ): Promise<TCollectionSchema | void> {
    const { schema } = opts;
    const logger = this.logger.for(this.createCollection.name);
    const client = this.clientFor({ ...opts, method: this.createCollection.name });

    const rs = await this.runEngineCall<TCollectionSchema | void>({
      method: this.createCollection.name,
      run: async () => {
        const result = await client.collections().create(schema);
        const created = result as TCollectionSchema;
        logger.info('Created collection | name: %s', schema.name);
        return created;
      },
      tolerate: {
        when: (error) => TypesenseInternal.isAlreadyExistsError({ error }),
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

    // The create response IS the collection schema; reading it back instead is a read-after-write race on multi-node clusters (a follower may 404 before the raft log catches up), so only the tolerated already-exists path re-reads.
    const created = await this.createCollection({ schema });
    if (created) {
      return created;
    }

    return this.getCollection({ name: schema.name });
  }

  async getCollection(opts: { name: string } & ITypesenseCallOptions): Promise<TCollectionSchema> {
    const { name } = opts;
    this.assertNonEmpty({ value: name, name: 'collection', method: this.getCollection.name });
    const client = this.clientFor({ ...opts, method: this.getCollection.name });

    const rs = await this.runEngineCall({
      method: this.getCollection.name,
      run: async () => {
        const result = await client.collections(name).retrieve();
        const collection = result as TCollectionSchema;
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
        const result = await this.client.collections().retrieve();
        const collections = result as TCollectionSchema[];
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

    // exists() already resolves false for a genuine absence (it swallows its own not-found) and
    // only ever rejects on an infrastructure failure, so there is nothing to tolerate here -
    // ensureCollection reads false as "create it", so a failure must surface, not read as absence.
    const rs = await this.runEngineCall({
      method: this.collectionExists.name,
      run: () => this.client.collections(name).exists(),
    });
    return rs;
  }

  async patchCollectionSchema(
    opts: {
      name: string;
      fields: TCollectionFieldSchema[];
    } & ITypesenseCallOptions,
  ): Promise<void> {
    const { name, fields } = opts;
    this.assertNonEmpty({
      value: name,
      name: 'collection',
      method: this.patchCollectionSchema.name,
    });
    const logger = this.logger.for(this.patchCollectionSchema.name);
    const client = this.clientFor({ ...opts, method: this.patchCollectionSchema.name });

    await this.runEngineCall<void>({
      method: this.patchCollectionSchema.name,
      run: async () => {
        await client.collections(name).update({ fields });
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
        const aliasName = TypesensePayloadReader.readStringField({ value: alias, key: 'name' });
        const collectionName = TypesensePayloadReader.readStringField({
          value: alias,
          key: 'collection_name',
        });

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
        const payload = items.map((item) =>
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
        const items =
          RecordUtility.isRecord(result) && Array.isArray(result.items) ? result.items : [];
        return items.filter(isSynonymResponse).map((value) => TypesenseMapper.toSynonym({ value }));
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
          .filter(RecordUtility.isRecord)
          .map((set) => set.name)
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

    const id = (document as Record<string, unknown>)['id'];

    const rs = await this.runEngineCall({
      method: this.createDocument.name,
      run: async () => {
        const result = await this.client.collections(collection).documents().create(document);
        const created = result as T;
        return created;
      },
      // Typesense rejects a duplicate id with 409; surfaced as the neutral already_exists conflict rather than the generic sanitized 503 - same contract Meilisearch's createDocument throws.
      tolerate: {
        when: (error) => TypesenseInternal.isAlreadyExistsError({ error }),
        handle: () => {
          throw getError({
            error: SearchErrors.ALREADY_EXISTS,
            message: `[${this.createDocument.name}] Document '${String(id)}' already exists in collection '${collection}'.`,
          });
        },
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
        const result = await this.client.collections(collection).documents(id).retrieve();
        const document = result as T;
        return document;
      },
      tolerate: this.notFoundTolerance({
        method: this.getDocument.name,
        subject: `Document '${id}' in collection '${collection}'`,
      }),
    });
    return rs;
  }

  /** `getDocument` that answers `null` for a missing document, the way `getAlias` does, where `getDocument` throws `404 core.search_engine.not_found`. Any other failure throws as it does there. */
  async findDocument<T extends object>(opts: {
    collection: string;
    id: string;
  }): Promise<T | null> {
    const { collection, id } = opts;
    this.assertNonEmpty({ value: collection, name: 'collection', method: this.findDocument.name });
    this.assertNonEmpty({ value: id, name: 'document id', method: this.findDocument.name });

    const rs = await this.runEngineCall<T | null>({
      method: this.findDocument.name,
      run: async () => {
        const result = await this.client.collections(collection).documents(id).retrieve();
        const document = result as T;
        return document;
      },
      tolerate: this.notFoundFallback({
        method: this.findDocument.name,
        message: 'Document not found | collection: %s | id: %s',
        args: [collection, id],
        fallback: null,
      }),
    });
    return rs;
  }

  /** Typesense's `found` is exhaustive, so a `per_page: 0` search is already an exact count - no separate endpoint needed. */
  async countDocuments(opts: { collection: string; filterBy?: string }): Promise<number> {
    const { collection, filterBy } = opts;
    this.assertNonEmpty({
      value: collection,
      name: 'collection',
      method: this.countDocuments.name,
    });

    const params: Record<string, unknown> = { q: '*' };
    params['per_page'] = 0;

    if (filterBy) {
      params['filter_by'] = filterBy;
    }

    const result = await this.search({ collection, params });
    return result.found;
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
        const result = await this.client.collections(collection).documents().upsert(document);
        const upserted = result as T;
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
        const result = await this.client.collections(collection).documents(id).update(document);
        const updated = result as T;
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

  /** Appends one batch's per-row responses to `responses` and returns that batch's success/fail split. */
  private tallyImportResponses(opts: {
    batchResult: TImportResponse[];
    responses: TImportResponse[];
  }): { successCount: number; failCount: number } {
    const { batchResult, responses } = opts;
    let successCount = 0;
    let failCount = 0;

    for (const row of batchResult) {
      responses.push(row);

      if (row.success) {
        successCount += 1;
        continue;
      }

      failCount += 1;
    }

    return { successCount, failCount };
  }

  async importDocuments<T extends object>(
    opts: {
      collection: string;
      documents: T[];
      action?: TTypesenseImportAction;
      batchSize?: number;
      dirtyValues?: TTypesenseDirtyValue;
      /**
       * Opt-in. When some rows are rejected, throw `422` after the last batch, with the counts in `extra.details` and
       * every per-row response on the error's `responses`. The default stays: a rejected row is in `count.fail` and
       * `responses` of the result and nothing throws.
       */
      throwOnFail?: boolean;
    } & ITypesenseCallOptions,
  ): Promise<IImportResult<TImportResponse>> {
    const { collection, documents, dirtyValues, throwOnFail = false } = opts;
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
    const client = this.clientFor({ ...opts, method: this.importDocuments.name });
    const batchSize = opts.batchSize && opts.batchSize > 0 ? opts.batchSize : 100;
    const responses: TImportResponse[] = [];
    let successCount = 0;
    let failCount = 0;

    try {
      for (let start = 0; start < documents.length; start += batchSize) {
        const batch = documents.slice(start, start + batchSize);

        // opt out of typesense's default throwOnFail:true so import() returns per-row responses to aggregate below.
        const importParams: Record<string, unknown> = dirtyValues
          ? { action, throwOnFail: false, ['dirty_values']: dirtyValues }
          : { action, throwOnFail: false };

        const result = await client.collections(collection).documents().import(batch, importParams);
        const batchResult = result as TImportResponse[];

        const tally = this.tallyImportResponses({ batchResult, responses });
        successCount += tally.successCount;
        failCount += tally.failCount;
      }
    } catch (error) {
      // Batches before the failure are already persisted server-side; every failure path carries partial progress so callers can resume or retry.
      const details = {
        totalCount: documents.length,
        processedCount: successCount + failCount,
        successCount,
        failCount,
      };

      // Re-wrapping an ApplicationError would erase its statusCode/messageCode, so merge progress onto it instead of replacing it.
      if (isApplicationError(error)) {
        error.extra = {
          ...error.extra,
          details: { ...(error.extra?.['details'] as object), ...details },
        };
        throw error;
      }

      SearchConnectorInternal.wrapDependencyError({
        method: this.importDocuments.name,
        error,
        logger: this.logger,
        details,
      });
    }

    logger.info(
      'Imported documents | collection: %s | ok: %d | fail: %d',
      collection,
      successCount,
      failCount,
    );

    if (throwOnFail && failCount > 0) {
      const failed = getError({
        statusCode: HTTP.ResultCodes.RS_4.UnprocessableEntity,
        message: `[${this.importDocuments.name}] ${failCount} of ${documents.length} documents were rejected by the engine | collection: ${collection}`,
        extra: {
          details: {
            totalCount: documents.length,
            processedCount: successCount + failCount,
            successCount,
            failCount,
          },
        },
      });
      // Not in `extra`, which goes on the wire: the responses hold the rejected documents and the engine's text for each.
      Reflect.set(failed, 'responses', responses);
      throw failed;
    }

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

    // The engine answers an empty patch with a 400; refuse it here, before a round trip, as a caller's mistake.
    if (!RecordUtility.isRecord(document) || Object.keys(document).length === 0) {
      throw getError({
        message: `[${this.updateByFilter.name}] Empty document | Pass at least one field to change`,
      });
    }

    const rs = await this.runEngineCall({
      method: this.updateByFilter.name,
      run: async () => {
        const updateOptions: Record<string, unknown> = {};
        updateOptions['filter_by'] = filterBy;

        const result = await this.client
          .collections(collection)
          .documents()
          .update(document, updateOptions);

        return {
          updatedCount: TypesensePayloadReader.readNumberField({
            value: result,
            key: 'num_updated',
          }),
        };
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
        return TypesensePayloadReader.readNumberField({ value: result, key: 'num_deleted' });
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
          TypesensePayloadReader.readNumberField({ value: result, key: 'num_deleted' }),
        );
        return true;
      },
    });
    return rs;
  }

  async exportDocuments(
    opts: {
      collection: string;
      filterBy?: string;
      includeFields?: string[];
      excludeFields?: string[];
    } & ITypesenseCallOptions,
  ): Promise<string> {
    const { collection } = opts;
    this.assertNonEmpty({
      value: collection,
      name: 'collection',
      method: this.exportDocuments.name,
    });
    const client = this.clientFor({ ...opts, method: this.exportDocuments.name });

    const rs = await this.runEngineCall({
      method: this.exportDocuments.name,
      run: async () => {
        const result = await client
          .collections(collection)
          .documents()
          .export(TypesenseInternal.toExportParams(opts));
        const exported = result as string;
        return exported;
      },
    });
    return rs;
  }

  /**
   * The export as a stream of NDJSON lines, one document per line without its newline, read as the engine sends
   * them. Memory stays bounded by one chunk and one partial line, so a collection of any size can be written to disk
   * as it arrives, where `exportDocuments` builds the whole export as one string (at most 2^31 - 1 characters on Bun, about 2 GiB of ASCII text).
   *
   * ```typescript
   * for await (const line of connector.streamDocuments({ collection: 'products', timeoutMs: 600_000 })) {
   *   writer.write(`${line}\n`);
   * }
   * ```
   *
   * The call to the engine happens on the first read. A failure before the first line throws as `exportDocuments`
   * does; one in the middle throws the same error from the loop, after the lines already read.
   */
  async *streamDocuments(
    opts: {
      collection: string;
      filterBy?: string;
      includeFields?: string[];
      excludeFields?: string[];
    } & ITypesenseCallOptions,
  ): AsyncGenerator<string, void, undefined> {
    const { collection } = opts;
    const method = this.streamDocuments.name;
    this.assertNonEmpty({ value: collection, name: 'collection', method });
    const client = this.clientFor({ ...opts, method });

    const source = await this.runEngineCall({
      method,
      run: () =>
        client
          .collections(collection)
          .documents()
          .exportStream(TypesenseInternal.toExportParams(opts)),
    });

    try {
      yield* TypesenseInternal.toLines({ source });
    } catch (error) {
      if (isApplicationError(error)) {
        throw error;
      }

      SearchConnectorInternal.wrapDependencyError({ method, error, logger: this.logger });
    }
  }

  /**
   * The single transport. Every engine search - one collection or many - is one POST to
   * `/multi_search`.
   *
   * `/multi_search` is a strict superset of GET single-search: it accepts the same per-entry
   * params, and it carries them in the BODY. GET is capped near 4000 characters of query string,
   * which a `filter_by` built from an authorization scope exceeds at roughly ninety ids - so a
   * user with many permitted scopes could not search at all. Choosing between the two at runtime
   * would mean deciding on URL length, which is only knowable after building the query; there is
   * no decision point here, so there is nothing to decide wrongly.
   */
  private async executeMultiSearch(opts: {
    method: string;
    entries: Array<{ collection: string } & Partial<TSearchParams>>;
    union?: boolean;
    commonParams?: Partial<TSearchParams>;
    options?: TSearchOptions;
    tolerate?: {
      when: (error: unknown) => boolean;
      handle: (error: unknown) => IMultiSearchResult | IUnionSearchResult;
    };
  }): Promise<IMultiSearchResult | IUnionSearchResult> {
    const { method, entries, union: isUnion, commonParams, options, tolerate } = opts;

    return this.runEngineCall({
      method,
      run: async () => {
        const result = await this.client.multiSearch.perform(
          isUnion ? { union: true, searches: entries } : { searches: entries },
          commonParams ?? {},
          options,
        );
        return result as IMultiSearchResult | IUnionSearchResult;
      },
      tolerate,
    });
  }

  async search<T extends TDocumentSchema = TDocumentSchema>(opts: {
    collection: string;
    params: TSearchParams;
    options?: TSearchOptions;
  }): Promise<ISearchResult<T>> {
    const { collection, params, options } = opts;
    this.assertNonEmpty({ value: collection, name: 'collection', method: this.search.name });
    const logger = this.logger.for(this.search.name);

    const { common, body } = TypesenseInternal.splitCacheParams({
      params: params as unknown as Record<string, unknown>,
    });
    const paramsRecord = body;
    const requested = TypesenseSearchWindows.readRequestedPage({ params: paramsRecord });
    const windows = requested
      ? TypesenseSearchWindows.toSearchWindows(requested)
      : [{ offset: 0, limit: 0 }];

    if (windows.length > 1 && requested) {
      this.assertSplittablePage({ paramsRecord, requested, windows, collection });
    }

    // A single window passes the caller's params through unchanged but for the cache switches, which
    // go to the common params - `mode: 'raw'` reaches the engine otherwise byte-identical, and only a
    // page the engine would have rejected outright gets rewritten.
    const entries =
      windows.length === 1
        ? [{ ...body, collection } as { collection: string } & Partial<TSearchParams>]
        : windows.map((window) => {
            // Each window carries its own offset/limit, so the caller's page keys are left out.
            const rest = Object.fromEntries(
              Object.entries(paramsRecord).filter(([key]) => key !== 'page' && key !== 'per_page'),
            );
            const entry = {
              ...rest,
              collection,
              offset: window.offset,
              limit: window.limit,
            };
            return entry as { collection: string } & Partial<TSearchParams>;
          });

    const result2 = await this.executeMultiSearch({
      method: this.search.name,
      entries,
      commonParams: common as Partial<TSearchParams>,
      options,
    });
    const response = result2 as IMultiSearchResult<T>;

    const results = Array.isArray(response?.results) ? response.results : [];
    const mapped: ISearchResult<T>[] = [];

    for (const entry of results) {
      const classification = TypesenseInternal.classifyEntry({ entry });

      switch (classification.kind) {
        // Preserves the tolerance the GET path had: an unprovisioned collection answers empty with
        // a warning rather than a 500.
        case EntryOutcomes.MISSING_COLLECTION: {
          logger.warn('Search on missing collection, returning empty | name: %s', collection);
          return TypesenseMapper.mapSearchResult<T>({
            raw: TypesenseSearchWindows.buildEmptySearchResponse(),
          });
        }

        // A failed entry arrives inside an HTTP 200. Answering empty here would make a rejected
        // filter indistinguishable from a genuine no-match, and `ISearchResult` has nowhere to put
        // the error - so this throws rather than returning a plausible zero.
        case EntryOutcomes.FAILED: {
          throw getError({
            message: `[${TypesenseConnector.name}][search] Engine rejected the search | collection: '${collection}' | code: ${classification.code} | ${classification.message}`,
          });
        }

        // A real result - map it and let the loop collect the remaining windows.
        case EntryOutcomes.OK:
        default: {
          mapped.push(TypesenseMapper.mapSearchResult<T>({ raw: entry }));
          break;
        }
      }
    }

    if (mapped.length === 0) {
      return TypesenseMapper.mapSearchResult<T>({
        raw: TypesenseSearchWindows.buildEmptySearchResponse(),
      });
    }

    return TypesenseSearchWindows.mergeWindowedResults<T>({ results: mapped });
  }

  /**
   * Refuses a page that cannot be served honestly, rather than serving part of it.
   *
   * Grouped results are refused outright: groups span windows, so concatenating duplicates them
   * and taking the first window drops the rest. Merging by key would mean re-deriving `group_limit`
   * ordering the engine never produced - inventing an answer, which is the failure class this
   * whole change exists to remove.
   */
  private assertSplittablePage(opts: {
    paramsRecord: Record<string, unknown>;
    requested: ISearchWindow;
    windows: ISearchWindow[];
    collection: string;
  }): void {
    const { paramsRecord, requested, windows, collection } = opts;

    // Every PAGE_TOO_LARGE throw names the REQUESTED value and the ceiling that applies to it. One
    // code is right, since the remedy is always "ask for a smaller page" - but the ceilings differ
    // (250 grouped, 12,500 windowed, the model's own limit at the repository tier), so a client
    // branching on the code alone could not tell what to retry with.
    if (paramsRecord['group_by'] !== undefined) {
      throw getError({
        error: SearchErrors.PAGE_TOO_LARGE,
        message: `[${TypesenseConnector.name}][search] A grouped search cannot be split across pages | collection: '${collection}' | group_by: '${String(paramsRecord['group_by'])}' | requested: ${requested.limit} | maximum: ${MAX_HITS_PER_PAGE}`,
      });
    }

    if (windows.length > MAX_MULTI_SEARCH_ENTRIES) {
      throw getError({
        error: SearchErrors.PAGE_TOO_LARGE,
        message: `[${TypesenseConnector.name}][search] Requested page needs ${windows.length} windows but one multi_search call carries at most ${MAX_MULTI_SEARCH_ENTRIES} | collection: '${collection}' | requested: ${requested.limit} | maximum: ${MAX_MULTI_SEARCH_ENTRIES * MAX_HITS_PER_PAGE}`,
      });
    }
  }

  // `union: true` merges into ONE result set while the default federates into `results[]`, hence the overloads; `searches`/`commonParams` are the engine's NATIVE snake_case wire params, typed as TSearchParams so the raw escape hatch keeps full LSP.
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

    // Shares `search()`'s transport but NOT its policy. This method's contract is the raw envelope:
    // callers index `results[i]` against `searches[i]` and inspect entries themselves, so error
    // entries pass through untouched - throwing here would break callers who already handle them.
    //
    // It also does not window-split. Merging windows would mean synthesizing a SearchResponse the
    // engine never returned, with no honest value for `request_params` or `page`, and it would
    // destroy the 1:1 correspondence that indexing depends on. `search()` can merge because it maps
    // to a neutral ISearchResult; here the caller is handed engine-shaped objects.
    const result = await this.executeMultiSearch({
      method: this.multiSearch.name,
      entries: searches,
      union: isUnion,
      commonParams,
      options,
    });
    const rs = result as IMultiSearchResult<T> | IUnionSearchResult<T>;

    return rs;
  }
}
