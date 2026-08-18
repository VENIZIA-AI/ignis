import { getError } from '@venizia/ignis-helpers/core';
import { HTTP } from '@venizia/ignis-helpers/common';
import { MeilisearchApiError } from 'meilisearch';
import type { IMeilisearchClientLike } from '@/search/meilisearch/connector';

interface IFakeTask {
  taskUid: number;
  status: string;
  error?: unknown;
  details?: Record<string, unknown>;
}

interface IFakeIndex {
  uid: string;
  primaryKey?: string;
  documents: Map<string, Record<string, unknown>>;
  settings: Record<string, unknown>;
}

/** The REAL `MeilisearchApiError`, not a hand-rolled lookalike: a fake inventing a flat `{ code, httpStatus }` shape the SDK never produces keeps the suite green while the classifier fails against a live engine. */
const engineError = (opts: { code: string; message: string; httpStatus?: number }): Error => {
  const { code, message, httpStatus = HTTP.ResultCodes.RS_4.BadRequest } = opts;

  return new MeilisearchApiError(new Response(null, { status: httpStatus }), {
    message,
    code,
    type: 'invalid_request',
    link: '',
  });
};

/** Minimal filter evaluator (`score > N`, `score >= N`, `title = 'x'`): the connector only forwards filters, never parses them, so the parsing lives here on purpose. */
const matchesFilter = (opts: { document: Record<string, unknown>; filter: string }): boolean => {
  const match = /^(\w+)\s*(>=|<=|!=|>|<|=)\s*(.+)$/.exec(opts.filter.trim());

  if (!match) {
    throw getError({ message: `[FakeMeilisearchClient] Unsupported filter | ${opts.filter}` });
  }

  const [, field, operator, rawValue] = match;
  const value = rawValue.startsWith("'") ? rawValue.slice(1, -1) : Number(rawValue);
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
      throw getError({ message: `[FakeMeilisearchClient] Unsupported operator | ${operator}` });
    }
  }
};

/** In-memory Meilisearch. Writes enqueue a task whose statuses are replayed from `taskStatuses`. */
export class FakeMeilisearchClient implements IMeilisearchClientLike {
  taskPollCount = 0;
  multiSearchCalls: unknown[] = [];
  /** Every payload passed to `updateDocuments`, in call order - lets a test read exactly what reached the SDK. */
  updateDocumentsCalls: unknown[][] = [];

  private readonly indexes = new Map<string, IFakeIndex>();
  private readonly tasks = new Map<
    number,
    { statuses: string[]; error?: unknown; details?: Record<string, unknown> }
  >();
  private nextTaskUid = 1;
  private addDocumentsCallCount = 0;

  private readonly taskStatuses: string[];
  private readonly repeatLast: boolean;
  private readonly taskError?: unknown;
  private readonly failAddDocumentsCall?: number;

  constructor(opts?: {
    taskStatuses?: string[];
    repeatLast?: boolean;
    taskError?: unknown;
    /** 1-based ordinal of the `addDocuments` call whose task should terminate as `failed` (batch-atomic: its documents do not land). */
    failAddDocumentsCall?: number;
  }) {
    this.taskStatuses = opts?.taskStatuses ?? ['succeeded'];
    this.repeatLast = opts?.repeatLast ?? false;
    this.taskError = opts?.taskError;
    this.failAddDocumentsCall = opts?.failAddDocumentsCall;
  }

  private enqueue(details?: Record<string, unknown>): IFakeTask {
    const taskUid = this.nextTaskUid++;
    this.tasks.set(taskUid, { statuses: [...this.taskStatuses], error: this.taskError, details });
    return { taskUid, status: 'enqueued' };
  }

  private enqueueFailed(): IFakeTask {
    const taskUid = this.nextTaskUid++;
    this.tasks.set(taskUid, {
      statuses: ['failed'],
      error: { code: 'internal', message: 'batch failed' },
    });
    return { taskUid, status: 'enqueued' };
  }

  private requireIndex(uid: string): IFakeIndex {
    const index = this.indexes.get(uid);

    if (!index) {
      throw engineError({
        code: 'index_not_found',
        message: `Index \`${uid}\` not found.`,
        httpStatus: HTTP.ResultCodes.RS_4.NotFound,
      });
    }

    return index;
  }

  async getTask(taskUid: number): Promise<IFakeTask> {
    this.taskPollCount++;
    const task = this.tasks.get(taskUid);

    if (!task) {
      throw getError({ message: `[FakeMeilisearchClient] Unknown task | ${taskUid}` });
    }

    const status =
      task.statuses.length > 1
        ? (task.statuses.shift() as string)
        : this.repeatLast
          ? task.statuses[0]
          : (task.statuses.shift() ?? 'succeeded');

    return { taskUid, status, error: task.error, details: task.details };
  }

  async createIndex(uid: string, options?: unknown): Promise<IFakeTask> {
    if (this.indexes.has(uid)) {
      throw engineError({
        code: 'index_already_exists',
        message: `Index \`${uid}\` already exists.`,
      });
    }

    const primaryKey = (options as { primaryKey?: string } | undefined)?.primaryKey;
    this.indexes.set(uid, { uid, primaryKey, documents: new Map(), settings: {} });
    return this.enqueue();
  }

  async getIndex(uid: string): Promise<unknown> {
    const index = this.requireIndex(uid);
    return { uid: index.uid, primaryKey: index.primaryKey };
  }

  async getIndexes(): Promise<{ results: unknown[] }> {
    return { results: [...this.indexes.values()].map(item => ({ uid: item.uid })) };
  }

