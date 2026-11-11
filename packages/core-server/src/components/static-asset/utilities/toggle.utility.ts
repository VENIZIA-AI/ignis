import type { TToggle } from '../common';

/** Reads the `{ use }` switches an entry is written with. */
export class StaticAssetToggleUtility {
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
    if (!StaticAssetToggleUtility.isUsed(toggle)) {
      return undefined;
    }

    const { use: _use, ...options } = toggle;

    return options;
  }
}
