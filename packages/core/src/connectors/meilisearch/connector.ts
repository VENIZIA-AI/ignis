import { CoreErrorCodes, SearchErrorCodes } from '@/common';
import { SearchErrors } from '@/connectors/search/common';
import type {
  IImportResult,
  ISearchCollectionScoped,
  ISearchDocumentScoped,
  ISearchResult,
  ISearchSwapScoped,
  ISearchSynonymScoped,
} from '@/connectors/search';
import { BaseSearchConnector } from '@/connectors/search';
import { SearchConnectorInternal } from '@/connectors/search/internal';
import type { ISynonym } from '@/connectors/search/models';
import type { AnyType } from '@venizia/ignis-helpers';
import { isApplicationError } from '@venizia/ignis-helpers';
import { getError, HTTP } from '@venizia/ignis-helpers';
import { Meilisearch } from 'meilisearch';
import type { IMeilisearchIndexPlan } from './compiler';
import { MeilisearchInternal } from './internal';
import type { IMeilisearchConnectorOptions } from './types';
import {
  MEILISEARCH_DEFAULT_FETCH_PAGE_SIZE,
  MEILISEARCH_DEFAULT_UPDATE_BATCH_SIZE,
  MeilisearchTaskStatuses,
} from './types';

const DEFAULT_TASK_TIMEOUT_MS = 5 * 60_000;
const DEFAULT_TASK_INTERVAL_MS = 50;
/** Ceiling for the exponential poll backoff - one poll per second once a task runs long. */
const MAX_TASK_INTERVAL_MS = 1000;

interface IMeilisearchTask {
  taskUid: number;
  status: string;
  error?: unknown;
  /** A finished task reports what it actually did, e.g. `deletedDocuments` on a documentDeletion. */
  details?: Record<string, unknown>;
}

interface IMeilisearchDocumentsPage {
  results: unknown[];
  total: number;
}

/** Narrow structural view of the client surface this connector needs - the real client and the in-test fake both satisfy it. */
interface IMeilisearchIndexApi {
  addDocuments(documents: unknown[], options?: unknown): Promise<IMeilisearchTask>;
  updateDocuments(documents: unknown[], options?: unknown): Promise<IMeilisearchTask>;
  getDocument(id: string, options?: unknown): Promise<unknown>;
  getDocuments(params: unknown): Promise<IMeilisearchDocumentsPage>;
  deleteDocument(id: string): Promise<IMeilisearchTask>;
  deleteDocuments(params: unknown): Promise<IMeilisearchTask>;
  deleteAllDocuments(): Promise<IMeilisearchTask>;
  search(query: string | null, params?: unknown): Promise<unknown>;
  updateSettings(settings: unknown): Promise<IMeilisearchTask>;
  getSettings(): Promise<Record<string, unknown>>;
  updateSynonyms(synonyms: Record<string, string[]>): Promise<IMeilisearchTask>;
  resetSynonyms(): Promise<IMeilisearchTask>;
}

export interface IMeilisearchClientLike {
  index(uid: string): IMeilisearchIndexApi;
  createIndex(uid: string, options?: unknown): Promise<IMeilisearchTask>;
  getIndex(uid: string): Promise<unknown>;
  getIndexes(params?: unknown): Promise<{ results: unknown[] }>;
  deleteIndex(uid: string): Promise<IMeilisearchTask>;
  swapIndexes(pairs: Array<{ indexes: string[] }>): Promise<IMeilisearchTask>;
  getTask(taskUid: number): Promise<IMeilisearchTask>;
  health(): Promise<{ status: string }>;
  multiSearch(params: unknown): Promise<unknown>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

/** Reserved RESPONSE keys on a hit. Listed explicitly, not by `_` prefix - `_geo` is a stored DOCUMENT field and prefix-stripping would delete it. */
const RESERVED_HIT_KEYS = new Set([
  '_formatted',
  '_matchesPosition',
  '_rankingScore',
  '_rankingScoreDetails',
  '_vectors',
  '_federation',
  '_geoDistance',
]);

/** Strips Meilisearch's reserved response metadata, leaving the caller's own document intact. */
const extractDocument = <TDocument extends object>(hit: Record<string, unknown>): TDocument => {
  const document: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(hit)) {
    if (RESERVED_HIT_KEYS.has(key)) {
      continue;
    }

    document[key] = value;
  }

