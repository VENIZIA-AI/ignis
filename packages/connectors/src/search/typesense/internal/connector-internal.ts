import type { ISearchResult } from '@/search/core';
import type { ISynonym } from '@/search/core/models';
import { HTTP, type TConstValue } from '@venizia/ignis-helpers/common';

interface IHttpLikeError {
  httpStatus?: number;
  message?: string;
}

// Narrow runtime readers for the `unknown` payloads ITypesenseClientLike hands back - the narrowest cast per field, isolated here instead of repeated ad hoc at every call site.
export const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

export const readBooleanFlag = (opts: { value: unknown; key: string }): boolean => {
  const { value, key } = opts;
  return isRecord(value) ? Boolean(value[key]) : false;
};

export const readNumberField = (opts: { value: unknown; key: string }): number => {
  const { value, key } = opts;
  if (!isRecord(value) || typeof value[key] !== 'number') {
    return 0;
  }
  return value[key];
};

export const readStringField = (opts: { value: unknown; key: string }): string | undefined => {
  const { value, key } = opts;
  if (!isRecord(value) || typeof value[key] !== 'string') {
    return undefined;
  }
  return value[key];
};

/** Maps a raw Typesense search hit (snake_case `text_match`) onto the camelCase `ISearchResult` hit shape; read via bracket string access so no snake_case identifier is declared here. */
export const mapSearchHit = <TDocument extends object>(
  hit: unknown,
): {
  document: TDocument;
  highlight?: unknown;
  highlights?: unknown[];
  score?: number;
} => {
  if (!isRecord(hit)) {
    return { document: {} as TDocument };
  }

  const mapped: {
    document: TDocument;
    highlight?: unknown;
    highlights?: unknown[];
    score?: number;
  } = {
    document: hit['document'] as TDocument,
  };

  if (hit['highlight'] !== undefined) {
    mapped.highlight = hit['highlight'];
  }

  if (Array.isArray(hit['highlights'])) {
    mapped.highlights = hit['highlights'];
  }

  if (typeof hit['text_match'] === 'number') {
    mapped.score = hit['text_match'];
  }

  return mapped;
};

/** Maps a raw Typesense search response onto the camelCase `ISearchResult`; snake_case wire fields (`out_of`/`search_time_ms`/`facet_counts`/`grouped_hits`) are read only via bracket string access, never as identifiers, and absent fields are omitted rather than mapped as `undefined`. */
export const mapSearchResult = <TDocument extends object>(
  raw: unknown,
): ISearchResult<TDocument> => {
  if (!isRecord(raw)) {
    return { found: 0, isFoundExact: true };
  }

  // `found` is exhaustive UNLESS the engine ran out of its search-time budget: `search_cutoff`
  // means it stopped early and reported what it had, so the count is an estimate. Hardcoding
  // `true` told every caller that a truncated count was authoritative.
  const result: ISearchResult<TDocument> = {
    found: readNumberField({ value: raw, key: 'found' }),
    isFoundExact: raw['search_cutoff'] !== true,
  };

  if (typeof raw['out_of'] === 'number') {
    result.outOf = raw['out_of'];
  }
  if (typeof raw['search_time_ms'] === 'number') {
    result.searchTimeMs = raw['search_time_ms'];
  }
  if (Array.isArray(raw['facet_counts'])) {
    result.facetCounts = raw['facet_counts'];
  }
  if (Array.isArray(raw['grouped_hits'])) {
    result.groupedHits = raw['grouped_hits'];
  }
  if (Array.isArray(raw['hits'])) {
    result.hits = raw['hits'].map(hit => mapSearchHit<TDocument>(hit));
  }

  return result;
};

// Typesense's wire shape for a synonym set; `root` is only present for one-way synonyms.
export const isSynonymResponse = (
  value: unknown,
): value is { id: string; synonyms: string[]; root?: string } => {
  return isRecord(value) && typeof value.id === 'string' && Array.isArray(value.synonyms);
};

export const toSynonym = (value: { id: string; synonyms: string[]; root?: string }): ISynonym => {
  const { id, synonyms, root } = value;
  // Multi-way sets come back with root: "" - treat empty/absent alike so only one-way keeps a root.
  return root ? { id, synonyms, root } : { id, synonyms };
};

