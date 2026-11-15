import { HTTP } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { ToggleUtility } from '@venizia/ignis-kernel';
import type { TToggle } from '@venizia/ignis-kernel';
import type { TSearchInput } from '@/search/core/repositories/common';
import { SearchModes } from '@/search/core/repositories/common';

/**
 * Whether a search controller serves the engine's own parameters over HTTP. `mode: 'raw'` and a multi-search entry hand
 * the engine their parameters as they are: the model's default filter and its hidden fields are not applied to them.
 * So every generated search controller refuses both (400) unless `modes.raw` is `{ use: true }`. Server code is not
 * affected: the repository's `search({ mode: 'raw' })` and `multiSearch()` work as before.
 */
export class SearchRawAccess {
  /** Reads `modes.raw`: only `{ use: true }` opens it. A scoped controller cannot open it, and the definition throws. */
  static resolve(opts: { scope: string; raw?: TToggle; isScoped: boolean }): boolean {
    const { scope, raw, isScoped } = opts;
    const isAllowed = ToggleUtility.isUsed(raw);

    if (isAllowed && isScoped) {
      throw getError({
        message: `[${scope}] A scoped search controller cannot allow mode 'raw' | the scope cannot be applied to the engine's own parameters`,
      });
    }

    return isAllowed;
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