  return document as TDocument;
};

/** Maps a Meilisearch response onto `ISearchResult`: exhaustive `totalHits` preferred over approximate `estimatedTotalHits` (`isFoundExact` says which), wire keys read via bracket access, never identifiers. */
const mapSearchResult = <TDocument extends object>(raw: unknown): ISearchResult<TDocument> => {
  if (!isRecord(raw)) {
    return { found: 0, isFoundExact: true };
  }

  const totalHits = raw['totalHits'];
  const isFoundExact = typeof totalHits === 'number';
  const estimated = raw['estimatedTotalHits'];

  const result: ISearchResult<TDocument> = {
    found: isFoundExact ? totalHits : typeof estimated === 'number' ? estimated : 0,
    isFoundExact,
  };

  if (typeof raw['processingTimeMs'] === 'number') {
    result.searchTimeMs = raw['processingTimeMs'];
  }

  if (isRecord(raw['facetDistribution'])) {
    result.facetCounts = [raw['facetDistribution']];
  }

  if (Array.isArray(raw['hits'])) {
    result.hits = raw['hits'].filter(isRecord).map(hit => {
      const entry: {
        document: TDocument;
        highlight?: unknown;
        score?: number;
      } = { document: extractDocument<TDocument>(hit) };

      if (hit['_formatted'] !== undefined) {
        entry.highlight = hit['_formatted'];
      }

      if (typeof hit['_rankingScore'] === 'number') {
        entry.score = hit['_rankingScore'];
      }

      return entry;
    });
  }

  return result;
};

/** Adapts the SDK client onto the structural view this connector needs. */
const adaptClient = (sdk: Meilisearch): IMeilisearchClientLike => {
  // The SDK's task/index return types carry more detail than this connector reads, so each delegate widens to AnyType at the seam rather than restating the SDK's shapes.
  const client = sdk as AnyType;

  return {
    index: (uid: string) => client.index(uid),
    createIndex: (uid: string, options?: unknown) => client.createIndex(uid, options),
    getIndex: (uid: string) => client.getIndex(uid),
    getIndexes: () => client.getIndexes(),
    deleteIndex: (uid: string) => client.deleteIndex(uid),
    swapIndexes: (pairs: Array<{ indexes: string[] }>) => client.swapIndexes(pairs),
    // The one real divergence: the SDK exposes getTask under `client.tasks`, not at the root.
    getTask: (taskUid: number) => client.tasks.getTask(taskUid),
    health: () => client.health(),
    multiSearch: (params: unknown) => client.multiSearch(params),
  };
};

/** Meilisearch-backed search connector. Every write awaits its task, so `create()` resolves only once the document is retrievable. */
export class MeilisearchConnector extends BaseSearchConnector {
  private readonly client: IMeilisearchClientLike;
  private readonly rawClient?: Meilisearch;
  private readonly taskTimeoutMs: number;
  private readonly taskIntervalMs: number;
  private readonly primaryKeyByCollection = new Map<string, string>();

  constructor(opts: IMeilisearchConnectorOptions & { client?: IMeilisearchClientLike }) {
    super({
      scope: opts.scope ?? MeilisearchConnector.name,
      identifier: opts.identifier ?? opts.name,
    });

    this.taskTimeoutMs = opts.taskTimeoutMs ?? DEFAULT_TASK_TIMEOUT_MS;
    this.taskIntervalMs = opts.taskIntervalMs ?? DEFAULT_TASK_INTERVAL_MS;

    try {
      if (opts.client) {
        this.client = opts.client;
      } else {
        this.rawClient = new Meilisearch({ host: opts.host, apiKey: opts.apiKey });
        this.client = adaptClient(this.rawClient);
      }

      opts.onInitialized?.({ name: opts.name });
    } catch (error) {
      this.logger
        .for('constructor')
        .error(
          'Failed to initialize Meilisearch client | error: %s',
          SearchConnectorInternal.describeError({ error }),
        );

      opts.onError?.({ name: opts.name, error });
      throw error;
    }
  }

