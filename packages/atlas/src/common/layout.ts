import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AtlasModes } from './constants';
import type { TAtlasMode } from './types';

/** The live-tree wiki root, and (with `KNOWLEDGE_DIRECTORY`) the checkout marker repo mode probes for. */
export const WIKI_DIRECTORY = 'docs/wiki/content';
export const CHANGELOG_DIRECTORY = 'docs/wiki/content/changelogs';
export const KNOWLEDGE_DIRECTORY = '.agents/knowledge';

/** The packaged corpus's directory name inside a package's `dist` tree - always joined onto that tree, never onto a bare package directory. */
export const SNAPSHOT_DIRECTORY = 'corpus';

/** The generated symbol table's file name, the same in both modes - only the directory differs. */
export const SYMBOLS_FILE = 'symbols.json';

/** The generated release table's file name, the same in both modes - only the directory differs. */
export const RELEASES_FILE = 'releases.json';

/** Where `SYMBOLS_FILE` lives: the knowledge bundle in repo mode, the packaged corpus in snapshot mode. */
export const symbolsFileOf = (opts: { mode: TAtlasMode; root: string }): string =>
  opts.mode === AtlasModes.REPOSITORY
    ? join(opts.root, KNOWLEDGE_DIRECTORY, 'reference', SYMBOLS_FILE)
    : join(opts.root, SNAPSHOT_DIRECTORY, SYMBOLS_FILE);

/** Where `RELEASES_FILE` lives - the same two homes `symbolsFileOf` picks between. */
export const releasesFileOf = (opts: { mode: TAtlasMode; root: string }): string =>
  opts.mode === AtlasModes.REPOSITORY
    ? join(opts.root, KNOWLEDGE_DIRECTORY, 'reference', RELEASES_FILE)
    : join(opts.root, SNAPSHOT_DIRECTORY, RELEASES_FILE);

/**
 * The IGNIS workspace manifest name, and the family pattern every sibling framework follows:
 * `@venizia/<family>-workspace`. Atlas serves any checkout that keeps the same three corpora under
 * the same paths - ARDOR (`@venizia/ardor-workspace`) is the first sibling - while a consumer that
 * merely copied the layout is still refused, because its root manifest is not a family workspace.
 */
export const WORKSPACE_PACKAGE_NAME = '@venizia/ignis-workspace';
export const WORKSPACE_PACKAGE_PATTERN = /^@venizia\/([a-z][a-z0-9-]*)-workspace$/;

/** The root workspace manifest name, or `undefined` when `root` has none or it is unreadable. */
export const workspaceNameOf = (opts: { root: string }): string | undefined => {
  const file = join(opts.root, 'package.json');
  if (!existsSync(file)) {
    return undefined;
  }

  try {
    const manifest: { name?: unknown } = JSON.parse(readFileSync(file, 'utf8'));
    return typeof manifest.name === 'string' ? manifest.name : undefined;
  } catch {
    return undefined;
  }
};

/** `ignis` for `@venizia/ignis-workspace`, `ardor` for `@venizia/ardor-workspace`; `undefined` outside the family. */
export const workspaceFamilyOf = (opts: { root: string }): string | undefined => {
  const name = workspaceNameOf({ root: opts.root });
  return name === undefined ? undefined : WORKSPACE_PACKAGE_PATTERN.exec(name)?.[1];
};

/**
 * Whether `root` is a VENIZIA family checkout. Every corpus directory must exist AND the root
 * manifest must be a family workspace: a consumer that copies the `docs/wiki` and
 * `.agents/knowledge` layout would otherwise be read as a checkout, and the server would die on the
 * first missing directory instead of serving its own packaged snapshot.
 */
export const isRepositoryCheckout = (opts: { root: string }): boolean =>
  existsSync(join(opts.root, WIKI_DIRECTORY)) &&
  existsSync(join(opts.root, CHANGELOG_DIRECTORY)) &&
  existsSync(join(opts.root, KNOWLEDGE_DIRECTORY)) &&
  workspaceFamilyOf({ root: opts.root }) !== undefined;
