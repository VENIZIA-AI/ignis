/**
 * The release of a stable writes the date into the version folder it releases: `released: YYYY-MM-DD` in the
 * frontmatter of `changelogs/<version>/log.md`, in the release commit of the package the Release is made on. A folder
 * with that line is frozen.
 *
 *   bun scripts/release/stamp-release.ts --version <X.Y.Z> --date <YYYY-MM-DD>
 *
 * It prints the path it wrote, so the loop can `git add` it, and nothing when the project keeps no folder for that
 * version. A folder that already carries another date is refused. Copied from VULCAN (`scripts/release/stamp-release.ts`);
 * a change to the rule is made in VULCAN first. The text rules are in stamp-text.ts.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GithubRelease } from './github-release';
import { ReleaseMergeBack } from './merge-back';
import { ReleaseStampConstants, ReleaseStampText } from './stamp-text';

export class ReleaseStamp {
  /** The log.md of the version's folder, from the manifest's changelog folder; `undefined` when the project has none. */
  static logOf(opts: { cwd: string; version: string }): string | undefined {
    const { changelogs } = GithubRelease.manifestOf({ cwd: opts.cwd });
    const file = join(opts.cwd, changelogs, opts.version, 'log.md');

    return existsSync(file) ? file : undefined;
  }

  static main(opts: { args: string[]; cwd?: string }): number {
    const version = ReleaseMergeBack.flagValue({ args: opts.args, flag: '--version' });
    const date = ReleaseMergeBack.flagValue({ args: opts.args, flag: '--date' });
    const cwd = opts.cwd ?? process.cwd();

    if (
      version === undefined ||
      date === undefined ||
      !ReleaseStampConstants.VERSION.test(version) ||
      !ReleaseStampConstants.DATE.test(date)
    ) {
      console.error(ReleaseStampConstants.USAGE);

      return 2;
    }

    try {
      const file = ReleaseStamp.logOf({ cwd, version });

      if (file === undefined) {
        return 0;
      }

      const next = ReleaseStampText.stamped({ text: readFileSync(file, 'utf8'), date });

      if (next !== undefined) {
        writeFileSync(file, next);
      }

      console.log(file);

      return 0;
    } catch (error) {
      console.error(
        `ERROR | stamp-release: ${error instanceof Error ? error.message : String(error)}`,
      );

      return 1;
    }
  }
}

if (import.meta.main) {
  process.exit(ReleaseStamp.main({ args: process.argv.slice(2) }));
}
