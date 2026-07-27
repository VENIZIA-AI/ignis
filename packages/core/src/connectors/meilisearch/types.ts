import type { TConstValue } from '@venizia/ignis-helpers';

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
