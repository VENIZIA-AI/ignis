import { HTTP } from '@venizia/ignis-helpers/common';
import type { IHttpLikeError } from './guards';
import { EntryOutcomes, type TEntryClassification } from './outcomes';

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

  /** The wire parameters of an export: `filter_by`, `include_fields` and `exclude_fields`, each only when given. */
  static toExportParams(opts: {
    filterBy?: string;
    includeFields?: string[];
    excludeFields?: string[];
  }): Record<string, unknown> {
    const { filterBy, includeFields, excludeFields } = opts;
    const params: Record<string, unknown> = {};

    if (filterBy) {
      params['filter_by'] = filterBy;
    }

    if (includeFields && includeFields.length > 0) {
      params['include_fields'] = includeFields.join(',');
    }

    if (excludeFields && excludeFields.length > 0) {
      params['exclude_fields'] = excludeFields.join(',');
    }

    return params;
  }

  /**
   * NDJSON lines out of a stream of chunks (text or bytes): a line may span chunks, and a multi-byte character may
   * too, so bytes go through one streaming decoder. Blank lines are dropped; a last line without a newline is yielded.
   */
  static async *toLines(opts: {
    source: AsyncIterable<string | Uint8Array>;
  }): AsyncGenerator<string, void, undefined> {
    const decoder = new TextDecoder();
    let pending = '';

    for await (const chunk of opts.source) {
      pending += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });

      let newline = pending.indexOf('\n');
      while (newline >= 0) {
        const line = pending.slice(0, newline);
        pending = pending.slice(newline + 1);
        if (line.trim() !== '') {
          yield line;
        }
        newline = pending.indexOf('\n');
      }
    }

    pending += decoder.decode();
    if (pending.trim() !== '') {
      yield pending;
    }
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
