import type { ISynonym } from '@/connectors/search/models';
import type { ValueOrPromise } from '@venizia/ignis-helpers';
import { BaseHelper, getError, isApplicationError } from '@venizia/ignis-helpers';
import { SearchConnectorInternal } from './internal';

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

/** Search-response envelope, read without a boundary cast. `score` scales are unrelated across engines - never compare or threshold one against another; `isFoundExact` is false when `found` is approximate. */
export interface ISearchResult<
  DocumentType extends object = object,
  HighlightType = unknown,
  FacetCountType = unknown,
  GroupedHitType = unknown,
> {
  found: number;
  isFoundExact: boolean;
  outOf?: number;
  searchTimeMs?: number;
  hits?: Array<{
    document: DocumentType;
    highlight?: HighlightType;
    highlights?: HighlightType[];
    score?: number;
  }>;
  facetCounts?: FacetCountType[];
  groupedHits?: GroupedHitType[];
}

// Schema/field types are engine-specific, not caller-owned - hence interface-level generics filled by the engine's connector, defaulting to `unknown` so `ISearchConnector` stays engine-agnostic.
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

/** A named pointer to one physical collection. Engines without aliases omit this group entirely. */
export interface ISearchAliasScoped {
  upsert(opts: { name: string; collection: string }): Promise<void>;
  get(opts: { name: string }): Promise<IAliasInfo | null>;
}

/** Atomic exchange of two collections' documents and settings - the alias-less path to a zero-downtime reindex. */
export interface ISearchSwapScoped {
  indexes(opts: { pairs: Array<[string, string]> }): Promise<void>;
}

// Synonym SETS (Typesense v30+): a named item set linked to one or more collections; `ISynonym` is the item shape.
export interface ISearchSynonymSetScoped {
  upsert(opts: { name: string; items: ISynonym[] }): Promise<void>;
  get(opts: { name: string }): Promise<ISynonym[] | null>;
  list(): Promise<string[]>;
  delete(opts: { name: string }): Promise<boolean>;
  link(opts: { collection: string; synonymSets: string[] }): Promise<void>;
}

/** A flat per-collection synonym dictionary - no named, linkable set resource. */
export interface ISearchSynonymScoped {
  set(opts: { collection: string; items: ISynonym[] }): Promise<void>;
  get(opts: { collection: string }): Promise<ISynonym[]>;
  reset(opts: { collection: string }): Promise<void>;
}

export interface ISearchDocumentScoped {
  get<T extends object>(opts: { collection: string; id: string }): Promise<T>;

  /** Exact count of documents matching `filterBy`. Engines whose search endpoint caps or estimates its total must answer from a document-listing endpoint instead. */
  count(opts: { collection: string; filterBy?: string }): Promise<number>;

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

/** The verb contract every search engine implements - an interface so tests can fake it clientless. `collection`/`document` are the true intersection; `alias`/`synonymSet`/`synonyms`/`swap` are optional since no engine has all four, so agnostic callers must write `connector.alias?.…`. */
export interface ISearchConnector {
  getHealth(): Promise<{ ok: boolean }>;
  ping(): Promise<boolean>;

  collection: ISearchCollectionScoped;
  document: ISearchDocumentScoped;

  alias?: ISearchAliasScoped;
  synonymSet?: ISearchSynonymSetScoped;
  synonyms?: ISearchSynonymScoped;
  swap?: ISearchSwapScoped;

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

      // A framework ApplicationError is already sanitized and carries its own statusCode/messageCode; only raw engine failures may be wrapped as a generic 503.
      if (isApplicationError(error)) {
        throw error;
      }

      SearchConnectorInternal.wrapDependencyError({ method, error, logger: this.logger });
    }
  }

  /** Which errors mean "not found" is engine-specific classification; the sanitized throw and the benign fallback are not. */
  protected abstract isNotFoundError(opts: { error: unknown }): boolean;

  /** Tolerated-404 branch shared by getCollection/patchCollectionSchema/getDocument/updateDocument: throws the sanitized not-found error. */
  protected notFoundTolerance(opts: { method: string; subject: string }): {
    when: (error: unknown) => boolean;
    handle: (error: unknown) => never;
  } {
    const { method, subject } = opts;

    return {
      when: error => this.isNotFoundError({ error }),
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
      when: error => this.isNotFoundError({ error }),
      handle: () => {
        this.logger.for(method).debug(message, ...(args ?? []));
        return fallback;
      },
    };
  }

  abstract getHealth(): Promise<{ ok: boolean }>;

  // Resource-scoped verb groups, each supplied by the concrete connector as a facade object; only the intersection is abstract - an engine declares its own alias/synonymSet/synonyms/swap.
  abstract collection: ISearchCollectionScoped;
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
