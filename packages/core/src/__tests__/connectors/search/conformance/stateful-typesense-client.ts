import type { AnyType } from '@venizia/ignis-helpers';
import { getError } from '@venizia/ignis-helpers';
import type { ITypesenseClientLike } from '@/connectors/typesense/connector';

interface IFakeCollection {
  name: string;
  documents: Map<string, Record<string, unknown>>;
}

/** Mirrors Typesense's not-found error shape so `TypesenseInternal` classifies it. */
const notFoundError = (message: string): Error => {
  const error = new Error(message) as Error & { httpStatus: number };
  error.httpStatus = 404;
  return error;
};

/** Typesense answers a duplicate-id create with 409 Conflict. */
const conflictError = (message: string): Error => {
  const error = new Error(message) as Error & { httpStatus: number };
  error.httpStatus = 409;
  return error;
};

/** Minimal `filter_by` evaluator (`score:>N`, `score:>=N`): the connector only forwards filters, never parses them, so the parsing belongs here on purpose. */
const matchesFilter = (opts: { document: Record<string, unknown>; filter: string }): boolean => {
  const match = /^(\w+):(>=|<=|!=|>|<|=)(.+)$/.exec(opts.filter.trim());

  if (!match) {
    throw getError({
      message: `[StatefulFakeTypesenseClient] Unsupported filter | ${opts.filter}`,
    });
  }

  const [, field, operator, rawValue] = match;
  const unquoted = rawValue.replaceAll('`', '');
  const value = Number.isNaN(Number(unquoted)) ? unquoted : Number(unquoted);
  const actual = opts.document[field];

  switch (operator) {
    case '=': {
      return actual === value;
    }
    case '!=': {
      return actual !== value;
    }
    case '>': {
      return Number(actual) > Number(value);
    }
    case '>=': {
      return Number(actual) >= Number(value);
    }
    case '<': {
      return Number(actual) < Number(value);
    }
    case '<=': {
      return Number(actual) <= Number(value);
    }
    default: {
      throw getError({
        message: `[StatefulFakeTypesenseClient] Unsupported operator | ${operator}`,
      });
    }
  }
};

/** In-memory Typesense. Writes are synchronous and immediately visible, matching the real engine. */
export class StatefulFakeTypesenseClient implements ITypesenseClientLike {
  private readonly store = new Map<string, IFakeCollection>();

  private requireCollection(name: string): IFakeCollection {
    const collection = this.store.get(name);

    if (!collection) {
      throw notFoundError(`Collection \`${name}\` not found.`);
    }

    return collection;
  }

  private select(opts: { name: string; filter?: string }): Array<Record<string, unknown>> {
    const rows = [...this.requireCollection(opts.name).documents.values()];
    return opts.filter
      ? rows.filter(document => matchesFilter({ document, filter: opts.filter! }))
      : rows;
  }

  readonly health = {
    retrieve: async () => ({ ok: true }),
  };

  /**
   * Every search the connector issues now goes through `/multi_search`, so this has to behave like
   * the endpoint instead of returning an empty stub - a stub would let the connector's windowing
   * and merge logic pass without ever running.
   */
  readonly multiSearch = {
    perform: async (requests: AnyType) => {
      const searches = (requests?.searches ?? []) as Array<Record<string, unknown>>;

      return {
        results: searches.map(entry => {
          const name = String(entry['collection'] ?? '');
          // An unknown collection throws from `select`, failing the whole call - which is what the
          // GET path did too. Whether the real engine reports it per-entry instead is the open
          // question the connector's TODO records; this models what we can observe today.
          const rows = this.select({ name, filter: entry['filter_by'] as string | undefined });

          const perPage = entry['per_page'];
          const limit = entry['limit'];
          const offset = typeof entry['offset'] === 'number' ? entry['offset'] : 0;
          const size =
            typeof limit === 'number' ? limit : typeof perPage === 'number' ? perPage : rows.length;

          const window = size === 0 ? [] : rows.slice(offset, offset + size);

          return {
            found: rows.length,
            ['out_of']: rows.length,
            hits: window.map(document => ({ document })),
          };
        }),
      };
    },
  };

  aliases(): { upsert(name: string, mapping: unknown): Promise<unknown> };
  aliases(aliasName: string): { retrieve(): Promise<unknown> };
  aliases(aliasName?: string): AnyType {
    if (aliasName === undefined) {
      return { upsert: async () => ({}) };
    }

    return { retrieve: async () => ({ name: aliasName, ['collection_name']: aliasName }) };
  }

