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
const CONTENT = '.VPContent';
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

/** What this build calls of Pagefind's module; each call answers with the errors it met. */
interface IPagefindBuild {
  createIndex(config: { excludeSelectors: string[] }): Promise<{
    errors: string[];
    index?: {
      addHTMLFile(file: { sourcePath: string; content: string }): Promise<{ errors: string[] }>;
      writeFiles(options: { outputPath: string }): Promise<{ errors: string[] }>;
    };
  }>;
  close(): Promise<unknown>;
}

/** The module is read from the wiki's own install, so its shape is checked. */
const isPagefindBuild = (value: unknown): value is IPagefindBuild =>
  typeof value === 'object' &&
  value !== null &&
  'createIndex' in value &&
  typeof value.createIndex === 'function' &&
  'close' in value &&
  typeof value.close === 'function';

export class SearchIndex {
  /**
   * A built page as the index reads it: its content region marked; its first `h1` kept as the title of the page and
   * left out of the text, so an excerpt does not open with it again; and a space at the end of every table cell, which
   * Pagefind would otherwise read as one word with the next. Only the index gets this: a page the browser is served
   * with text it did not render itself fails to hydrate.
   */
  static mark(opts: { html: string }): string {
    let named = false;

    return new HTMLRewriter()
      .on(CONTENT, {
        element: (element) => {
          element.setAttribute('data-pagefind-body', '');
        },
      })
      .on(`${CONTENT} h1`, {
        element: (element) => {
          if (!named) {
            element.setAttribute('data-pagefind-meta', 'title');
            element.setAttribute('data-pagefind-ignore', '');
          }

          named = true;
        },
      })
      .on(`${CONTENT} th, ${CONTENT} td`, {
        element: (element) => {
          element.append(' ');
        },
      })
      .transform(opts.html);
  }

  static async run(opts: { wiki: string }): Promise<number> {
    const entry = join(opts.wiki, 'node_modules', 'pagefind', 'lib', 'index.js');

    if (!existsSync(entry)) {
      console.error(
        'wiki search: pagefind is not installed: add it to the devDependencies of docs/wiki, pinned, and run bun install',
      );

      return 1;
    }

    const pagefind: unknown = await import(entry);

    if (!isPagefindBuild(pagefind)) {
      console.error(`wiki search: no createIndex in ${entry}`);

      return 1;
    }

    try {
      const errors = await SearchIndex.build({
        pagefind,
        dist: join(opts.wiki, 'site', '.vitepress', 'dist'),
      });

      for (const error of errors) {
        console.error(`wiki search: ${error}`);
      }

      return errors.length === 0 ? 0 : 1;
    } finally {
      await pagefind.close();
    }
  }

  /** Indexes every page of `dist` into `dist/pagefind` and answers the errors; the pages themselves are only read. */
  private static async build(opts: { pagefind: IPagefindBuild; dist: string }): Promise<string[]> {
    const created = await opts.pagefind.createIndex({ excludeSelectors: EXCLUDED });

    if (created.index === undefined) {
      return created.errors;
    }

    const errors = [...created.errors];
    let pages = 0;

    for await (const page of new Bun.Glob('**/*.html').scan({ cwd: opts.dist })) {
      const html = await Bun.file(join(opts.dist, page)).text();
      const added = await created.index.addHTMLFile({
        sourcePath: page,
        content: SearchIndex.mark({ html }),
      });

      errors.push(...added.errors.map((error) => `${page}: ${error}`));
      pages++;
    }

    const written = await created.index.writeFiles({ outputPath: join(opts.dist, 'pagefind') });

    console.log(`wiki search: read ${pages} pages into ${join(opts.dist, 'pagefind')}`);

    return [...errors, ...written.errors];
  }
}

if (import.meta.main) {
  process.exit(await SearchIndex.run({ wiki: WIKI }));
}
