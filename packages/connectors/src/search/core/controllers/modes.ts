import { HTTP } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { SearchModes } from '@/search/core/repositories/common';
import type { TSearchInput, TSearchMode } from '@/search/core/repositories/common';

/** A mode `modes.allow` can name: every mode but `raw`, which is its own toggle (`modes.raw`). */
export type TSearchFriendlyMode = Exclude<TSearchMode, typeof SearchModes.RAW>;

/** The modes `POST /search` accepts besides `raw`, from `modes.allow`. */
export class SearchModeAllowlist {
  /** Left out, every friendly mode is served. */
  static readonly DEFAULTS: ReadonlyArray<TSearchFriendlyMode> = [
    SearchModes.KEYWORD,
    SearchModes.SEMANTIC,
    SearchModes.HYBRID,
  ];

  /** `allow` as the body schema takes it; an empty list, a duplicate or a name that is not a friendly mode throws. */
  static resolve(opts: { scope: string; allow: unknown }): ReadonlyArray<TSearchFriendlyMode> {
    const { scope, allow } = opts;

    if (allow === undefined) {
      return SearchModeAllowlist.DEFAULTS;
    }

    if (!Array.isArray(allow) || allow.length === 0) {
      throw getError({
        message: `[${scope}] modes.allow must be a non-empty list of modes | got: ${JSON.stringify(allow)} | leave it out to serve every mode, or name at least one of ${SearchModeAllowlist.DEFAULTS.join(', ')}`,
      });
    }

    const resolved: TSearchFriendlyMode[] = [];

    for (const name of allow) {
      const mode = SearchModeAllowlist.DEFAULTS.find((candidate) => candidate === name);

      if (mode === undefined) {
        throw getError({
          message: `[${scope}] modes.allow names a mode this controller cannot allow | mode: ${String(name)} | allowed names: ${SearchModeAllowlist.DEFAULTS.join(', ')} | 'raw' is its own toggle, modes.raw`,
        });
      }

      if (resolved.includes(mode)) {
        throw getError({ message: `[${scope}] modes.allow lists a mode twice | mode: ${mode}` });
      }

      resolved.push(mode);
    }

    return resolved;
  }

  /** Refuses (400) a body whose mode is not allowed: the check the body schema makes, repeated for a caller that skips the validator. `raw` is `SearchRawAccess`'s. */
  static assertInput(opts: {
    input: TSearchInput;
    allowed: ReadonlyArray<TSearchFriendlyMode>;
  }): void {
    const { input, allowed } = opts;

    if (input.mode === SearchModes.RAW) {
      return;
    }

    if (!allowed.includes(input.mode)) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message: `[search] mode '${input.mode}' is not available on this search controller`,
      });
    }
  }
}
