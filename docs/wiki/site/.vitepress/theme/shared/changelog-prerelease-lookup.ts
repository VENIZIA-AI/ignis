/**
 * Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
 * scripts/wiki-shared in VULCAN. Edit it there, never in a copy.
 *
 * What a page asks of the newest-prerelease data (changelog-prereleases.data): the prerelease a box names for a version line, and
 * one row for each package. Free of node modules, so a component can import it.
 */
import { data } from './changelog-prereleases.data';
import type { IPrerelease } from './changelog-prereleases';

/** The newest prerelease of `line` (`0.4.8`) of the package a box names, or `undefined` when the tags hold none. */
export const latestPrerelease = (opts: {
  line: string;
  /** The package of the page; the project's main package when it is not given. */
  packageName?: string;
}): { packageName: string; prerelease: IPrerelease } | undefined => {
  const packageName =
    opts.packageName === undefined || opts.packageName === '' ? data.main : opts.packageName;
  const prerelease = data.packages[packageName]?.[opts.line];

  return prerelease === undefined ? undefined : { packageName, prerelease };
};

/** The newest prerelease of `line` of every package that has one, in the order of the manifest. */
export const prereleaseRows = (opts: {
  line: string;
}): { name: string; version: string; date: string }[] =>
  Object.entries(data.packages).flatMap(([name, lines]) => {
    const found = lines[opts.line];

    return found === undefined ? [] : [{ name, version: found.version, date: found.date }];
  });
