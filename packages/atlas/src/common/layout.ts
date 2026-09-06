import { existsSync } from 'node:fs';
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

/** Whether `root` is an IGNIS checkout: it carries both the wiki and the knowledge bundle. */
export const isRepositoryCheckout = (opts: { root: string }): boolean =>
  existsSync(join(opts.root, WIKI_DIRECTORY)) && existsSync(join(opts.root, KNOWLEDGE_DIRECTORY));
