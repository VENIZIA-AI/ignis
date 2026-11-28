import { getError } from '@venizia/ignis-helpers/core';

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
   * Whether a toggle is on: only `{ use: true }`; an absent one is off. Anything but an object with a boolean `use` throws,
   * because a truthy string from a config file must never switch a feature on, nor a refused one switch TLS off.
   */
  static isUsed<Options extends object>(
    toggle: TToggle<Options> | undefined,
  ): toggle is Extract<TToggle<Options>, { use: true }> {
    if (toggle === undefined) {
      return false;
    }

    const use: unknown =
      typeof toggle === 'object' && toggle !== null && 'use' in toggle ? toggle.use : undefined;

    if (typeof use !== 'boolean') {
      // Types only: a toggle can carry a private key or a signing secret.
      throw getError({
        message: `[ToggleUtility] A toggle must be { use: true } or { use: false } | toggle: ${toggle === null ? 'null' : typeof toggle} | use: ${typeof use}`,
      });
    }

    return use;
  }

  /** The options of a toggle that is on, without `use`; `undefined` when it is off or absent. */
  static pick<Options extends object>(
    toggle: TToggle<Options> | undefined,
  ): Omit<Extract<TToggle<Options>, { use: true }>, 'use'> | undefined {
    if (!ToggleUtility.isUsed(toggle)) {
      return undefined;
    }

    const { use: _use, ...options } = toggle;

    return options;
  }
}
