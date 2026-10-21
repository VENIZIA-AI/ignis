import { rmSync } from 'node:fs';
import { join } from 'node:path';

/** What a build and the checks generate, relative to the project root. */
const GENERATED_PATHS = ['dist', 'node_modules/.cache'];

/** `devz clean`: removes what the build and the checks generate, and nothing else. */
export class CleanCommand {
  static run(opts: { root: string }): number {
    for (const path of GENERATED_PATHS) {
      rmSync(join(opts.root, path), { recursive: true, force: true });
    }

    return 0;
  }
}
