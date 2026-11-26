/**
 * Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
 * scripts/wiki-shared in VULCAN. Edit it there, never in a copy.
 *
 * Builds the search index of a built wiki with the installed Pagefind, into `dist/pagefind/`. A wiki's `docs:build`
 * runs it after `vitepress build`; it needs `pagefind` in the devDependencies of `docs/wiki` and nothing is downloaded.
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** This file is five folders under the wiki folder: site/.vitepress/theme/shared. */
const WIKI = resolve(import.meta.dir, '..', '..', '..', '..');
/** The content of a page: the default theme's column, which the changelog pages use too. */
const ROOT_SELECTOR = '.VPContent';
/**
 * What is no content of a page: the outline, the previous and next links, the eyebrow, the help block, the rails of a
 * changelog page, and the language label, copy button and tab names of a code block, which would run into its code.
 */
const EXCLUDED = [
  '.VPDoc .aside',
  '.VPDocFooter',
  '.doc-eyebrow',
  '.docs-help',
  '.cx-rail',
  '.vp-code-group .tabs',
  'button.copy',
  'span.lang',
];

export class SearchIndex {
  static commandOf(opts: { wiki: string }): string[] {
    return [
      // The package's own runner, run by this Bun: its `.bin` entry asks for Node.
      process.execPath,
      join(opts.wiki, 'node_modules', 'pagefind', 'lib', 'runner', 'bin.cjs'),
      '--site',
      join(opts.wiki, 'site', '.vitepress', 'dist'),
      '--root-selector',
      ROOT_SELECTOR,
      '--exclude-selectors',
      EXCLUDED.join(','),
    ];
  }

  static run(opts: { wiki: string }): number {
    const command = SearchIndex.commandOf(opts);

    if (!existsSync(command[1])) {
      console.error(
        'wiki search: pagefind is not installed: add it to the devDependencies of docs/wiki, pinned, and run bun install',
      );

      return 1;
    }

    return Bun.spawnSync(command, { stdout: 'inherit', stderr: 'inherit' }).exitCode;
  }
}

if (import.meta.main) {
  process.exit(SearchIndex.run({ wiki: WIKI }));
}
