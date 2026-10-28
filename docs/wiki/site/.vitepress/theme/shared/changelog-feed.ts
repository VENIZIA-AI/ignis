/**
 * Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
 * scripts/wiki-shared in VULCAN. Edit it there, never in a copy.
 *
 * The changelog feed, RSS 2.0: the XML is built here, with no dependency, from the parsed entries.
 * `writeChangelogFeed` (changelog-loader.ts) writes it as `changelog.xml` at build time.
 */
import { formatDate, type TChangelogEntry } from './changelog-entries';

export type TFeedSite = { title: string; description: string; siteUrl: string };

const escapeXml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const changelogFeed = (opts: { site: TFeedSite; entries: TChangelogEntry[] }): string => {
  const base = opts.site.siteUrl.replace(/\/$/, '');
  const items = opts.entries
    .map((entry) => {
      const kinds = entry.types
        .map((type) => `<category>${escapeXml(type.label)}</category>`)
        .join('');

      return `<item><title>${escapeXml(entry.title)}</title><link>${base}${entry.url}</link><guid isPermaLink="true">${base}${entry.url}</guid><pubDate>${new Date(`${entry.date}T12:00:00Z`).toUTCString()}</pubDate><description>${escapeXml(entry.summary || formatDate(entry.date))}</description>${kinds}</item>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escapeXml(opts.site.title)}</title><link>${base}/changelogs/</link><description>${escapeXml(opts.site.description)}</description>${items}</channel></rss>\n`;
};
