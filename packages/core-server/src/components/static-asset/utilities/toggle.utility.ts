import type { TToggle } from '../common';

/** Reads the `{ use }` switches an entry is written with. */
export class StaticAssetToggleUtility {
  /** The only place a toggle's `use` is read. Narrowing here is what lets every caller reach the options without a cast. */
  static isUsed<Options extends object>(
    toggle: TToggle<Options> | undefined,
  ): toggle is Extract<TToggle<Options>, { use: true }> {
    return toggle !== undefined && toggle.use;
  }
}
