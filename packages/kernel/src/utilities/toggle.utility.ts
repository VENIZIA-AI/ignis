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
  /** The only place a toggle's `use` is read. Narrowing here is what lets every caller reach the options without a cast. */
  static isUsed<Options extends object>(
    toggle: TToggle<Options> | undefined,
  ): toggle is Extract<TToggle<Options>, { use: true }> {
    return toggle !== undefined && toggle.use;
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
