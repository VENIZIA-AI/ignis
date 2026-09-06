import { AtlasModes } from '@/common';
import type { TAtlasMode } from '@/common';
import { getError } from '@venizia/ignis-helpers/core';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';

// The npm package name, not `AtlasConstants.SERVER_NAME` (`ignis-atlas`, the bin/MCP server name) -
// this is what identifies the package directory itself, from its own `package.json`.
const PACKAGE_NAME = '@venizia/ignis-atlas';

const REPOSITORY_WIKI_MARKER = 'docs/wiki/content';
const REPOSITORY_KNOWLEDGE_MARKER = '.agents/knowledge';
const SNAPSHOT_DIRECTORY = 'dist/corpus';

/** A `root`/`packageDirectory` pair that satisfies neither repo mode nor snapshot mode. */
export class ModeUsageError extends Error {}

export interface IResolvedMode {
  mode: TAtlasMode;
  root: string;
}

interface IPackageManifest {
  name?: string;
  version?: string;
}

const readManifest = (opts: { directory: string }): IPackageManifest | undefined => {
  const manifestPath = join(opts.directory, 'package.json');
  if (!existsSync(manifestPath)) {
    return undefined;
  }

  return JSON.parse(readFileSync(manifestPath, 'utf8'));
};

const readPackageName = (opts: { directory: string }): string | undefined =>
  readManifest(opts)?.name;

/** The located package's own `version` - read fresh so a release bump is never stale in the running server. */
export const readPackageVersion = (opts: { directory: string }): string | undefined =>
  readManifest(opts)?.version;

/** `startDirectory` and every directory above it, up to and including the filesystem root. */
const ancestorsOf = (opts: { startDirectory: string }): string[] => {
  const { root } = parse(opts.startDirectory);
  const chain = [opts.startDirectory];

  while (chain[chain.length - 1] !== root) {
    chain.push(dirname(chain[chain.length - 1]));
  }

  return chain;
};

/**
 * Walks up from `startDirectory` (source runs from `src/`, the built CLI from `dist/cjs/` - a
 * fixed number of `..` segments is wrong for one of the two) until it finds the directory whose
 * `package.json` names this package. Never guesses from path shape; always reads and compares.
 */
export const findPackageDirectory = (opts: { startDirectory: string }): string => {
  const found = ancestorsOf({ startDirectory: opts.startDirectory }).find(
    directory => readPackageName({ directory }) === PACKAGE_NAME,
  );

  if (!found) {
    throw getError({
      message: `[findPackageDirectory] no ${PACKAGE_NAME} package.json found | started at: ${opts.startDirectory}`,
    });
  }

  return found;
};

const isRepositoryCheckout = (opts: { root: string }): boolean =>
  existsSync(join(opts.root, REPOSITORY_WIKI_MARKER)) &&
  existsSync(join(opts.root, REPOSITORY_KNOWLEDGE_MARKER));

/**
 * Repo mode wins when `root` is a checkout; otherwise the packaged snapshot next to
 * `packageDirectory`; otherwise a `ModeUsageError` naming both paths it checked.
 */
export const resolveMode = (opts: { root: string; packageDirectory: string }): IResolvedMode => {
  const { root, packageDirectory } = opts;

  if (isRepositoryCheckout({ root })) {
    return { mode: AtlasModes.REPOSITORY, root };
  }

  if (existsSync(join(packageDirectory, SNAPSHOT_DIRECTORY))) {
    return { mode: AtlasModes.SNAPSHOT, root: join(packageDirectory, 'dist') };
  }

  throw new ModeUsageError(
    `no IGNIS checkout at ${root} and no packaged snapshot under ${packageDirectory} - pass --root <dir> pointing at a checkout`,
  );
};
