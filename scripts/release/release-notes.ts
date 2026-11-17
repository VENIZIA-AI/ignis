/**
 * What the release scripts read out of a version folder (`changelogs/<X.Y.Z>/log.md` and `migration.yaml`). It imports
 * nothing, so every script loads it as it is.
 *
 * This is the same logic as `VersionNotes` of VULCAN's atlas (`packages/atlas/src/changelogs/notes.ts`), which the command
 * `vulcan changelog notes` runs: IGNIS cannot import it (it is not a dependency of this repository, and the release
 * script spawns nothing but `gh`), so `release-notes.test.ts` checks this copy against that command on every folder.
 */
export class ReleaseNotes {
  /** The frontmatter block at the top of a markdown file. */
  static readonly FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;

  /** `log.md` without its front matter; empty when nothing else is in it. */
  static bodyOf(opts: { log: string }): string {
    return opts.log.replace(ReleaseNotes.FRONT_MATTER, '').trim();
  }

  /** Whether `migration.yaml` holds a block: an absent file, an empty one and `{}` hold none. */
  static hasBlocks(opts: { migration?: string }): boolean {
    if (opts.migration === undefined || opts.migration.trim() === '') {
      return false;
    }

    try {
      const parsed: unknown = Bun.YAML.parse(opts.migration);

      return typeof parsed === 'object' && parsed !== null && Object.keys(parsed).length > 0;
    } catch {
      // A file that does not parse is not "no block": it ships, and the changelog gate is where it fails.
      return true;
    }
  }
}