  /** The raw SDK client - the escape hatch for anything this connector does not model (fire-and-forget writes, federation, facet search). */
  getClient(): Meilisearch {
    if (!this.rawClient) {
      throw getError({
        message: `[${MeilisearchConnector.name}] No raw client available - this connector was constructed with an injected client.`,
      });
    }

    return this.rawClient;
  }

  protected isNotFoundError(opts: { error: unknown }): boolean {
    return MeilisearchInternal.isNotFoundError(opts);
  }

  readonly collection: ISearchCollectionScoped<IMeilisearchIndexPlan, unknown, never> = {
    create: opts => this.createCollection(opts),
    ensure: opts => this.ensureCollection(opts),
    get: opts => this.getCollection(opts),
    list: () => this.listCollections(),
    exists: opts => this.collectionExists(opts),
    patchSchema: () => this.patchCollectionSchema(),
    delete: opts => this.deleteCollection(opts),
  };

  /** Meilisearch has no alias layer; a zero-downtime reindex swaps two index uids atomically. */
  readonly swap: ISearchSwapScoped = {
    indexes: opts => this.swapIndexes(opts),
  };

  /** A flat per-index dictionary. There is no named, linkable synonym-set resource. */
  readonly synonyms: ISearchSynonymScoped = {
    set: opts => this.setSynonyms(opts),
    get: opts => this.getSynonyms(opts),
    reset: opts => this.resetSynonyms(opts),
  };

  readonly document: ISearchDocumentScoped = {
    get: <T extends object>(opts: { collection: string; id: string }) => this.getDocument<T>(opts),
    count: opts => this.countDocuments(opts),
    create: <T extends object>(opts: { collection: string; document: T }) =>
      this.createDocument(opts),
    upsert: <T extends object>(opts: { collection: string; document: T }) =>
      this.upsertDocument(opts),
    update: <T extends object>(opts: { collection: string; id: string; document: Partial<T> }) =>
      this.updateDocument(opts),
    updateBy: <T extends object>(opts: {
      collection: string;
      document: Partial<T>;
      filterBy: string;
    }) => this.updateByFilter(opts),
    delete: opts => this.deleteDocument(opts),
    deleteBy: opts => this.deleteByFilter(opts),
    deleteAll: opts => this.deleteAllDocuments(opts),
    import: <T extends object>(opts: { collection: string; documents: T[]; batchSize?: number }) =>
      this.importDocuments(opts),
    export: opts => this.exportDocuments(opts),
  };

  async getHealth(): Promise<{ ok: boolean }> {
    const rs = await this.runEngineCall({
      method: this.getHealth.name,
      run: async () => {
        const health = await this.client.health();
        return { ok: health.status === 'available' };
      },
    });

    return rs;
  }

  /** Writes are invisible until their task succeeds; polls manually against a caller-configured ceiling because the SDK's own `waitForTask` 5 s default is too short for bulk imports. */
  private async waitForTask(opts: { taskUid: number; method: string }): Promise<IMeilisearchTask> {
    const { taskUid, method } = opts;
    const deadline = Date.now() + this.taskTimeoutMs;
    // Exponential backoff: a fast task still resolves in the first poll or two, while a long-running one is not polled ~20x/s throughout - the interval doubles up to a 1 s ceiling.
    let intervalMs = this.taskIntervalMs;

    for (;;) {
      const task = await this.client.getTask(taskUid);

      if (task.status === MeilisearchTaskStatuses.SUCCEEDED) {
        return task;
      }

      if (MeilisearchTaskStatuses.isTerminal(task.status)) {
        this.logger
          .for(method)
          .error(
            'Task did not succeed | uid: %s | status: %s | error: %s',
            taskUid,
            task.status,
            SearchConnectorInternal.describeError({ error: task.error }),
          );

        SearchConnectorInternal.wrapDependencyError({
          method,
          error: task.error ?? task.status,
          logger: this.logger,
        });
      }

      if (Date.now() >= deadline) {
        throw getError({
          statusCode: HTTP.ResultCodes.RS_5.GatewayTimeout,
          messageCode: SearchErrorCodes.TASK_TIMEOUT,
          message: `[${method}] Search engine task timed out after ${this.taskTimeoutMs}ms.`,
        });
      }

      await new Promise(resolve => setTimeout(resolve, intervalMs));
      intervalMs = Math.min(intervalMs * 2, MAX_TASK_INTERVAL_MS);
    }
  }

