/**
 * The release of a stable writes the date into the version folder it releases: `released: YYYY-MM-DD` in the
 * frontmatter of `changelogs/<version>/log.md`, in the release commit of the package the Release is made on. A folder
 * with that line is frozen.
 *
 *   bun scripts/release/stamp-release.ts --version <X.Y.Z> --date <YYYY-MM-DD>
 *
 * It prints the path it wrote, so the loop can `git add` it, and nothing when the project keeps no folder for that
 * version. A folder that already carries another date is refused. Copied from VULCAN (`scripts/release/stamp-release.ts`,
 * PR 949); a change to the rule is made in VULCAN first.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GithubRelease } from './github-release';
import { ReleaseMergeBack } from './merge-back';

export class ReleaseStampConstants {
  static readonly VERSION = /^\d+\.\d+\.\d+$/;
  static readonly DATE = /^\d{4}-\d{2}-\d{2}$/;
  static readonly FRONT_MATTER = /^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n)/;
  static readonly RELEASED = /^released:\s*(.*?)\s*$/m;
  static readonly USAGE = 'stamp-release: --version <X.Y.Z> --date <YYYY-MM-DD>';
}

export class ReleaseStamp {
  /**
   * `text` with `released: <date>` as the last line of its frontmatter. `undefined` when it already says that date
   * (nothing to write); an error when it says another, or has no frontmatter to put the line in.
   */
  static stamped(opts: { text: string; date: string }): string | undefined {
    const matched = ReleaseStampConstants.FRONT_MATTER.exec(opts.text);

    if (matched === null) {
      throw new Error('log.md has no frontmatter to write released: into');
    }

    const existing = ReleaseStampConstants.RELEASED.exec(matched[2])?.[1];

    if (existing !== undefined) {
      if (existing === opts.date) {
        return undefined;
      }

      throw new Error(`log.md already says released: ${existing}; a released folder is frozen`);
    }

    const lineBreak = matched[1].endsWith('\r\n') ? '\r\n' : '\n';

    return `${matched[1]}${matched[2]}${lineBreak}released: ${opts.date}${matched[3]}${opts.text.slice(matched[0].length)}`;
  }

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

      const next = ReleaseStamp.stamped({ text: readFileSync(file, 'utf8'), date });

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
