import { getError } from '@venizia/ignis-helpers';

import { model } from '@/base/metadata';
import { TypesenseDataSource } from '@/connectors/typesense/datasources';
import { TypesenseConnector } from '@/connectors/typesense/connector';
import {
  IImportResult,
  ISearchAliasScoped,
  ISearchCollectionScoped,
  ISearchConnector,
  ISearchDocumentScoped,
  ISearchResult,
  ISearchSynonymSetScoped,
} from '@/connectors/search';
import {
  BaseSearchEntity,
  defineSearchCollection,
  field,
  ISynonym,
} from '@/connectors/search/models';
import { ITypesenseDataSourceSettings } from '@/connectors/typesense/types';

/** Records every connector call and serves canned responses; shared across the repository test suites so the fake stays in one place. */
export class FakeSearchEngineHelper implements ISearchConnector {
  searchCalls: Array<{ collection: string; params: unknown; options?: unknown }> = [];
  searchResponse: ISearchResult = { found: 0, isFoundExact: true, hits: [] };
  documents: Record<string, unknown> = {};

  createDocumentCalls: Array<{ collection: string; document: unknown }> = [];
  updateDocumentCalls: Array<{ collection: string; id: string; document: unknown }> = [];

  deleteDocumentCalls: Array<{ collection: string; id: string }> = [];
  deleteDocumentResult = true;

  importDocumentsCalls: Array<{
    collection: string;
    documents: unknown[];
    batchSize?: number;
    action?: string;
  }> = [];
  importDocumentsResponse: IImportResult<unknown> = {
    count: { success: 0, fail: 0 },
    responses: [],
  };

  updateByFilterCalls: Array<{ collection: string; document: unknown; filterBy: string }> = [];
  updateByFilterResponse: { updatedCount: number } = { updatedCount: 0 };

  deleteByFilterCalls: Array<{ collection: string; filterBy: string }> = [];
  deleteByFilterResponse = 0;

  deleteAllDocumentsCalls: Array<{ collection: string }> = [];
  deleteAllDocumentsResponse = true;

  countDocumentsCalls: Array<{ collection: string; filterBy?: string }> = [];
  countDocumentsResponse = 0;

  readonly collection: ISearchCollectionScoped = {
    create: () => this.createCollection(),
    ensure: () => this.ensureCollection(),
    get: () => this.getCollection(),
    list: () => this.listCollections(),
    exists: () => this.collectionExists(),
    patchSchema: () => this.patchCollectionSchema(),
    delete: () => this.deleteCollection(),
  };

  readonly alias: ISearchAliasScoped = {
    upsert: () => this.upsertAlias(),
    get: () => this.getAlias(),
  };

  readonly synonymSet: ISearchSynonymSetScoped = {
    upsert: () => this.upsertSynonymSet(),
    get: () => this.getSynonymSet(),
    list: () => this.listSynonymSets(),
    delete: () => this.deleteSynonymSet(),
    link: () => this.linkSynonymSets(),
  };

  readonly document: ISearchDocumentScoped = {
    create: opts => this.createDocument(opts),
    get: opts => this.getDocument(opts),
    count: opts => this.countDocuments(opts),
    upsert: opts => this.upsertDocument(opts),
    update: opts => this.updateDocument(opts),
    delete: opts => this.deleteDocument(opts),
    import: opts => this.importDocuments(opts),
    updateBy: opts => this.updateByFilter(opts),
    deleteBy: opts => this.deleteByFilter(opts),
    deleteAll: opts => this.deleteAllDocuments(opts),
    export: () => this.exportDocuments(),
  };

  async getHealth(): Promise<{ ok: boolean }> {
    return { ok: true };
  }

  async ping(): Promise<boolean> {
    return true;
  }

  async createCollection(): Promise<void> {}

  async ensureCollection(): Promise<never> {
    throw getError({
      message: '[FakeSearchEngineHelper][ensureCollection] Not needed for this test',
    });
  }

  async getCollection(): Promise<never> {
    throw getError({ message: '[FakeSearchEngineHelper][getCollection] Not needed for this test' });
  }

  async listCollections(): Promise<never[]> {
    return [];
  }

  async collectionExists(): Promise<boolean> {
    return true;
  }

  async patchCollectionSchema(): Promise<void> {}

  async deleteCollection(): Promise<boolean> {
    return true;
  }

  async upsertAlias(): Promise<void> {}

  async getAlias(): Promise<null> {
    return null;
  }

  async upsertSynonymSet(): Promise<void> {
    return undefined;
  }

  async getSynonymSet(): Promise<ISynonym[] | null> {
    return null;
  }

  async listSynonymSets(): Promise<string[]> {
    return [];
  }

  async deleteSynonymSet(): Promise<boolean> {
    return true;
  }

  async linkSynonymSets(): Promise<void> {
    return undefined;
  }

  async createDocument<T extends object>(opts: { collection: string; document: T }): Promise<T> {
    this.createDocumentCalls.push(opts);
    return opts.document;
  }