/**
 * What ONE `/multi_search` result entry turned out to be. The transport classifies; the two public
 * methods apply policy. `missingCollection` is separated from `failed` because they want opposite
 * treatment, and both now arrive through the same channel.
 */
export class EntryOutcomes {
  static readonly OK = 'ok';
  static readonly MISSING_COLLECTION = 'missingCollection';
  static readonly FAILED = 'failed';

  static readonly SCHEME_SET = new Set([this.OK, this.MISSING_COLLECTION, this.FAILED]);

  static isValid(value: string): value is TEntryOutcome {
    return this.SCHEME_SET.has(value);
  }
}
export type TEntryOutcome = TConstValue<typeof EntryOutcomes>;

export type TEntryClassification =
  | { kind: typeof EntryOutcomes.OK }
  | {
      kind: typeof EntryOutcomes.MISSING_COLLECTION | typeof EntryOutcomes.FAILED;
      message: string;
      code: number;
    };

// Typesense-specific error classification only; engine-agnostic plumbing lives in SearchConnectorInternal.
export class TypesenseInternal {
  private static asHttpLike(opts: { error: unknown }): IHttpLikeError {
    const { error } = opts;

    if (error && typeof error === 'object') {
      return error as IHttpLikeError;
    }

    return {};
  }

  private static messageOf(opts: { error: unknown }): string {
    const { error } = opts;

    const candidate = this.asHttpLike({ error });
    if (typeof candidate.message === 'string') {
      return candidate.message.toLowerCase();
    }

    if (typeof error === 'string') {
      return error.toLowerCase();
    }

    return '';
  }

  // Status-first and strict: when httpStatus is present classify solely on it - a 5xx whose passed-through message contains the phrase must not be mistaken for a benign miss.
  private static classify(opts: { error: unknown; status: number; phrase: string }): boolean {
    const { error, status, phrase } = opts;

    const httpStatus = this.asHttpLike({ error }).httpStatus;
    if (typeof httpStatus === 'number') {
      return httpStatus === status;
    }

    return this.messageOf({ error }).includes(phrase);
  }

  static isAlreadyExistsError(opts: { error: unknown }): boolean {
    const { error } = opts;
    return this.classify({
      error,
      status: HTTP.ResultCodes.RS_4.Conflict,
      phrase: 'already exists',
    });
  }

  static isNotFoundError(opts: { error: unknown }): boolean {
    const { error } = opts;
    return this.classify({ error, status: HTTP.ResultCodes.RS_4.NotFound, phrase: 'not found' });
  }

  /**
   * Classifies ONE `/multi_search` result entry.
   *
   * A per-entry failure arrives inside an HTTP 200 as `{ code, error }` next to siblings that
   * succeeded, so nothing throws on its own. Reporting such an entry as an empty result would make
   * a rejected filter indistinguishable from a genuine no-match - the same silent-wrong-answer
   * class as an empty `or` compiling to "no constraint". The caller gets a classification and
   * decides policy; it never gets a plausible-looking zero by default.
   */
  static classifyEntry(opts: { entry: unknown }): TEntryClassification {
    const { entry } = opts;

    if (!entry || typeof entry !== 'object') {
      return { kind: EntryOutcomes.FAILED, message: 'Malformed multi_search entry', code: 0 };
    }

    const candidate = entry as { code?: unknown; error?: unknown };

    // `error` is what marks a failed entry - a successful one carries neither field, and `code`
    // alone would misread a response that merely echoes a status.
    if (typeof candidate.error !== 'string') {
      return { kind: EntryOutcomes.OK };
    }

    const code = typeof candidate.code === 'number' ? candidate.code : 0;

    // Status-first, exactly as `classify` is: a 5xx whose message happens to contain 'not found'
    // must not be mistaken for an unprovisioned collection and quietly answered as empty.
    const isMissingCollection =
      code === HTTP.ResultCodes.RS_4.NotFound ||
      (code === 0 && candidate.error.toLowerCase().includes('not found'));

    return {
      kind: isMissingCollection ? EntryOutcomes.MISSING_COLLECTION : EntryOutcomes.FAILED,
      message: candidate.error,
      code,
    };
  }
}
