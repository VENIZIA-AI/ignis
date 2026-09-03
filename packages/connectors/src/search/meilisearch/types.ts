import type { TConstValue } from '@venizia/ignis-helpers/common';

/** Meilisearch task lifecycle. Every write returns a task uid and is invisible to search until SUCCEEDED. */
export class MeilisearchTaskStatuses {
  static readonly ENQUEUED = 'enqueued';
  static readonly PROCESSING = 'processing';
  static readonly SUCCEEDED = 'succeeded';
  static readonly FAILED = 'failed';
  static readonly CANCELED = 'canceled';

  static readonly SCHEME_SET = new Set<string>([
    this.ENQUEUED,
    this.PROCESSING,
    this.SUCCEEDED,
    this.FAILED,
    this.CANCELED,
  ]);

  static isValid(value: string): value is TMeilisearchTaskStatus {
    return this.SCHEME_SET.has(value);
  }

  static isTerminal(value: string): boolean {
    return value === this.SUCCEEDED || value === this.FAILED || value === this.CANCELED;
  }
}

export type TMeilisearchTaskStatus = TConstValue<typeof MeilisearchTaskStatuses>;

/** Page size used when walking `documents/fetch` for ids during an emulated update-by-filter. */
export const MEILISEARCH_DEFAULT_FETCH_PAGE_SIZE = 1000;

/** Documents per merge-PUT batch. Bounded by the server's payload limit, not by a document count. */
export const MEILISEARCH_DEFAULT_UPDATE_BATCH_SIZE = 1000;

export interface IMeilisearchConnectorOptions {
  name: string;
  host: string;
  apiKey?: string;

  /** Ceiling for awaiting a write task. The SDK's own `waitForTask` defaults to 5000 ms, far too short for a bulk import, so this connector never relies on that default. */
  taskTimeoutMs?: number;

  /** Poll interval while awaiting a task. */
  taskIntervalMs?: number;

  scope?: string;
  identifier?: string;
  onInitialized?: (opts: { name: string }) => void;
  onError?: (opts: { name: string; error: unknown }) => void;
}

export interface IMeilisearchDataSourceSettings {
  host: string;
  apiKey?: string;
  taskTimeoutMs?: number;
  taskIntervalMs?: number;
}

export interface IMeilisearchTask {
  taskUid: number;
  status: string;
  error?: unknown;
  /** A finished task reports what it actually did, e.g. `deletedDocuments` on a documentDeletion. */
  details?: Record<string, unknown>;
}

export interface IMeilisearchDocumentsPage {
  results: unknown[];
  total: number;
}

/** Narrow structural view of the client surface this connector needs - the real client and the in-test fake both satisfy it. */
export interface IMeilisearchIndexApi {
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
