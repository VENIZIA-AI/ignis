/**
 * Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
 * scripts/wiki-shared in VULCAN. Edit it there, never in a copy.
 *
 * The VitePress data loader of the changelog: every dated entry of `changelogs/` (relative to the wiki's
 * srcDir) and every version folder `changelogs/<X.Y.Z>/log.md` (a wiki rewrites it to `changelogs/<X.Y.Z>`), parsed by
 * changelog-entries.ts and sorted. Only the parsed fields reach the page, never the
 * entry's text. `changelog.data.ts` exports it for the components; `writeChangelogFeed` runs it again in
 * a wiki's `buildEnd` hook to write the feed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createContentLoader } from 'vitepress';
import {
  demoteHeadings,
  parseEntry,
  parseVersion,
  shownVersions,
  sortEntries,
  sortVersions,
  type TChangelogEntry,
  type TVersionEntry,
} from './changelog-entries';
import { changelogFeed, type TFeedSite } from './changelog-feed';

export const createEntriesLoader = () =>
  createContentLoader('changelogs/*.md', {
    includeSrc: true,
    transform: (raw): TChangelogEntry[] =>
      sortEntries(
        raw
          .map((page) =>
            parseEntry({ url: page.url, frontmatter: page.frontmatter, src: page.src ?? '' }),
          )
          .filter((entry): entry is TChangelogEntry => entry !== null),
      ),
  });

/**
 * The version folders (`changelogs/<X.Y.Z>/log.md`), newest first. Only the two the index shows in full carry their page as
 * HTML. A wiki that keeps no folder has none, and the loader gives an empty list.
 */
export const createVersionsLoader = () =>
  createContentLoader('changelogs/*/log.md', {
    includeSrc: true,
    render: true,
    transform: (raw): TVersionEntry[] => {
      const versions = sortVersions(
        raw
          .map((page) => ({
            entry: parseVersion({
              url: page.url,
              frontmatter: page.frontmatter,
              src: page.src ?? '',
            }),
            html: page.html,
          }))
          .flatMap(({ entry, html }) => (entry === null ? [] : [{ ...entry, html }])),
      );
      const shown = shownVersions(versions);
      const full = new Set([shown.latest?.version, shown.inProgress?.version]);

      return versions.map(({ html, ...entry }) =>
        full.has(entry.version) && html !== undefined
          ? { ...entry, html: demoteHeadings(html) }
          : entry,
      );
    },
  });

/**
 * The versions whose page has a Breaking section, as a list of version numbers and nothing else: no page text, no HTML. The
 * title block of every page imports it, so it must stay small (the full loader above is mounted by the index page only).
 */
export const createBreakingLoader = () =>
  createContentLoader('changelogs/*/log.md', {
    includeSrc: true,
    transform: (raw): string[] =>
      raw.flatMap((page) => {
        const entry = parseVersion({
          url: page.url,
          frontmatter: page.frontmatter,
          src: page.src ?? '',
        });

        return entry?.hasBreaking === true ? [entry.version] : [];
      }),
  });

/** Writes `changelog.xml` into the output folder; a wiki's config calls it from its `buildEnd` hook. */
export const writeChangelogFeed = async (opts: {
  outDir: string;
  site: TFeedSite;
}): Promise<void> => {
  const entries = await createEntriesLoader().load();
  const versions = await createVersionsLoader().load();

  mkdirSync(opts.outDir, { recursive: true });
  writeFileSync(
    join(opts.outDir, 'changelog.xml'),
    changelogFeed({ site: opts.site, entries, versions }),
  );
};
