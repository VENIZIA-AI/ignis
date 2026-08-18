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
import { SearchConnectorInternal } from '@/search/core/internal';
import type { ISynonym } from '@/search/core/models';
import { getError, isApplicationError } from '@venizia/ignis-helpers/core';
import { Client } from 'typesense';
import { EntryOutcomes, TypesenseInternal } from './internal/connector-internal';
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
  TTypesenseDirtyValue,
  TTypesenseImportAction,
} from './types';
import { TypesenseDirtyValues, TypesenseImportActions } from './types';

// Narrow runtime readers for the `unknown` payloads ITypesenseClientLike hands back - the narrowest cast per field, isolated here instead of repeated ad hoc at every call site.
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
  score?: number;
} => {
  if (!isRecord(hit)) {
    return { document: {} as TDocument };
  }

  const mapped: {
    document: TDocument;
    highlight?: unknown;
    highlights?: unknown[];
    score?: number;
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
    mapped.score = hit['text_match'];
  }

  return mapped;
};

/** Maps a raw Typesense search response onto the camelCase `ISearchResult`; snake_case wire fields (`out_of`/`search_time_ms`/`facet_counts`/`grouped_hits`) are read only via bracket string access, never as identifiers, and absent fields are omitted rather than mapped as `undefined`. */
const mapSearchResult = <TDocument extends object>(raw: unknown): ISearchResult<TDocument> => {
  if (!isRecord(raw)) {
    return { found: 0, isFoundExact: true };
  }

  // `found` is exhaustive UNLESS the engine ran out of its search-time budget: `search_cutoff`
  // means it stopped early and reported what it had, so the count is an estimate. Hardcoding
  // `true` told every caller that a truncated count was authoritative.
  const result: ISearchResult<TDocument> = {
    found: readNumberField({ value: raw, key: 'found' }),
    isFoundExact: raw['search_cutoff'] !== true,
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

/** `--max-per-page`: Typesense refuses a page larger than this, so a bigger caller limit is served as consecutive windows of one multi_search call rather than as several calls. */
const MAX_HITS_PER_PAGE = 250;

/** `limit_multi_searches`: entries permitted in ONE multi_search call, which bounds windowing at 50 x 250 = 12,500 hits. Exceeding it is refused, never silently truncated. */
const MAX_MULTI_SEARCH_ENTRIES = 50;

/** One window of a split page: an entry differs from its siblings only in where it starts. */
interface ISearchWindow {
  offset: number;
  limit: number;
}

/**
 * Splits a requested page into windows the engine will accept.
 *
 * Windows are expressed as `offset`/`limit` rather than `page`/`per_page` because only offset
 * arithmetic can start a window anywhere - which is also what lets a caller's `skip` land off a
 * page boundary. Exactly one pagination pair is ever sent: Typesense documents `offset`/`limit`
 * and `page`/`per_page` as alternatives and does not state which wins if both appear, so the
 * question is designed out rather than answered.
 */
const toSearchWindows = (opts: { offset: number; limit: number }): ISearchWindow[] => {
  const { offset, limit } = opts;

  if (limit <= MAX_HITS_PER_PAGE) {
    return [{ offset, limit }];
  }

  const windows: ISearchWindow[] = [];
  for (let start = 0; start < limit; start += MAX_HITS_PER_PAGE) {
    windows.push({ offset: offset + start, limit: Math.min(MAX_HITS_PER_PAGE, limit - start) });
  }

  return windows;
};

/**
 * Folds windowed responses into the single result the caller asked for.
 *
 * `found`/`outOf` come from the first window because every window ran the same filter and reports
 * the same total. `facetCounts` likewise: facets are computed over the whole result set, not the
 * page, so concatenating them would multiply every count by the window count.
 */
const mergeWindowedResults = <TDocument extends object>(
  results: ISearchResult<TDocument>[],
): ISearchResult<TDocument> => {
  const [first] = results;

  if (results.length === 1) {
    return first;
  }

  const merged: ISearchResult<TDocument> = {
    found: first.found,
    // AND-folded: the total is only exact if EVERY window ran to completion. One cut-off window
    // makes the merged count an estimate, and saying otherwise would relaunch the bug above.
    isFoundExact: results.every(result => result.isFoundExact),
  };

  if (first.outOf !== undefined) {
    merged.outOf = first.outOf;
  }

  // MAX, not sum: this field is read as latency, and the windows travel in ONE round trip. Summing
  // would make a windowed query graph at several times its actual wall-clock.
  const timings = results
    .map(result => result.searchTimeMs)
    .filter((value): value is number => typeof value === 'number');
  if (timings.length > 0) {
    merged.searchTimeMs = Math.max(...timings);
  }

  if (first.facetCounts) {
    merged.facetCounts = first.facetCounts;
  }

  const hits = results.flatMap(result => result.hits ?? []);
  if (hits.length > 0) {
    merged.hits = hits;
  }

  return merged;
};

/**
 * Reads the requested page out of engine-native params, whichever pair the caller used.
 *
 * `mode: 'raw'` hands these params through untouched, so both spellings have to be understood
 * here; the caller is never asked to normalize.
 */
const readRequestedPage = (params: Record<string, unknown>): ISearchWindow | undefined => {
  const limit = typeof params['limit'] === 'number' ? params['limit'] : undefined;
  const perPage = typeof params['per_page'] === 'number' ? params['per_page'] : undefined;
  const effectiveLimit = limit ?? perPage;

  if (effectiveLimit === undefined) {
    return undefined;
  }

  const offset = typeof params['offset'] === 'number' ? params['offset'] : undefined;
  const page = typeof params['page'] === 'number' ? params['page'] : undefined;
  const effectiveOffset = offset ?? (page !== undefined ? (page - 1) * effectiveLimit : 0);

  return { offset: effectiveOffset, limit: effectiveLimit };
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

  protected isNotFoundError(opts: { error: unknown }): boolean {
    return TypesenseInternal.isNotFoundError(opts);
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
    count: opts => this.countDocuments(opts),
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
        .warn('Health probe failed | error: %s', SearchConnectorInternal.describeError({ error }));
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

    // The create response IS the collection schema; reading it back instead is a read-after-write race on multi-node clusters (a follower may 404 before the raft log catches up), so only the tolerated already-exists path re-reads.
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
          'Existence check failed, treating as absent | name: %s | error: %s',
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

    const id = (document as Record<string, unknown>)['id'];

    const rs = await this.runEngineCall({
      method: this.createDocument.name,
      run: async () => {
        const created = (await this.client
          .collections(collection)
          .documents()
          .create(document)) as T;
        return created;
      },
      // Typesense rejects a duplicate id with 409; surfaced as the neutral already_exists conflict rather than the generic sanitized 503 - same contract Meilisearch's createDocument throws.
      tolerate: {
        when: error => TypesenseInternal.isAlreadyExistsError({ error }),
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
        const importParams: Record<string, unknown> = dirtyValues
          ? { action, throwOnFail: false, ['dirty_values']: dirtyValues }
          : { action, throwOnFail: false };

        const batchResult = (await this.client
          .collections(collection)
          .documents()
          .import(batch, importParams)) as TImportResponse[];

        const tally = this.tallyImportResponses({ batchResult, responses });
        successCount += tally.successCount;
        failCount += tally.failCount;
      }
    } catch (error) {
      // A framework ApplicationError is already sanitized and carries its own statusCode/messageCode, so it surfaces as-is; only raw engine failures get wrapped as a 503, mirroring runEngineCall's guard.
      if (isApplicationError(error)) {
        throw error;
      }

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

    const paramsRecord = params as unknown as Record<string, unknown>;
    const requested = readRequestedPage(paramsRecord);
    const windows = requested ? toSearchWindows(requested) : [{ offset: 0, limit: 0 }];

    if (windows.length > 1 && requested) {
      this.assertSplittablePage({ paramsRecord, requested, windows, collection });
    }

    // A single window passes the caller's params through UNCHANGED - `mode: 'raw'` reaches the
    // engine byte-identical, and only a page the engine would have rejected outright gets rewritten.
    const entries =
      windows.length === 1
        ? [{ ...params, collection }]
        : windows.map(window => {
            const entry = {
              ...paramsRecord,
              collection,
              offset: window.offset,
              limit: window.limit,
            };
            delete entry['page'];
            delete entry['per_page'];
            return entry as { collection: string } & Partial<TSearchParams>;
          });

    const response = (await this.executeMultiSearch({
      method: this.search.name,
      entries,
      commonParams: {},
      options,
    })) as IMultiSearchResult<T>;

    const results = Array.isArray(response?.results) ? response.results : [];
    const mapped: ISearchResult<T>[] = [];

    for (const entry of results) {
      const classification = TypesenseInternal.classifyEntry({ entry });

      switch (classification.kind) {
        // Preserves the tolerance the GET path had: an unprovisioned collection answers empty with
        // a warning rather than a 500.
        case EntryOutcomes.MISSING_COLLECTION: {
          logger.warn('Search on missing collection, returning empty | name: %s', collection);
          return mapSearchResult<T>(buildEmptySearchResponse());
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
          mapped.push(mapSearchResult<T>(entry));
          break;
        }
      }
    }

    if (mapped.length === 0) {
      return mapSearchResult<T>(buildEmptySearchResponse());
    }

    return mergeWindowedResults<T>(mapped);
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
    const rs = (await this.executeMultiSearch({
      method: this.multiSearch.name,
      entries: searches,
      union: isUnion,
      commonParams,
      options,
    })) as IMultiSearchResult<T> | IUnionSearchResult<T>;

    return rs;
  }
}