  /** Runs the write, awaits its task, and returns the FINISHED task so callers reading `details` (`deletedDocuments`) get the terminal record. */
  private async awaitWrite(opts: {
    method: string;
    run: () => Promise<{ taskUid: number }>;
  }): Promise<IMeilisearchTask> {
    const { method, run } = opts;
    const enqueued = await run();
    return this.waitForTask({ taskUid: enqueued.taskUid, method });
  }

  async createCollection(opts: { schema: IMeilisearchIndexPlan }): Promise<void> {
    const { schema } = opts;
    this.assertNonEmpty({ value: schema.uid, name: 'uid', method: this.createCollection.name });

    await this.runEngineCall({
      method: this.createCollection.name,
      run: async () => {
        await this.awaitWrite({
          method: this.createCollection.name,
          run: () => this.client.createIndex(schema.uid, { primaryKey: schema.primaryKey }),
        });
        this.logger.for(this.createCollection.name).info('Created index | uid: %s', schema.uid);
      },
      tolerate: {
        when: error => MeilisearchInternal.isAlreadyExistsError({ error }),
        handle: () => {
          this.logger
            .for(this.createCollection.name)
            .info('Index already exists, skipping | uid: %s', schema.uid);
        },
      },
    });

    if (schema.primaryKey) {
      this.primaryKeyByCollection.set(schema.uid, schema.primaryKey);
    }
  }

  /** Create-if-absent, then apply settings. Both steps await their task, so the index is queryable on return. */
  async ensureCollection(opts: { schema: IMeilisearchIndexPlan }): Promise<unknown> {
    const { schema } = opts;

    await this.createCollection(opts);

    await this.runEngineCall({
      method: this.ensureCollection.name,
      run: async () => {
        await this.awaitWrite({
          method: this.ensureCollection.name,
          run: () => this.client.index(schema.uid).updateSettings(schema.settings),
        });
      },
    });

    return schema;
  }

  async getCollection(opts: { name: string }): Promise<unknown> {
    const { name } = opts;
    this.assertNonEmpty({ value: name, name: 'collection', method: this.getCollection.name });

    const rs = await this.runEngineCall({
      method: this.getCollection.name,
      run: () => this.client.getIndex(name),
      tolerate: this.notFoundTolerance({
        method: this.getCollection.name,
        subject: `Collection '${name}'`,
      }),
    });

    return rs;
  }

  async listCollections(): Promise<unknown[]> {
    const rs = await this.runEngineCall({
      method: this.listCollections.name,
      run: async () => {
        const page = await this.client.getIndexes();
        return page.results;
      },
    });

    return rs;
  }

  async collectionExists(opts: { name: string }): Promise<boolean> {
    const { name } = opts;

    const rs = await this.runEngineCall({
      method: this.collectionExists.name,
      run: async () => {
        await this.client.getIndex(name);
        return true;
      },
      tolerate: this.notFoundFallback({
        method: this.collectionExists.name,
        message: 'Index not found, treating as absent | uid: %s',
        args: [name],
        fallback: false,
      }),
    });

    return rs;
  }

  /** Meilisearch is schemaless: there is no field schema to patch. Settings are applied by ensureCollection. */
  patchCollectionSchema(): Promise<void> {
    throw getError({
      statusCode: HTTP.ResultCodes.RS_5.NotImplemented,
      messageCode: CoreErrorCodes.NOT_SUPPORTED,
      message: `[${MeilisearchConnector.name}] Field-schema patching is not supported - Meilisearch is schemaless; change index settings via ensureCollection instead.`,
    });
  }

  async deleteCollection(opts: { name: string }): Promise<boolean> {
    const { name } = opts;

    const rs = await this.runEngineCall({
      method: this.deleteCollection.name,
      run: async () => {
        await this.awaitWrite({
          method: this.deleteCollection.name,
          run: () => this.client.deleteIndex(name),
        });
        return true;
      },
      tolerate: this.notFoundFallback({
        method: this.deleteCollection.name,
        message: 'Index not found, treating as already deleted | uid: %s',
        args: [name],
        fallback: false,
      }),
    });

    return rs;
  }

