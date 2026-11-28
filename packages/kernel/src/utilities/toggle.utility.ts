import { HTTP } from '@venizia/ignis-helpers/common';
import { getError, RecordUtility } from '@venizia/ignis-helpers/core';

/**
 * A feature that is on or off. `{ use: false }` is the whole off state; `{ use: true, ... }` carries
 * the options. One shape for every switch, so an option is never read from a feature that is off.
 * Shared by components and controllers.
 */
export type TToggle<Options extends object = Record<never, never>> =
  | { use: false }
  | ({ use: true } & Options);

/** Reads the `{ use }` switches a component or controller option is written with. */
export class ToggleUtility {
  /**
   * Whether a toggle is on: only `{ use: true }`; an absent one is off. Throws, with status 500, on anything but a plain
   * object with its own boolean `use`: a truthy string from a config file must never switch a feature on, nor a refused
   * one switch TLS off.
   *
   * @param opts.name - The option the toggle was written at, for the error message.
   */
  static isUsed<Options extends object>(
    toggle: TToggle<Options> | undefined,
    opts?: { name: string },
  ): toggle is Extract<TToggle<Options>, { use: true }> {
    if (toggle === undefined) {
      return false;
    }

    const use: unknown =
      RecordUtility.isPlainObject(toggle) && Object.hasOwn(toggle, 'use') ? toggle.use : undefined;

    if (typeof use !== 'boolean') {
      const option = opts ? ` | option: ${opts.name}` : '';
      const kind = toggle === null ? 'null' : Array.isArray(toggle) ? 'array' : typeof toggle;

      // Types only: a toggle can carry a private key or a signing secret.
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[ToggleUtility] A toggle must be { use: true } or { use: false }${option} | toggle: ${kind} | use: ${typeof use}`,
      });
    }

    return use;
  }

  /** The options of a toggle that is on, without `use`; `undefined` when it is off or absent. Throws where `isUsed` does. */
  static pick<Options extends object>(
    toggle: TToggle<Options> | undefined,
    opts?: { name: string },
  ): Omit<Extract<TToggle<Options>, { use: true }>, 'use'> | undefined {
    if (!ToggleUtility.isUsed(toggle, opts)) {
      return undefined;
    }

    const { use: _use, ...options } = toggle;

    return options;
  }
}
