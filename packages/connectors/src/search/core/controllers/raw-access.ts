import { HTTP } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { SearchToggles } from './toggles';
import type { TSearchInput } from '@/search/core/repositories/common';
import { SearchModes } from '@/search/core/repositories/common';

/** `mode: 'raw'` and multi-search bypass the model's filter and hidden fields, so a search controller refuses both (400) unless `modes.raw` is `{ use: true }`. */
export class SearchRawAccess {
  /** Reads `modes.raw`: only `{ use: true }` opens it. A scoped controller cannot open it, and the definition throws. */
  static resolve(opts: { scope: string; raw?: unknown; isScoped: boolean }): boolean {
    const { scope, raw, isScoped } = opts;
    const isAllowed = SearchToggles.read({ scope, name: 'modes.raw', toggle: raw });

    if (isAllowed && isScoped) {
      throw getError({
        message: `[${scope}] A scoped search controller cannot allow mode 'raw' | the scope cannot be applied to the engine's own parameters`,
      });
    }

    return isAllowed;
  }

  /** Defence in depth: refuses (400) a `raw` search body when the controller did not opt in, even when the body schema was skipped (a subclass, a direct `search` call). */
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