  async swapIndexes(opts: { pairs: Array<[string, string]> }): Promise<void> {
    const { pairs } = opts;

    await this.runEngineCall({
      method: this.swapIndexes.name,
      run: async () => {
        await this.awaitWrite({
          method: this.swapIndexes.name,
          run: () => this.client.swapIndexes(pairs.map(indexes => ({ indexes }))),
        });
        this.logger
          .for(this.swapIndexes.name)
          .info('Swapped index pair(s) | count: %s', pairs.length);
      },
    });
  }

  async setSynonyms(opts: { collection: string; items: ISynonym[] }): Promise<void> {
    const { collection, items } = opts;
    const dictionary: Record<string, string[]> = {};

    for (const entry of items) {
      if (entry.root) {
        dictionary[entry.root] = entry.synonyms;
        continue;
      }

      for (const term of entry.synonyms) {
        dictionary[term] = entry.synonyms.filter(other => other !== term);
      }
    }

    await this.runEngineCall({
      method: this.setSynonyms.name,
      run: async () => {
        await this.awaitWrite({
          method: this.setSynonyms.name,
          run: () => this.client.index(collection).updateSynonyms(dictionary),
        });
      },
    });
  }

  async getSynonyms(opts: { collection: string }): Promise<ISynonym[]> {
    const { collection } = opts;

    const rs = await this.runEngineCall({
      method: this.getSynonyms.name,
      run: async () => {
        const settings = await this.client.index(collection).getSettings();
        const dictionary = settings['synonyms'];

        if (!isRecord(dictionary)) {
          return [];
        }

        return Object.entries(dictionary).map(([id, synonyms]) => ({
          id,
          synonyms: Array.isArray(synonyms) ? (synonyms as string[]) : [],
        }));
      },
    });

    return rs;
  }

  async resetSynonyms(opts: { collection: string }): Promise<void> {
    const { collection } = opts;

    await this.runEngineCall({
      method: this.resetSynonyms.name,
      run: async () => {
        await this.awaitWrite({
          method: this.resetSynonyms.name,
          run: () => this.client.index(collection).resetSynonyms(),
        });
      },
    });
  }

  async getDocument<T extends object>(opts: { collection: string; id: string }): Promise<T> {
    const { collection, id } = opts;
    this.assertNonEmpty({ value: collection, name: 'collection', method: this.getDocument.name });
    this.assertNonEmpty({ value: id, name: 'document id', method: this.getDocument.name });

    const rs = await this.runEngineCall({
      method: this.getDocument.name,
      run: async () => {
        const document = (await this.client.index(collection).getDocument(id)) as T;
        return document;
      },
      tolerate: this.notFoundTolerance({
        method: this.getDocument.name,
        subject: `Document '${id}' in collection '${collection}'`,
      }),
    });

    return rs;
  }

  /** Exact and uncapped: `pagination.maxTotalHits` bounds the SEARCH route only, so `total` from `documents/fetch` never lies on large filtered sets. */
  async countDocuments(opts: { collection: string; filterBy?: string }): Promise<number> {
    const { collection, filterBy } = opts;
    this.assertNonEmpty({
      value: collection,
      name: 'collection',
      method: this.countDocuments.name,
    });

    const rs = await this.runEngineCall({
      method: this.countDocuments.name,
      run: async () => {
        const params: Record<string, unknown> = { limit: 0 };

        if (filterBy) {
          params['filter'] = filterBy;
        }

        const page = await this.client.index(collection).getDocuments(params);
        return page.total;
      },
    });

    return rs;
  }

  /** Create-only per the neutral contract. `addDocuments` is add-or-REPLACE, so the id is checked first; that check is NOT atomic - concurrent creates can both pass it and the second write wins. Use `upsert` for last-write-wins. */
  async createDocument<T extends object>(opts: { collection: string; document: T }): Promise<T> {
    const { collection, document } = opts;
    this.assertNonEmpty({
      value: collection,
      name: 'collection',
      method: this.createDocument.name,
    });

    const primaryKey = await this.resolvePrimaryKey({ collection });
    const id = (document as Record<string, unknown>)[primaryKey];

    if (id !== undefined && (await this.documentExists({ collection, id: String(id) }))) {
      throw getError({
        error: SearchErrors.ALREADY_EXISTS,
        message: `[${this.createDocument.name}] Document '${String(id)}' already exists in collection '${collection}'.`,
      });
    }

    return this.upsertDocument(opts);
  }

