import { HTTP } from '@venizia/ignis-helpers/common';
import { getError, RecordUtility } from '@venizia/ignis-helpers/core';

/** Reads the `{ use }` switches of a search controller, for a caller whose types do not hold (plain JavaScript, a config file). */
export class SearchToggles {
  /**
   * Whether a toggle is on: only `{ use: true }`. An absent toggle is off. Anything but a plain object with its own boolean `use`
   * (`{ use: 'false' }` from a config file, `null`, `true`) throws, because a truthy string must never open a route or raw mode.
   */
  static read(opts: { scope: string; name: string; toggle: unknown }): boolean {
    const { scope, name, toggle } = opts;

    if (toggle === undefined) {
      return false;
    }

    const use =
      RecordUtility.isPlainObject(toggle) && Object.hasOwn(toggle, 'use') ? toggle.use : undefined;

    if (typeof use !== 'boolean') {
      const received = toggle === null ? 'null' : Array.isArray(toggle) ? 'array' : typeof toggle;

      // Types only: the value can hold what must not reach a log.
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${scope}] ${name} must be { use: true } or { use: false } | toggle: ${received} | use: ${typeof use}`,
      });
    }

    return use;
  }
}
