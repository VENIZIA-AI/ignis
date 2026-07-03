import { ValueOrPromise } from '@/common/types';
import { BaseHelper } from '@/modules/base';
import { getError } from '@/modules/error';
import { SearchEngineInternal } from './internal';
import { IAliasInfo, IImportResult, ISearchEngineHelper, ISearchEngineTypeMap } from './types';

export abstract class BaseSearchEngineHelper<
  TMap extends ISearchEngineTypeMap = ISearchEngineTypeMap,
>
  extends BaseHelper
  implements ISearchEngineHelper<TMap>
{
  constructor(opts: { scope: string; identifier: string }) {
    super(opts);
  }

  // Shared: derive readiness from the engine-specific health probe.
  async ping(): Promise<boolean> {
    const health = await this.getHealth();
    return health.ok;
  }

  // Shared guard for collection name / document id.
  protected assertNonEmpty(opts: { value?: string | null; name: string }): void {
    const { value, name } = opts;
    if (!value || value.trim().length === 0) {
      throw getError({ message: `[assertNonEmpty] Missing or empty value | name: ${name}` });
    }
  }

  // Shared engine-call wrapper: runs the engine verb, routes tolerated errors (benign 404/409
  // shapes) to the caller-provided branch, and wraps everything else as a sanitized 503 with the
  // full detail logged internally. `tolerate.handle` may return a fallback value or throw a more
  // precise error (e.g. a sanitized 404).
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

      SearchEngineInternal.wrapDependencyError({ method, error, logger: this.logger });
    }
  }

  // Engine-specific verbs.
  abstract getHealth(): Promise<{ ok: boolean }>;

  abstract createCollection(opts: { schema: TMap['schema'] }): Promise<TMap['collection'] | void>;
  abstract ensureCollection(opts: { schema: TMap['schema'] }): Promise<TMap['collection']>;
  abstract getCollection(opts: { name: string }): Promise<TMap['collection']>;
  abstract listCollections(): Promise<TMap['collection'][]>;
  abstract collectionExists(opts: { name: string }): Promise<boolean>;
  abstract patchCollectionSchema(opts: { name: string; fields: TMap['field'][] }): Promise<void>;
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
  // Engine-specific import tuning (e.g. typesense's action/dirtyValues) lives on each backend's
  // widened override, NOT in this engine-agnostic contract.
  abstract importDocuments<T extends object>(opts: {
    collection: string;
    documents: T[];
    batchSize?: number;
  }): Promise<IImportResult<TMap['importResponse']>>;
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

  abstract search(opts: {
    collection: string;
    params: TMap['searchParams'];
  }): Promise<TMap['searchResult']>;
  abstract multiSearch(opts: {
    searches: TMap['multiSearchRequest'][];
    commonParams?: Partial<TMap['searchParams']>;
  }): Promise<TMap['multiSearchResult']>;
}
