import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/** What a build and the checks generate, relative to the project root. */
const GENERATED_PATHS = ['dist', 'node_modules/.cache'];

/**
 * `incremental` is on in the base tsconfig, so a type-check that emits nothing leaves
 * `<tsconfig name>.tsbuildinfo` next to the tsconfig. One inside `dist` is already removed with it.
 */
const BUILD_INFO_SUFFIX = '.tsbuildinfo';

/** `devz clean`: removes what the build and the checks generate, and nothing else. */
export class CleanCommand {
  static run(opts: { root: string }): number {
    for (const path of GENERATED_PATHS) {
      rmSync(join(opts.root, path), { recursive: true, force: true });
    }

    for (const entry of readdirSync(opts.root, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(BUILD_INFO_SUFFIX)) {
        rmSync(join(opts.root, entry.name), { force: true });
      }
    }

    return 0;
  }
}