  private async documentExists(opts: { collection: string; id: string }): Promise<boolean> {
    const { collection, id } = opts;

    const rs = await this.runEngineCall({
      method: this.documentExists.name,
      run: async () => {
        await this.client.index(collection).getDocument(id);
        return true;
      },
      tolerate: this.notFoundFallback({
        method: this.documentExists.name,
        message: 'Document not found, treating as absent | collection: %s | id: %s',
        args: [collection, id],
        fallback: false,
      }),
    });

    return rs;
  }

  /** Add-or-replace by primary key. Awaits the task, so the document is retrievable when this resolves. */
  async upsertDocument<T extends object>(opts: { collection: string; document: T }): Promise<T> {
    const { collection, document } = opts;
    this.assertNonEmpty({
      value: collection,
      name: 'collection',
      method: this.upsertDocument.name,
    });

    await this.runEngineCall({
      method: this.upsertDocument.name,
      run: async () => {
        await this.awaitWrite({
          method: this.upsertDocument.name,
          run: () => this.client.index(collection).addDocuments([document]),
        });
      },
    });

    return document;
  }

  /** Merge-update by primary key, preserving absent patch fields. The write returns only a task, so the merged document is read back - NOT atomic: a concurrent write between task success and read-back means the return is not necessarily what this call wrote. */
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

    const primaryKey = await this.resolvePrimaryKey({ collection });

    // Meilisearch's updateDocuments is add-or-update, so a missing id would silently upsert while the neutral contract (and Typesense) throws 404 - existence is checked before any write.
    if (!(await this.documentExists({ collection, id }))) {
      SearchConnectorInternal.throwNotFoundError({
        method: this.updateDocument.name,
        subject: `Document '${id}' in collection '${collection}'`,
      });
    }

    await this.runEngineCall({
      method: this.updateDocument.name,
      // `[primaryKey]: id` last: the path id is authoritative, so a patch carrying its own primary key cannot redirect the write onto a different row.
      run: () =>
        this.awaitWrite({
          method: this.updateDocument.name,
          run: () =>
            this.client.index(collection).updateDocuments([{ ...document, [primaryKey]: id }]),
        }),
    });

