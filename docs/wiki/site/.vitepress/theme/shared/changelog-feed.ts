/**
 * Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
 * scripts/wiki-shared in VULCAN. Edit it there, never in a copy.
 *
 * The changelog feed, RSS 2.0: the XML is built here, with no dependency, from the parsed entries.
 * `writeChangelogFeed` (changelog-loader.ts) writes it as `changelog.xml` at build time.
 */
import { formatDate, type TChangelogEntry, type TVersionEntry } from './changelog-entries';

export type TFeedSite = { title: string; description: string; siteUrl: string };

const escapeXml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The feed: the dated entries as before, and the released version folders. A version still in progress has no
 * release date, so it is not in the feed; its date is `released:`, never the day it was written.
 */
export const changelogFeed = (opts: {
  site: TFeedSite;
  entries: TChangelogEntry[];
  versions?: TVersionEntry[];
}): string => {
  const base = opts.site.siteUrl.replace(/\/$/, '');
  const feedItem = (fields: {
    title: string;
    url: string;
    date: string;
    summary: string;
    categories: string[];
  }) =>
    `<item><title>${escapeXml(fields.title)}</title><link>${base}${fields.url}</link><guid isPermaLink="true">${base}${fields.url}</guid><pubDate>${new Date(`${fields.date}T12:00:00Z`).toUTCString()}</pubDate><description>${escapeXml(fields.summary || formatDate(fields.date))}</description>${fields.categories.map((category) => `<category>${escapeXml(category)}</category>`).join('')}</item>`;
  const releases = (opts.versions ?? []).flatMap((version) =>
    version.released === null
      ? []
      : [
          {
            date: version.released,
            isRelease: true,
            xml: feedItem({
              title: version.title,
              url: version.url,
              date: version.released,
              summary: version.summary,
              categories: ['Release'],
            }),
          },
        ],
  );
  const entries = opts.entries.map((entry) => ({
    date: entry.date,
    isRelease: false,
    xml: feedItem({
      title: entry.title,
      url: entry.url,
      date: entry.date,
      summary: entry.summary,
      categories: entry.types.map((type) => type.label),
    }),
  }));
  // One list, newest day first; on one day a released version comes before the dated entries.
  const items = [...releases, ...entries]
    .sort((a, b) => b.date.localeCompare(a.date) || Number(b.isRelease) - Number(a.isRelease))
    .map((entry) => entry.xml)
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escapeXml(opts.site.title)}</title><link>${base}/changelogs/</link><description>${escapeXml(opts.site.description)}</description>${items}</channel></rss>\n`;
};
