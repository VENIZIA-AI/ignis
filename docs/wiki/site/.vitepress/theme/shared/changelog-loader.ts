/**
 * Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
 * scripts/wiki-shared in VULCAN. Edit it there, never in a copy.
 *
 * The VitePress data loader of the changelog: every dated entry of `changelogs/` (relative to the wiki's
 * srcDir), parsed by changelog-entries.ts and sorted. Only the parsed fields reach the page, never the
 * entry's text. `changelog.data.ts` exports it for the components; `writeChangelogFeed` runs it again in
 * a wiki's `buildEnd` hook to write the feed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createContentLoader } from 'vitepress';
import { parseEntry, sortEntries, type TChangelogEntry } from './changelog-entries';
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

/** Writes `changelog.xml` into the output folder; a wiki's config calls it from its `buildEnd` hook. */
export const writeChangelogFeed = async (opts: {
  outDir: string;
  site: TFeedSite;
}): Promise<void> => {
  const entries = await createEntriesLoader().load();

  mkdirSync(opts.outDir, { recursive: true });
  writeFileSync(join(opts.outDir, 'changelog.xml'), changelogFeed({ site: opts.site, entries }));
};
