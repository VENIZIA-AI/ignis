import { HTTP } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import type { TSearchInput } from '@/search/core/repositories/common';
import { SearchModes } from '@/search/core/repositories/common';

/**
 * Whether a search controller serves the engine's own parameters over HTTP. `mode: 'raw'` and a multi-search entry hand
 * the engine their parameters as they are: the model's default filter and its hidden fields are not applied to them.
 * So every generated search controller refuses both (400) unless `modes.raw.allow` is `true`. Server code is not
 * affected: the repository's `search({ mode: 'raw' })` and `multiSearch()` work as before.
 */
export class SearchRawAccess {
  /** Reads `modes.raw.allow` of a controller definition: only a literal `true` opens it. A scoped controller cannot open it, and the definition throws. */
  static resolve(opts: { scope: string; modes?: unknown; isScoped: boolean }): boolean {
    const { scope, modes, isScoped } = opts;

    if (modes === undefined) {
      return false;
    }

    const raw = (modes as { raw?: { allow?: unknown } } | null)?.raw;
    const allow = raw?.allow;

    if (allow !== undefined && typeof allow !== 'boolean') {
      throw getError({ message: `[${scope}] modes.raw.allow must be true or false` });
    }

    if (allow === true && isScoped) {
      throw getError({
        message: `[${scope}] A scoped search controller cannot allow mode 'raw' | the scope cannot be applied to the engine's own parameters`,
      });
    }

    return allow === true;
  }

  /** Refuses (400) a `raw` search body when the controller did not opt in. */
  static assertSearchInput(opts: { input: TSearchInput; isAllowed: boolean }): void {
    if (opts.input.mode === SearchModes.RAW && !opts.isAllowed) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message: "[search] mode 'raw' is not available on this search controller",
      });
    }
  }

  /** Refuses (400) a multi-search request when the controller did not opt in: its entries carry the engine's own parameters and name any collection. */
  static assertMultiSearch(opts: { isAllowed: boolean }): void {
    if (!opts.isAllowed) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message: '[multiSearch] multi-search is not available on this search controller',
      });
    }
  }
}
