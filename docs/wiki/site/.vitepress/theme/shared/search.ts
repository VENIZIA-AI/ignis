/**
 * Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
 * scripts/wiki-shared in VULCAN. Edit it there, never in a copy.
 *
 * The browser side of the search: Pagefind's own module, which the build writes to `/pagefind/`. It is loaded the first
 * time the search opens, so a page that is only read downloads none of it.
 */

/** One place a search found: a page, or a section of it. */
export interface ISearchHit {
  url: string;
  title: string;
  /** The text around the match, with `<mark>` around it; Pagefind escapes the rest. */
  excerpt: string;
}

interface IPagefindPage {
  url: string;
  excerpt: string;
  meta: { title?: string };
  sub_results?: { url: string; title: string; excerpt: string }[];
}

/** What this box calls of Pagefind's browser module; a search that a newer one replaced answers `null`. */
interface IPagefind {
  debouncedSearch(query: string): Promise<{ results: { data(): Promise<IPagefindPage> }[] } | null>;
}

/** How many pages one search reads: each one is a small download. */
const PAGES = 8;
/** How many sections of one page are listed. */
const SECTIONS = 3;

/** The types of the npm package cover its build API, not the module a build writes for the browser, so its shape is checked. */
const isPagefind = (value: unknown): value is IPagefind =>
  typeof value === 'object' &&
  value !== null &&
  'debouncedSearch' in value &&
  typeof value.debouncedSearch === 'function';

/** A heading as a reader sees it: VitePress puts a zero-width space before the anchor of one. */
const headingOf = (text: string): string => text.replaceAll('\u{200B}', '').trim();

export class WikiSearch {
  private static module: Promise<IPagefind> | undefined;

  /** The sections of a page that matched, else the page itself. */
  static hitsOf(opts: { page: IPagefindPage }): ISearchHit[] {
    const { page } = opts;
    const title = headingOf(page.meta.title ?? page.url);
    const sections = page.sub_results ?? [];

    if (sections.length === 0) {
      return [{ url: page.url, title, excerpt: page.excerpt }];
    }

    const named = sections.map((section) => {
      const heading = headingOf(section.title);

      return {
        url: section.url,
        title: heading === title ? title : `${title} - ${heading}`,
        excerpt: section.excerpt,
      };
    });

    // Two sections under one name read as the same result twice: the first stays.
    return named
      .filter((hit, at) => named.findIndex((other) => other.title === hit.title) === at)
      .slice(0, SECTIONS);
  }

  /** Loads the module at `url` once; a failure (no index, as under `vitepress dev`) is thrown and tried again next time. */
  private static load(opts: { url: string }): Promise<IPagefind> {
    WikiSearch.module ??= import(/* @vite-ignore */ opts.url)
      .then((loaded: unknown) => {
        if (!isPagefind(loaded)) {
          throw new Error(`no search function in ${opts.url}`);
        }

        return loaded;
      })
      .catch((error: unknown) => {
        WikiSearch.module = undefined;
        throw error;
      });

    return WikiSearch.module;
  }

  /** The hits of `query`; `undefined` when a newer search took its place. */
  static async find(opts: { url: string; query: string }): Promise<ISearchHit[] | undefined> {
    const pagefind = await WikiSearch.load({ url: opts.url });
    const found = await pagefind.debouncedSearch(opts.query);

    if (found === null) {
      return undefined;
    }

    const pages = await Promise.all(found.results.slice(0, PAGES).map((result) => result.data()));

    return pages.flatMap((page) => WikiSearch.hitsOf({ page }));
  }
}
