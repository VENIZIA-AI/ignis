import { getError } from '@venizia/ignis-helpers/core';
import { SearchModes } from '@/search/core/repositories/common';
import type { TSearchMode } from '@/search/core/repositories/common';

/** A mode `modes.allow` can name: every mode but `raw`, which is its own toggle (`modes.raw`) because it bypasses the model's filter and hidden fields. */
export type TSearchFriendlyMode = Exclude<TSearchMode, typeof SearchModes.RAW>;

/** Which `mode` values `POST /search` accepts besides `raw`: `modes.allow`, read once when the controller is built. */
export class SearchModeAllowlist {
  /** Left out, every friendly mode is served. */
  static readonly DEFAULTS: ReadonlyArray<TSearchFriendlyMode> = [
    SearchModes.KEYWORD,
    SearchModes.SEMANTIC,
    SearchModes.HYBRID,
  ];

  /** The list as the body schema takes it, or the defaults when `allow` is left out. An empty list, a duplicate and a name that is not a friendly mode (`raw` included) are refused. */
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
}
