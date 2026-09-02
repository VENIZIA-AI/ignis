import type { ISearchResult } from '@/search/core';
import { HTTP, type AnyType } from '@venizia/ignis-helpers/common';
import { Meilisearch } from 'meilisearch';
import type { IMeilisearchClientLike } from '../common';

/** Meilisearch error bodies carry `{ message, code, type, link }`; classification keys off `code`. */
export class MeilisearchInternal {
  static readonly INDEX_NOT_FOUND = 'index_not_found';
  static readonly INDEX_ALREADY_EXISTS = 'index_already_exists';
  static readonly DOCUMENT_NOT_FOUND = 'document_not_found';

  /** A Meilisearch failure arrives in TWO shapes and both must be read: `MeilisearchApiError` (SDK throw - body off `cause`, status off `response.status`, NO top-level `code`) and the flat `task.error` response (not an Error, `code` at top level). Missing either misclassifies a by-design 404 as a 503 engine-down. */
  static getErrorCode(opts: { error: unknown }): string | undefined {
    const { error } = opts;

    if (typeof error !== 'object' || error === null) {
      return undefined;
    }

    const flatCode = (error as { code?: unknown }).code;
    if (typeof flatCode === 'string') {
      return flatCode;
    }

    const causeCode = (error as { cause?: { code?: unknown } }).cause?.code;
    return typeof causeCode === 'string' ? causeCode : undefined;
  }

  /** The HTTP status of an API error, from whichever shape carries it. */
  static getHttpStatus(opts: { error: unknown }): number | undefined {
    const { error } = opts;

    if (typeof error !== 'object' || error === null) {
      return undefined;
    }

    const responseStatus = (error as { response?: { status?: unknown } }).response?.status;
    if (typeof responseStatus === 'number') {
      return responseStatus;
    }

    const httpStatus = (error as { httpStatus?: unknown }).httpStatus;
    return typeof httpStatus === 'number' ? httpStatus : undefined;
  }

  static isNotFoundError(opts: { error: unknown }): boolean {
    const code = MeilisearchInternal.getErrorCode(opts);

    if (
      code === MeilisearchInternal.INDEX_NOT_FOUND ||
      code === MeilisearchInternal.DOCUMENT_NOT_FOUND
    ) {
      return true;
    }

    return MeilisearchInternal.getHttpStatus(opts) === HTTP.ResultCodes.RS_4.NotFound;
  }

  static isAlreadyExistsError(opts: { error: unknown }): boolean {
    return MeilisearchInternal.getErrorCode(opts) === MeilisearchInternal.INDEX_ALREADY_EXISTS;
  }
}

export const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

/** Reserved RESPONSE keys on a hit. Listed explicitly, not by `_` prefix - `_geo` is a stored DOCUMENT field and prefix-stripping would delete it. */
export const RESERVED_HIT_KEYS = new Set([
  '_formatted',
  '_matchesPosition',
  '_rankingScore',
  '_rankingScoreDetails',
  '_vectors',
  '_federation',
  '_geoDistance',
]);

/** Strips Meilisearch's reserved response metadata, leaving the caller's own document intact. */
export const extractDocument = <TDocument extends object>(
  hit: Record<string, unknown>,
): TDocument => {
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
export const mapSearchResult = <TDocument extends object>(
  raw: unknown,
): ISearchResult<TDocument> => {
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
export const adaptClient = (sdk: Meilisearch): IMeilisearchClientLike => {
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
