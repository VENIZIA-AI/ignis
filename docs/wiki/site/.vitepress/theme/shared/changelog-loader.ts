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
  parseEntry,
  parseVersion,
  sortEntries,
  sortVersions,
  type TChangelogEntry,
  type TVersionEntry,
} from './changelog-entries';
import { changelogFeed, type TFeedSite } from './changelog-feed';
import { guidesFromFiles, type TGuideCount } from './changelog-guides';
import { parseItems, type TVersionItem } from './changelog-items';

/** The items of one version's log, as the version page shows them. */
export type TVersionItems = { version: string; items: TVersionItem[] };

/** Where the migration files are, relative to the `*.data.ts` files of this folder (docs/wiki/content/changelogs/<X.Y.Z>/). */
const MIGRATIONS = '../../../../content/changelogs/*/migration.yaml';

/** The items of every version folder, parsed from the log at build time. */
export const createItemsLoader = () =>
  createContentLoader('changelogs/*/log.md', {
    includeSrc: true,
    transform: (raw): TVersionItems[] =>
      raw.flatMap((page) => {
        const version = /\/changelogs\/(\d+\.\d+\.\d+)/.exec(page.url)?.[1];

        return version === undefined
          ? []
          : [{ version, items: parseItems({ src: page.src ?? '' }) }];
      }),
  });

/** How many blocks each guide has and which codemods: small enough for the index and every version page. */
export const createGuideCountsLoader = () => ({
  watch: [MIGRATIONS],
  load: (files: string[]): TGuideCount[] =>
    guidesFromFiles({ files }).map(({ version, blocks }) => ({
      version,
      ids: blocks.map((block) => block.id),
      covered: blocks.filter((block) => block.codemod !== undefined).map((block) => block.id),
      codemods: [
        ...new Set(blocks.flatMap((block) => (block.codemod === undefined ? [] : [block.codemod]))),
      ],
    })),
});

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

/** The version folders (`changelogs/<X.Y.Z>/log.md`), newest first; a wiki that keeps none has an empty list. */
export const createVersionsLoader = () =>
  createContentLoader('changelogs/*/log.md', {
    includeSrc: true,
    transform: (raw): TVersionEntry[] =>
      sortVersions(
        raw.flatMap((page) => {
          const entry = parseVersion({
            url: page.url,
            frontmatter: page.frontmatter,
            src: page.src ?? '',
          });

          return entry === null ? [] : [entry];
        }),
      ),
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