  async deleteIndex(uid: string): Promise<IFakeTask> {
    this.requireIndex(uid);
    this.indexes.delete(uid);
    return this.enqueue();
  }

  async swapIndexes(pairs: Array<{ indexes: string[] }>): Promise<IFakeTask> {
    for (const { indexes } of pairs) {
      const [left, right] = indexes;
      const a = this.requireIndex(left);
      const b = this.requireIndex(right);

      this.indexes.set(left, { ...b, uid: left });
      this.indexes.set(right, { ...a, uid: right });
    }

    return this.enqueue();
  }

  async health(): Promise<{ status: string }> {
    return { status: 'available' };
  }

  async multiSearch(params: unknown): Promise<unknown> {
    this.multiSearchCalls.push(params);
    return { results: [] };
  }

  index(uid: string) {
    // `getDocuments` and `search` read committed state, so a missing index must surface as not-found.
    const self = this;

    return {
      async addDocuments(documents: unknown[]): Promise<IFakeTask> {
        const index = self.requireIndex(uid);
        const primaryKey = index.primaryKey ?? 'id';

        self.addDocumentsCallCount += 1;

        // Batch-atomic failure: the failing batch's documents do not land.
        if (self.failAddDocumentsCall === self.addDocumentsCallCount) {
          return self.enqueueFailed();
        }

        for (const raw of documents) {
          const document = raw as Record<string, unknown>;
          index.documents.set(String(document[primaryKey]), { ...document });
        }

        return self.enqueue();
      },

      async updateDocuments(documents: unknown[]): Promise<IFakeTask> {
        self.updateDocumentsCalls.push([...documents]);
        const index = self.requireIndex(uid);
        const primaryKey = index.primaryKey ?? 'id';

        for (const raw of documents) {
          const patch = raw as Record<string, unknown>;
          const id = String(patch[primaryKey]);
          // Merge semantics: PUT /documents preserves fields absent from the patch.
          index.documents.set(id, { ...(index.documents.get(id) ?? {}), ...patch });
        }

        return self.enqueue();
      },

      async getDocument(id: string): Promise<unknown> {
        const index = self.requireIndex(uid);
        const document = index.documents.get(id);

        if (!document) {
          throw engineError({
            code: 'document_not_found',
            message: `Document \`${id}\` not found.`,
          });
        }

        return document;
      },

      async getDocuments(params: unknown): Promise<{ results: unknown[]; total: number }> {
        const index = self.requireIndex(uid);
        const { filter, fields, limit, offset } = (params ?? {}) as {
          filter?: string;
          fields?: string[];
          limit?: number;
          offset?: number;
        };

        let rows = [...index.documents.values()];

        if (filter) {
          rows = rows.filter(document => matchesFilter({ document, filter }));
        }

        const total = rows.length;
        const start = offset ?? 0;
        const end = limit === undefined ? undefined : start + limit;
        let page = rows.slice(start, end);

        if (fields?.length) {
          page = page.map(document =>
            Object.fromEntries(
              fields.filter(key => key in document).map(key => [key, document[key]]),
            ),
          );
        }

        return { results: page, total };
      },

      async deleteDocument(id: string): Promise<IFakeTask> {
        const index = self.requireIndex(uid);

        if (!index.documents.delete(id)) {
          throw engineError({
            code: 'document_not_found',
            message: `Document \`${id}\` not found.`,
          });
        }

        return self.enqueue();
      },

      async deleteDocuments(params: unknown): Promise<IFakeTask> {
        const index = self.requireIndex(uid);
        const { filter } = (params ?? {}) as { filter?: string };
        let deletedDocuments = 0;

        for (const [id, document] of [...index.documents.entries()]) {
          if (!filter || matchesFilter({ document, filter })) {
            index.documents.delete(id);
            deletedDocuments++;
          }
        }

        return self.enqueue({ deletedDocuments });
      },

      async deleteAllDocuments(): Promise<IFakeTask> {
        self.requireIndex(uid).documents.clear();
        return self.enqueue();
      },

      async search(query: string | null, params?: unknown): Promise<unknown> {
        const index = self.requireIndex(uid);
        const { filter, hitsPerPage } = (params ?? {}) as { filter?: string; hitsPerPage?: number };

        let rows = [...index.documents.values()];

        if (filter) {
          rows = rows.filter(document => matchesFilter({ document, filter }));
        }

        if (query) {
          rows = rows.filter(document =>
            Object.values(document).some(
              value => typeof value === 'string' && value.includes(query),
            ),
          );
        }

        // Real hits carry engine metadata alongside the stored document.
        const hits = rows.map(document => ({
          ...document,
          ['_rankingScore']: 0.9,
          ['_formatted']: document,
        }));

        // hitsPerPage present => the exhaustive page mode, which reports `totalHits`.
        const base = { hits, processingTimeMs: 0 };
        return hitsPerPage === undefined
          ? { ...base, estimatedTotalHits: rows.length }
          : { ...base, totalHits: rows.length };
      },

      async updateSettings(settings: unknown): Promise<IFakeTask> {
        const index = self.requireIndex(uid);
        index.settings = { ...index.settings, ...(settings as Record<string, unknown>) };
        return self.enqueue();
      },

      async getSettings(): Promise<Record<string, unknown>> {
        return self.requireIndex(uid).settings;
      },

      async updateSynonyms(synonyms: Record<string, string[]>): Promise<IFakeTask> {
        self.requireIndex(uid).settings['synonyms'] = synonyms;
        return self.enqueue();
      },

      async resetSynonyms(): Promise<IFakeTask> {
        delete self.requireIndex(uid).settings['synonyms'];
        return self.enqueue();
      },
    };
  }
}
