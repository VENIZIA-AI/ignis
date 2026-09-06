import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** The live-tree wiki root, and (with `KNOWLEDGE_DIRECTORY`) the checkout marker repo mode probes for. */
export const WIKI_DIRECTORY = 'docs/wiki/content';
export const CHANGELOG_DIRECTORY = 'docs/wiki/content/changelogs';
export const KNOWLEDGE_DIRECTORY = '.agents/knowledge';

/** The packaged corpus's directory name inside a package's `dist` tree - always joined onto that tree, never onto a bare package directory. */
export const SNAPSHOT_DIRECTORY = 'corpus';

/** Whether `root` is an IGNIS checkout: it carries both the wiki and the knowledge bundle. */
export const isRepositoryCheckout = (opts: { root: string }): boolean =>
  existsSync(join(opts.root, WIKI_DIRECTORY)) && existsSync(join(opts.root, KNOWLEDGE_DIRECTORY));
