import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/** What a build and the checks generate, relative to the project root. */
const GENERATED_PATHS = ['dist', 'node_modules/.cache'];

/**
 * `incremental` is on in the base tsconfig, so a type-check that emits nothing leaves
 * `<tsconfig name>.tsbuildinfo` next to the tsconfig. One inside `dist` is already removed with it.
 */
const BUILD_INFO_SUFFIX = '.tsbuildinfo';

const USAGE = `Usage: devz clean

Removes what the build and the checks generate, in the current folder: dist, node_modules/.cache and
the *.tsbuildinfo files next to the tsconfig. It takes no argument.

  --help     print this text and exit`;

/** A usage error: nothing was deleted. */
const USAGE_ERROR_CODE = 2;

/** `devz clean`: removes what the build and the checks generate, and nothing else. `--help` prints the usage; any other argument is refused, and nothing is deleted. */
export class CleanCommand {
  static run(opts: { root: string; args?: string[] }): number {
    const { args = [] } = opts;

    if (args.includes('--help') || args.includes('-h')) {
      console.log(USAGE);
      return 0;
    }

    if (args.length > 0) {
      console.error(
        `devz clean: unexpected argument ${args.map((arg) => `"${arg}"`).join(', ')}\n${USAGE}`,
      );
      return USAGE_ERROR_CODE;
    }

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
