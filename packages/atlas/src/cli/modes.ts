import { AtlasModes } from '@/common';
import type { TAtlasMode } from '@/common';
import {
  CHANGELOG_DIRECTORY,
  isRepositoryCheckout,
  KNOWLEDGE_DIRECTORY,
  SNAPSHOT_DIRECTORY,
  WIKI_DIRECTORY,
  WORKSPACE_PACKAGE_NAME,
} from '@/common/layout';
import { getError } from '@venizia/ignis-helpers/core';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';

// The npm package name, not `AtlasConstants.SERVER_NAME` (`ignis-atlas`, the bin/MCP server name) -
// this is what identifies the package directory itself, from its own `package.json`.
const PACKAGE_NAME = '@venizia/ignis-atlas';

/** A `root`/`packageDirectory` pair that satisfies neither mode, or a malformed `--root` flag. */
export class ModeUsageError extends Error {}

export interface IResolvedMode {
  mode: TAtlasMode;
  root: string;
}

/** `--root`'s value from `argv`, and whether the caller passed it explicitly (cwd is the fallback). */
export interface IRootArgument {
  value: string;
  explicit: boolean;
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

/** `--root`'s value from `argv`; cwd when absent. Throws when the flag is present with no value. */
export const readRootArgument = (opts: { argv: string[] }): IRootArgument => {
  const joined = opts.argv.find(argument => argument.startsWith('--root='));
  if (joined !== undefined) {
    const value = joined.slice('--root='.length);
    if (value.length === 0) {
      throw new ModeUsageError('--root requires a value');
    }
    return { value, explicit: true };
  }

  const index = opts.argv.indexOf('--root');
  if (index === -1) {
    return { value: process.cwd(), explicit: false };
  }

  const value = opts.argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new ModeUsageError('--root requires a value');
  }

  return { value, explicit: true };
};

/**
 * Repo mode wins when `root` is a checkout; otherwise the packaged snapshot next to
 * `packageDirectory`; otherwise a `ModeUsageError` naming both paths it checked. An explicit
 * `--root` that is not a checkout never falls back to the snapshot - it named the wrong directory.
 */
export const resolveMode = (opts: {
  root: string;
  packageDirectory: string;
  explicitRoot?: boolean;
}): IResolvedMode => {
  const { root, packageDirectory, explicitRoot = false } = opts;

  if (isRepositoryCheckout({ root })) {
    return { mode: AtlasModes.REPOSITORY, root };
  }

  if (explicitRoot) {
    throw new ModeUsageError(
      `${root} is not an IGNIS checkout - a checkout needs ${WIKI_DIRECTORY}, ${CHANGELOG_DIRECTORY}, ${KNOWLEDGE_DIRECTORY} and a root package.json named ${WORKSPACE_PACKAGE_NAME}`,
    );
  }

  const distDirectory = join(packageDirectory, 'dist');
  if (existsSync(join(distDirectory, SNAPSHOT_DIRECTORY))) {
    return { mode: AtlasModes.SNAPSHOT, root: distDirectory };
  }

  throw new ModeUsageError(
    `no IGNIS checkout at ${root} and no packaged snapshot under ${packageDirectory} - pass --root <dir> pointing at a checkout`,
  );
};