  async getDocument<T extends object>(opts: { collection: string; id: string }): Promise<T> {
    const document = this.documents[opts.id];

    if (!document) {
      throw getError({
        statusCode: 404,
        messageCode: 'core.search_engine.not_found',
        message: `[getDocument] ${opts.id} not found.`,
      });
    }

    return document as T;
  }

  async countDocuments(opts: { collection: string; filterBy?: string }): Promise<number> {
    this.countDocumentsCalls.push(opts);
    return this.countDocumentsResponse;
  }

  async upsertDocument<T extends object>(opts: { collection: string; document: T }): Promise<T> {
    return opts.document;
  }

  async updateDocument<T extends object>(opts: {
    collection: string;
    id: string;
    document: Partial<T>;
  }): Promise<T> {
    this.updateDocumentCalls.push(opts);
    return opts.document as T;
  }

  async deleteDocument(opts: { collection: string; id: string }): Promise<boolean> {
    this.deleteDocumentCalls.push(opts);
    return this.deleteDocumentResult;
  }

  async importDocuments<T extends object>(opts: {
    collection: string;
    documents: T[];
    batchSize?: number;
    action?: string;
  }): Promise<IImportResult<T>> {
    this.importDocumentsCalls.push(opts);
    return this.importDocumentsResponse as IImportResult<T>;
  }

  async updateByFilter<T extends object>(opts: {
    collection: string;
    document: Partial<T>;
    filterBy: string;
  }): Promise<{ updatedCount: number }> {
    this.updateByFilterCalls.push(opts);
    return this.updateByFilterResponse;
  }

  async deleteByFilter(opts: { collection: string; filterBy: string }): Promise<number> {
    this.deleteByFilterCalls.push(opts);
    return this.deleteByFilterResponse;
  }

  async deleteAllDocuments(opts: { collection: string }): Promise<boolean> {
    this.deleteAllDocumentsCalls.push(opts);
    return this.deleteAllDocumentsResponse;
  }

  async exportDocuments(): Promise<string> {
    return '';
  }

  async search<TDocument extends object = object>(opts: {
    collection: string;
    params: unknown;
    options?: unknown;
  }): Promise<ISearchResult<TDocument>> {
    this.searchCalls.push(opts);
    // Cast to the caller's generic; searchResponse only carries a loose runtime shape.
    return this.searchResponse as ISearchResult<TDocument>;
  }

  async multiSearch(): Promise<never> {
    throw getError({ message: '[FakeSearchEngineHelper][multiSearch] Not needed for this test' });
  }
}

/** Canned, never-dialed settings - the fake connector is always injected below, so `configure()`'s
 * real Typesense-client construction path never runs; this only exists to satisfy the type. */
const FAKE_TYPESENSE_SETTINGS: ITypesenseDataSourceSettings = {
  nodes: [{ host: 'localhost', port: 8108 }],
  apiKey: 'fake-api-key',
};

/**
 * Real `TypesenseDataSource` with its connector swapped for `FakeSearchEngineHelper`, keeping
 * `dataSource.getConnector()` typed as `TypesenseConnector` without a live Typesense server.
 */
export class FakeSearchDataSource extends TypesenseDataSource {
  readonly fakeConnector = new FakeSearchEngineHelper();

  constructor(opts: { name: string; config?: {}; autoProvision?: boolean }) {
    super({
      name: opts.name,
      config: FAKE_TYPESENSE_SETTINGS,
      autoProvision: opts.autoProvision ?? false,
    });
  }

  override getConnector(): TypesenseConnector {
    // TypesenseConnector is a concrete class with a private `client` field, so no ISearchConnector
    // implementer can be structurally assignable to it - this boundary cast is unavoidable.
    return this.fakeConnector as any;
  }
}

/** Shared fixture entity - `isActive: true` default filter + a `secret` hidden field. */
@model({
  type: 'entity',
  tableName: 'products',
  settings: {
    hiddenProperties: ['secret'],
    defaultFilter: { where: { isActive: true } },
  },
})
export class ProductDocument extends BaseSearchEntity {
  static override schema = defineSearchCollection({
    name: 'products',
    fields: [field.string('title', { searchable: true }), field.string('secret')],
  });
}

/** Same shape as `ProductDocument` but with no `defaultFilter` - for truncate-path tests. */
@model({
  type: 'entity',
  tableName: 'products_no_default_filter',
  settings: {
    hiddenProperties: ['secret'],
  },
})
export class ProductDocumentNoDefaultFilter extends BaseSearchEntity {
  static override schema = defineSearchCollection({
    name: 'products_no_default_filter',
    fields: [field.string('title', { searchable: true }), field.string('secret')],
  });
}

/** Same shape as `ProductDocument` but with an explicit `defaultLimit`. */
@model({
  type: 'entity',
  tableName: 'products_with_default_limit',
  settings: {
    defaultLimit: 5,
  },
})
export class ProductDocumentWithDefaultLimit extends BaseSearchEntity {
  static override schema = defineSearchCollection({
    name: 'products_with_default_limit',
    fields: [field.string('title', { searchable: true })],
  });
}
