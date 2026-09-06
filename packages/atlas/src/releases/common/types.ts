/** One published version of one package, as `scripts/atlas-releases.ts` read it off a release commit. */
export interface IReleaseRecord {
  version: string;
  date: string;
  sha: string;
}

/**
 * One dated changelog entry. `id` is the same citation id `search` and `get` use, so an entry a
 * window returned can be read in full; `packages` is empty when the file names no package.
 */
export interface IChangelogRecord {
  id: string;
  file: string;
  date: string;
  title: string;
  packages: string[];
  kind: string | null;
}

/** The generated `releases.json` payload, whole. Release lists are newest first, per package. */
export interface IReleaseTable {
  /** The package directories that exist today; `releases` also holds retired ones, whose history stays readable. */
  livePackages?: string[];
  releases: Record<string, IReleaseRecord[]>;
  changelogs: IChangelogRecord[];
}