    return this.getDocument<T>({ collection, id });
  }

  /** No native update-by-filter (`documents/edit` is experimental and buggy), so ids are paged out of the uncapped `documents/fetch` route and merged back in batches. NOT atomic: a concurrent write to a matched document may be overwritten. */
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

    const primaryKey = await this.resolvePrimaryKey({ collection });

    const rs = await this.runEngineCall({
      method: this.updateByFilter.name,
      run: async () => {
        const ids = await this.collectMatchingIds({ collection, filterBy, primaryKey });

        for (let index = 0; index < ids.length; index += MEILISEARCH_DEFAULT_UPDATE_BATCH_SIZE) {
          const batch = ids.slice(index, index + MEILISEARCH_DEFAULT_UPDATE_BATCH_SIZE);
          // `[primaryKey]: id` last: each matched row keeps its own id even if the patch carries one.
          const documents = batch.map(id => ({ ...document, [primaryKey]: id }));
          await this.awaitWrite({
            method: this.updateByFilter.name,
            run: () => this.client.index(collection).updateDocuments(documents),
          });
        }

        this.logger
          .for(this.updateByFilter.name)
          .info('Updated documents by filter | collection: %s | count: %s', collection, ids.length);

        return { updatedCount: ids.length };
      },
    });

    return rs;
  }

  /** Walks `documents/fetch` until exhausted. Not bounded by `pagination.maxTotalHits`. */
  private async fetchAllDocuments(opts: {
    collection: string;
    filterBy?: string;
    fields?: string[];
  }): Promise<unknown[]> {
    const { collection, filterBy, fields } = opts;
    const rows: unknown[] = [];
    let offset = 0;

    for (;;) {
      const params: Record<string, unknown> = {
        limit: MEILISEARCH_DEFAULT_FETCH_PAGE_SIZE,
        offset,
      };

      if (filterBy) {
        params['filter'] = filterBy;
      }

      if (fields?.length) {
        params['fields'] = fields;
      }

      const page = await this.client.index(collection).getDocuments(params);
      rows.push(...page.results);

      offset += MEILISEARCH_DEFAULT_FETCH_PAGE_SIZE;

      if (offset >= page.total || page.results.length === 0) {
        return rows;
      }
    }
  }

  private async collectMatchingIds(opts: {
    collection: string;
    filterBy: string;
    primaryKey: string;
  }): Promise<string[]> {
    const { collection, filterBy, primaryKey } = opts;
    const ids: string[] = [];

    const rows = await this.fetchAllDocuments({
      collection,
      filterBy,
      fields: [primaryKey],
    });

    for (const row of rows) {
      if (isRecord(row) && row[primaryKey] !== undefined) {
        ids.push(String(row[primaryKey]));
      }
    }

    return ids;
  }

  async deleteDocument(opts: { collection: string; id: string }): Promise<boolean> {
    const { collection, id } = opts;

    const rs = await this.runEngineCall({
      method: this.deleteDocument.name,
      run: async () => {
        await this.awaitWrite({
          method: this.deleteDocument.name,
          run: () => this.client.index(collection).deleteDocument(id),
        });
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

  /** Native delete-by-filter; count is read from the FINISHED task's `details.deletedDocuments` because a pre-count would be wrong under concurrent writes. */
  async deleteByFilter(opts: { collection: string; filterBy: string }): Promise<number> {
    const { collection, filterBy } = opts;
    this.assertNonEmpty({ value: filterBy, name: 'filterBy', method: this.deleteByFilter.name });

    const rs = await this.runEngineCall({
      method: this.deleteByFilter.name,
      run: async () => {
        const task = await this.awaitWrite({
          method: this.deleteByFilter.name,
          run: () => this.client.index(collection).deleteDocuments({ filter: filterBy }),
        });

        const deleted = task.details?.['deletedDocuments'];

        if (typeof deleted !== 'number') {
          throw getError({
            message: `[${this.deleteByFilter.name}] Task ${task.taskUid} reported no deletedDocuments count | collection: ${collection}`,
          });
        }

        return deleted;
      },
    });

    return rs;
  }

  async deleteAllDocuments(opts: { collection: string }): Promise<boolean> {
    const { collection } = opts;

    const rs = await this.runEngineCall({
      method: this.deleteAllDocuments.name,
      run: async () => {
        await this.awaitWrite({
          method: this.deleteAllDocuments.name,
          run: () => this.client.index(collection).deleteAllDocuments(),
        });
        return true;
      },
    });

    return rs;
  }

  /** Re-throws an import failure with partial progress attached. An error the framework already shaped (waitForTask's 504 task_timeout, its task-failed 503, a sanitized 4xx) keeps its statusCode/messageCode - re-wrapping would erase those semantics behind a generic 503, so progress is merged onto it instead. */
  private throwImportFailure(opts: {
    error: unknown;
    details: { totalCount: number; processedCount: number };
  }): never {
    const { error, details } = opts;

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

  /** Batches through addDocuments, awaiting each task. Import is batch-atomic, so `count.fail` is always 0 - a batch lands whole or throws, and a thrown import carries `processedCount` in the error's `details` so callers can resume past the batches that already landed. */
  async importDocuments<T extends object>(opts: {
    collection: string;
    documents: T[];
    batchSize?: number;
  }): Promise<IImportResult<unknown>> {
    const { collection, documents, batchSize } = opts;
    const size = batchSize ?? MEILISEARCH_DEFAULT_UPDATE_BATCH_SIZE;

    const rs = await this.runEngineCall({
      method: this.importDocuments.name,
      run: async () => {
        const responses: unknown[] = [];
        let processedCount = 0;

        for (let index = 0; index < documents.length; index += size) {
          const batch = documents.slice(index, index + size);

          try {
            const task = await this.awaitWrite({
              method: this.importDocuments.name,
              run: () => this.client.index(collection).addDocuments(batch),
            });
            responses.push(task);
            processedCount += batch.length;
          } catch (error) {
            // Earlier batches are already persisted server-side, so EVERY failure carries partial progress - callers decide to resume from processedCount or retry the whole import.
            this.throwImportFailure({
              error,
              details: { totalCount: documents.length, processedCount },
            });
          }
        }

        this.logger
          .for(this.importDocuments.name)
          .info('Imported documents | collection: %s | ok: %s', collection, documents.length);

        // A task that did not succeed already threw, so every document in a resolved import landed.
        return { count: { success: documents.length, fail: 0 }, responses };
      },
    });

    return rs;
  }

  /** Newline-delimited JSON, matching the Typesense connector's export contract. */
  async exportDocuments(opts: {
    collection: string;
    filterBy?: string;
    includeFields?: string[];
  }): Promise<string> {
    const { collection, filterBy, includeFields } = opts;

    const rs = await this.runEngineCall({
      method: this.exportDocuments.name,
      run: async () => {
        // Pages to exhaustion: a single fetch would silently truncate at the page size, which for an export - the primitive people back up and reindex with - is data loss without an error.
        const rows = await this.fetchAllDocuments({
          collection,
          ...(filterBy ? { filterBy } : {}),
          ...(includeFields?.length ? { fields: includeFields } : {}),
        });

        return rows.map(row => JSON.stringify(row)).join('\n');
      },
    });

    return rs;
  }

  async search<TDocument extends object = object>(opts: {
    collection: string;
    params: unknown;
  }): Promise<ISearchResult<TDocument>> {
    const { collection, params } = opts;

    const rs = await this.runEngineCall({
      method: this.search.name,
      run: async () => {
        const wire = isRecord(params) ? params : {};
        const { q, ...rest } = wire;
        const raw = await this.client
          .index(collection)
          .search(typeof q === 'string' && q !== '*' ? q : null, rest);
        return mapSearchResult<TDocument>(raw);
      },
      tolerate: {
        when: error => MeilisearchInternal.isNotFoundError({ error }),
        handle: () => {
          this.logger
            .for(this.search.name)
            .warn('Search on missing collection, returning empty | name: %s', collection);
          return { found: 0, isFoundExact: true, hits: [] };
        },
      },
    });

    return rs;
  }

  /** Batched, non-federated: N queries in one round trip, N result sets back. `commonParams` are defaults - a per-query param always wins over them, so a query's own `q` is never clobbered. */
  async multiSearch(opts: {
    searches: unknown[];
    union?: boolean;
    commonParams?: unknown;
    options?: unknown;
  }): Promise<unknown> {
    const { searches, union: isUnion, commonParams, options } = opts;

    if (isUnion) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.NotImplemented,
        messageCode: CoreErrorCodes.NOT_SUPPORTED,
        message: `[${MeilisearchConnector.name}] Union multi-search is not supported - Meilisearch merges results through its federation option, which this connector does not model.`,
      });
    }

    const rs = await this.runEngineCall({
      method: this.multiSearch.name,
      run: () => {
        const common = isRecord(commonParams) ? commonParams : {};

        const queries = searches.filter(isRecord).map(entry => {
          const { collection, ...rest } = entry;

          // `common` first: a per-query param overrides the shared default, never the reverse.
          return { indexUid: collection, q: '', ...common, ...rest };
        });

        return this.client.multiSearch({ queries, ...(isRecord(options) ? options : {}) });
      },
    });

    return rs;
  }

  /** Meilisearch infers the primary key from the first document; the compiler pins it, and the index reports it. */
  private async resolvePrimaryKey(opts: { collection: string }): Promise<string> {
    const { collection } = opts;
    const cached = this.primaryKeyByCollection.get(collection);

    if (cached) {
      return cached;
    }

    // Wrapped so a raw getIndex failure is sanitized here rather than escaping through whichever write triggered the lookup and leaking engine detail.
    const index = await this.runEngineCall({
      method: this.resolvePrimaryKey.name,
      run: () => this.client.getIndex(collection),
    });
    const primaryKey = isRecord(index) ? index['primaryKey'] : undefined;

    if (typeof primaryKey !== 'string' || primaryKey.length === 0) {
      throw getError({
        message: `[${this.resolvePrimaryKey.name}] Collection '${collection}' has no primary key - Meilisearch cannot merge-update without one.`,
      });
    }

    this.primaryKeyByCollection.set(collection, primaryKey);
    return primaryKey;
  }
}