  synonymSets(): { retrieve(): Promise<unknown> };
  synonymSets(synonymSetName: string): {
    upsert(params: unknown): Promise<unknown>;
    retrieve(): Promise<unknown>;
    delete(): Promise<unknown>;
  };
  synonymSets(synonymSetName?: string): AnyType {
    if (synonymSetName === undefined) {
      return { retrieve: async () => [] };
    }

    return {
      upsert: async () => ({}),
      retrieve: async () => ({ name: synonymSetName, items: [] }),
      delete: async () => ({}),
    };
  }

  collections(): { create(schema: unknown): Promise<unknown>; retrieve(): Promise<unknown> };
  collections(collectionName: string): ReturnType<StatefulFakeTypesenseClient['collectionApi']>;
  collections(collectionName?: string): AnyType {
    if (collectionName === undefined) {
      return {
        create: async (schema: unknown) => {
          const { name } = schema as { name: string };
          this.store.set(name, { name, documents: new Map() });
          return schema;
        },
        retrieve: async () => [...this.store.values()].map(item => ({ name: item.name })),
      };
    }

    return this.collectionApi(collectionName);
  }

  private collectionApi(name: string) {
    const self = this;

    const documentsApi = {
      /** Typesense's create is create-only: a duplicate id is a 409, not a replace. */
      async create(document: unknown) {
        const collection = self.requireCollection(name);
        const row = document as Record<string, unknown>;
        const id = String(row['id']);

        if (collection.documents.has(id)) {
          throw conflictError(`Document with id \`${id}\` already exists.`);
        }

        collection.documents.set(id, { ...row });
        return row;
      },

      async upsert(document: unknown) {
        const collection = self.requireCollection(name);
        const row = document as Record<string, unknown>;
        collection.documents.set(String(row['id']), { ...row });
        return row;
      },

      async update(document: unknown, options: unknown) {
        const collection = self.requireCollection(name);
        const patch = document as Record<string, unknown>;
        const filter = (options as Record<string, unknown>)['filter_by'] as string | undefined;
        const matched = self.select({ name, filter });

        for (const row of matched) {
          collection.documents.set(String(row['id']), { ...row, ...patch });
        }

        return { ['num_updated']: matched.length };
      },

      async delete(query?: unknown) {
        const collection = self.requireCollection(name);
        const params = (query ?? {}) as Record<string, unknown>;

        if (params['truncate'] === true) {
          collection.documents.clear();
          return { ['num_deleted']: 0 };
        }

        const filter = params['filter_by'] as string | undefined;
        const matched = self.select({ name, filter });

        for (const row of matched) {
          collection.documents.delete(String(row['id']));
        }

        return { ['num_deleted']: matched.length };
      },

      async import(documents: unknown[]) {
        const collection = self.requireCollection(name);

        for (const raw of documents) {
          const row = raw as Record<string, unknown>;
          collection.documents.set(String(row['id']), { ...row });
        }

        return documents.map(() => ({ success: true }));
      },

      async search(searchParameters: unknown) {
        const params = (searchParameters ?? {}) as Record<string, unknown>;
        const filter = params['filter_by'] as string | undefined;
        const rows = self.select({ name, filter });
        const perPage = params['per_page'];

        return {
          found: rows.length,
          ['out_of']: rows.length,
          hits: perPage === 0 ? [] : rows.map(document => ({ document })),
        };
      },

      async export() {
        return self
          .select({ name })
          .map(row => JSON.stringify(row))
          .join('\n');
      },
    };

    const documentApi = (documentId: string) => ({
      async retrieve() {
        const document = self.requireCollection(name).documents.get(documentId);

        if (!document) {
          throw notFoundError(`Document \`${documentId}\` not found.`);
        }

        return document;
      },

      async update(partialDocument: unknown) {
        const collection = self.requireCollection(name);
        const existing = collection.documents.get(documentId);

        if (!existing) {
          throw notFoundError(`Document \`${documentId}\` not found.`);
        }

        const merged = { ...existing, ...(partialDocument as Record<string, unknown>) };
        collection.documents.set(documentId, merged);
        return merged;
      },

      async delete() {
        const collection = self.requireCollection(name);

        if (!collection.documents.delete(documentId)) {
          throw notFoundError(`Document \`${documentId}\` not found.`);
        }

        return {};
      },
    });

    return {
      documents: ((documentId?: string) =>
        documentId === undefined ? documentsApi : documentApi(documentId)) as never,

      async retrieve() {
        return { name: self.requireCollection(name).name };
      },

      async update(schema: unknown) {
        return schema;
      },

      async delete() {
        self.requireCollection(name);
        self.store.delete(name);
        return {};
      },

      async exists() {
        return self.store.has(name);
      },
    };
  }
}
