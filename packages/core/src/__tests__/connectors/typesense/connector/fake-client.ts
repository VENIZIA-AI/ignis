// Minimal hand-rolled stand-in for the Typesense Client surface the connector uses: records calls and returns programmed responses or injected errors.

import type { ITypesenseClientLike } from '@/connectors/typesense/connector';
import { TypesenseConnector } from '@/connectors/typesense/connector';

export interface IFakeBehavior {
  health?: { ok: boolean };
  collectionsList?: unknown[];
  collectionByName?: Record<string, unknown>;
  existsByName?: Record<string, boolean>;
  documentById?: Record<string, unknown>;
  searchResult?: unknown;
  multiSearchResult?: unknown;
  importResponse?: Array<{ success: boolean }>;
  exportResult?: string;
  numDeleted?: number;
  numUpdated?: number;
  aliasByName?: Record<string, Record<string, string>>;
  synonymSetByName?: Record<
    string,
    { name: string; items: Array<{ id: string; synonyms: string[]; root?: string }> }
  >;
  synonymSetsList?: Array<{ name: string }>;
  // Inject an error keyed by operation name to exercise error paths.
  throwOn?: Partial<Record<string, unknown>>;
  // Inject an error on the Nth documents.import call (0-based) to exercise partial-batch failures.
  importBatchErrors?: Record<number, unknown>;
}

export interface IFakeCall {
  op: string;
  args: unknown[];
}

export const createFakeClient = (behavior: IFakeBehavior = {}) => {
  const calls: IFakeCall[] = [];
  let importCallCount = 0;
  const record = (op: string, ...args: unknown[]) => {
    calls.push({ op, args });
  };
  const maybeThrow = (op: string) => {
    if (behavior.throwOn && op in behavior.throwOn) {
      throw behavior.throwOn[op];
    }
  };

  const documents = (name: string, id?: string) => ({
    create: async (doc: unknown) => {
      record('documents.create', name, doc);
      maybeThrow('documents.create');
      return doc;
    },
    upsert: async (doc: unknown) => {
      record('documents.upsert', name, doc);
      maybeThrow('documents.upsert');
      return doc;
    },
    retrieve: async () => {
      record('documents.retrieve', name, id);
      maybeThrow('documents.retrieve');
      return behavior.documentById?.[id ?? ''] ?? {};
    },
    update: async (patch: unknown, params?: unknown) => {
      record('documents.update', name, id, patch, params);
      maybeThrow('documents.update');
      // Batch update (no id) returns { num_updated }; single update returns the patch.
      if (id === undefined) {
        const result: Record<string, unknown> = {};
        result['num_updated'] = behavior.numUpdated ?? 0;
        return result;
      }
      return patch;
    },
    delete: async (params?: unknown) => {
      record('documents.delete', name, id, params);
      maybeThrow('documents.delete');
      if (id === undefined) {
        const result: Record<string, unknown> = {};
        result['num_deleted'] = behavior.numDeleted ?? 0;
        return result;
      }
      return { id };
    },
    import: async (docs: unknown[], params?: unknown) => {
      record('documents.import', name, docs, params);
      const batchIndex = importCallCount;
      importCallCount += 1;
      if (behavior.importBatchErrors && batchIndex in behavior.importBatchErrors) {
        throw behavior.importBatchErrors[batchIndex];
      }
      maybeThrow('documents.import');
      return behavior.importResponse ?? docs.map(() => ({ success: true }));
    },
    search: async (params: unknown, options?: unknown) => {
      record('documents.search', name, params, options);
      maybeThrow('documents.search');
      return behavior.searchResult ?? { found: 0, hits: [] };
    },
    export: async (params?: unknown) => {
      record('documents.export', name, params);
      maybeThrow('documents.export');
      return behavior.exportResult ?? '';
    },
  });

  const synonymSets = (setName?: string) => ({
    upsert: async (params: unknown) => {
      record('synonymSets.upsert', setName, params);
      maybeThrow('synonymSets.upsert');
      return { name: setName, ...(params as object) };
    },
    retrieve: async () => {
      record('synonymSets.retrieve', setName);
      maybeThrow('synonymSets.retrieve');
      if (setName === undefined) {
        return behavior.synonymSetsList ?? [];
      }
      return behavior.synonymSetByName?.[setName];
    },
    delete: async () => {
      record('synonymSets.delete', setName);
      maybeThrow('synonymSets.delete');
      return { name: setName };
    },
  });

  const collections = (name?: string) => ({
    create: async (schema: unknown) => {
      record('collections.create', schema);
      maybeThrow('collections.create');
      return schema;
    },
    retrieve: async () => {
      record('collections.retrieve', name);
      maybeThrow('collections.retrieve');
      if (name === undefined) {
        return behavior.collectionsList ?? [];
      }
      return behavior.collectionByName?.[name] ?? { name };
    },
    exists: async () => {
      record('collections.exists', name);
      maybeThrow('collections.exists');
      return behavior.existsByName?.[name ?? ''] ?? false;
    },
    delete: async () => {
      record('collections.delete', name);
      maybeThrow('collections.delete');
      return { name };
    },
    update: async (schema: unknown) => {
      record('collections.update', name, schema);
      maybeThrow('collections.update');
      return schema;
    },
    documents: (id?: string) => documents(name ?? '', id),
  });

  const aliases = (name?: string) => ({
    upsert: async (aliasName: string, mapping: unknown) => {
      record('aliases.upsert', aliasName, mapping);
      maybeThrow('aliases.upsert');
      return mapping;
    },
    retrieve: async () => {
      record('aliases.retrieve', name);
      maybeThrow('aliases.retrieve');
      return behavior.aliasByName?.[name ?? ''];
    },
  });

  const client: ITypesenseClientLike = {
    health: {
      retrieve: async () => {
        record('health.retrieve');
        maybeThrow('health.retrieve');
        return behavior.health ?? { ok: true };
      },
    },
    multiSearch: {
      perform: async (reqs: unknown, common?: unknown, options?: unknown) => {
        record('multiSearch.perform', reqs, common, options);
        maybeThrow('multiSearch.perform');

        if (behavior.multiSearchResult !== undefined) {
          return behavior.multiSearchResult;
        }

        // `search()` reaches the engine through this endpoint now, so a programmed `searchResult`
        // is served as a one-entry-per-window envelope. Tests asserting RESPONSE MAPPING keep
        // asserting exactly what they did before, without being rewritten to restate transport.
        const entries = ((reqs as { searches?: unknown[] })?.searches ?? [{}]) as unknown[];
        const single = behavior.searchResult ?? { found: 0, hits: [] };

        return { results: entries.map(() => single) };
      },
    },
    collections,
    aliases,
    synonymSets,
  };

  return { client, calls };
};

// Shared connector-construction fixture - the single source of truth for test suites; do NOT re-declare per test file, copies drift.
export const makeHelper = (behavior: IFakeBehavior = {}) => {
  const fake = createFakeClient(behavior);
  const helper = new TypesenseConnector({
    name: 'test',
    nodes: [{ host: 'localhost', port: 8108 }],
    apiKey: 'k',
    client: fake.client,
  });
  return { helper, fake };
};
