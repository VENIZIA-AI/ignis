import { relative, resolve, sep } from 'node:path';
import { PublicSurface, RequireUseWhenRule } from '../linters/house';

/** The baseline of `venizia/require-use-when`: the exports of a package that still lack a `@useWhen`. */
export class UseWhenBaseline {
  /** Where a package keeps it, next to its lint config. */
  static readonly DEFAULT_FILE = '.configs/use-when-baseline.json';

  /**
   * The baseline entries of the package at `directory` today: `<file from the package folder>#<export>` for every export
   * the rule requires a `@useWhen` on and that has none, sorted. Writing them is how a package adopts the rule before its
   * sweep; a package that is already swept has none.
   */
  static entries(opts: {
    directory: string;
    entries?: ReadonlyArray<string>;
    types?: ReadonlyArray<string>;
  }): Array<string> {
    const { directory, entries, types } = opts;
    const surface = PublicSurface.of({ directory, entries });
    const found: Array<string> = [];

    for (const file of surface.values()) {
      for (const item of file.exports) {
        if (RequireUseWhenRule.isRequired({ item, types }) && !item.hasUseWhen) {
          found.push(`${relative(directory, item.file).split(sep).join('/')}#${item.name}`);
        }
      }
    }

    return found.sort();
  }

  /** The file text for `entries`: JSON, one entry per line, a trailing newline. */
  static render(opts: { entries: ReadonlyArray<string> }): string {
    return `${JSON.stringify({ entries: opts.entries }, null, 2)}\n`;
  }

  /** The path a `--out` argument names, from `root`. */
  static pathOf(opts: { root: string; out?: string }): string {
    return resolve(opts.root, opts.out ?? UseWhenBaseline.DEFAULT_FILE);
  }
}
