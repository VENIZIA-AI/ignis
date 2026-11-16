/**
 * Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
 * scripts/wiki-shared in VULCAN. Edit it there, never in a copy.
 *
 * What the changelog index and the entry pages know about an entry, read from fields the entries already
 * have: the date from the file name (YYYY-MM-DD-slug.md), the title and the optional summary from the
 * frontmatter (else its description), the packages list, the optional `release: '<npm name>@<version>'`,
 * and the type from the `<Badge text="...">` line of the body (or an explicit `badges:` list). An entry
 * is a release overview when its frontmatter says `type: release`, its file name has `batch-overview`,
 * or its title ends in "(Overview)". This file is pure (no VitePress import) so a test can run it.
 */
import { countSections, firstSentence, parseItems, type TSectionName } from './changelog-items';

export type TChangelogGroup =
  | 'releases'
  | 'features'
  | 'fixes'
  | 'security'
  | 'breaking'
  | 'behavior'
  | 'other';

export type TChangelogType = { label: string; group: TChangelogGroup };

export type TChangelogEntry = {
  url: string;
  slug: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  title: string;
  summary: string;
  /** The chips to show: one "Release" for an overview, else one per badge. */
  types: TChangelogType[];
  isRelease: boolean;
  packages: string[];
  /** The version this entry belongs to, or null. */
  version: string | null;
};

/** A version folder's page: the loader names it by its source (`/changelogs/0.4.8/log`); the wiki serves it at `/changelogs/0.4.8`. */
const VERSION_URL = /\/changelogs\/(\d+\.\d+\.\d+)(?:\/log)?$/;
const DATED = /^(\d{4}-\d{2}-\d{2})-(.+)$/;
const BADGE = /<Badge\b[^>]*?\btext="([^"]+)"/g;
const VERSION = /\b(\d+\.\d+\.\d+)\b/;

const TYPE_OF_BADGE: Record<string, TChangelogType> = {
  'new feature': { label: 'Feature', group: 'features' },
  enhancement: { label: 'Enhancement', group: 'features' },
  'bug fix': { label: 'Fix', group: 'fixes' },
  security: { label: 'Security', group: 'security' },
  'breaking change': { label: 'Breaking', group: 'breaking' },
  'behavior change': { label: 'Behavior', group: 'behavior' },
};

/** The order a chip list is shown in, and the one a single label is taken from. */
const GROUP_ORDER: TChangelogGroup[] = [
  'security',
  'breaking',
  'features',
  'fixes',
  'behavior',
  'other',
];

const typeOfBadge = (text: string): TChangelogType => {
  // "New Feature, not verified": the first words name the type, the rest is the author's note.
  const known = TYPE_OF_BADGE[text.split(',')[0].trim().toLowerCase()];

  return known ?? { label: text.split(',')[0].trim(), group: 'other' };
};

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * One version folder (`changelogs/<X.Y.Z>/log.md`) as the index and the feed know it. Only the frontmatter, the
 * first paragraph and the items are read: no git, no manifest, so the file is the same in every wiki.
 */
export type TVersionEntry = {
  url: string;
  /** The stable the line releases: the folder name. */
  version: string;
  title: string;
  /** `YYYY-MM-DD` once the stable is out; null while the line is in progress. */
  released: string | null;
  /** One sentence on what the release is: the frontmatter's `summary`, else the first sentence of the opening paragraph. */
  summary: string;
  /** The opening paragraph above the sections, as plain text. */
  overview: string;
  /** The frontmatter's `highlights`: the one-line points a version box shows; empty when the log has none. */
  highlights: string[];
  /** The count of items per section, in the order of the sections, leaving out an empty one. */
  counts: [TSectionName, number][];
  packages: string[];
  /** Whether the page has a `## Breaking` section (outside a code fence). */
  hasBreaking: boolean;
};

/** A plain day, or the ISO string the page data carries for the Date an unquoted `released:` is read as (UTC midnight). */
const DAY = /^(\d{4}-\d{2}-\d{2})(?:T00:00:00(?:\.000)?Z)?$/;

/**
 * The day of a `released:` value: `undefined` when there is none (a line in progress), `null` when it is not a date (the gate
 * reports it; the wiki shows the page as neither released nor in progress). The frontmatter parser reads an unquoted date as a
 * Date (UTC midnight), which the page data carries as an ISO string; a quoted one is text. Only the plain day is accepted: a day
 * with anything after it, or a day the calendar does not have, is not a date.
 */
export const releasedOf = (value: unknown): string | null | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const isDate = value instanceof Date;

  if (isDate && Number.isNaN(value.getTime())) {
    return null;
  }

  const day = DAY.exec(isDate ? value.toISOString() : text(value))?.[1];
  const moment = day === undefined ? Number.NaN : Date.parse(`${day}T00:00:00Z`);

  // the day must come back as written: a day the calendar does not have is not a date
  return day !== undefined &&
    !Number.isNaN(moment) &&
    new Date(moment).toISOString().slice(0, 10) === day
    ? day
    : null;
};

/** Markdown as one line of plain text: no code marks, link targets, emphasis or tags. */
export const plainText = (markdown: string): string =>
  markdown
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/(\*\*|__|\*|_)(.+?)\1/g, '$2')
    .replace(/\s+/g, ' ')
    .trim();

/** Whether the page has a `## Breaking` heading outside a code fence. */
const hasBreakingSection = (src: string): boolean => {
  let fence: string | null = null;

  for (const line of src.split(/\r?\n/)) {
    const mark = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];

    if (mark !== undefined) {
      fence = fence === null ? mark[0] : mark[0] === fence ? null : fence;
    } else if (fence === null && /^##\s+Breaking\s*$/.test(line)) {
      return true;
    }
  }

  return false;
};

/** The text between the frontmatter and the first heading, as plain text. */
const introOf = (src: string): string => {
  const body = src.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
  const first = body.search(/^## /m);

  return plainText(first === -1 ? body : body.slice(0, first));
};

/**
 * VitePress's `transformPageData` for a wiki's config: a version folder's details page and its upgrade page are laid out as
 * plain pages (no sidebar, no outline, no prose column), because SiteLayout mounts their own components; the upgrade page gets
 * its title. Any other page is left as it is.
 */
export const changelogPageData = (opts: {
  pageData: { relativePath: string; frontmatter: Record<string, unknown> };
}): { frontmatter: Record<string, unknown>; title?: string } | undefined => {
  const { relativePath, frontmatter } = opts.pageData;
  const upgrade = /^changelogs\/(\d+\.\d+\.\d+)\/upgrade\.md$/.exec(relativePath)?.[1];

  if (upgrade !== undefined) {
    return { frontmatter: { ...frontmatter, layout: 'page' }, title: `Upgrade to ${upgrade}` };
  }

  return /^changelogs\/\d+\.\d+\.\d+(?:\/log)?\.md$/.test(relativePath)
    ? { frontmatter: { ...frontmatter, layout: 'page' } }
    : undefined;
};

/** A version folder's page as an entry; null for any other page, and for one whose `released:` is not a date. */
export const parseVersion = (opts: {
  url: string;
  frontmatter: Record<string, unknown>;
  src: string;
}): TVersionEntry | null => {
  const version = VERSION_URL.exec(opts.url.replace(/\.html$/, ''))?.[1];
  const released = releasedOf(opts.frontmatter.released);

  if (version === undefined || released === null) {
    return null;
  }

  const packages = Array.isArray(opts.frontmatter.packages)
    ? opts.frontmatter.packages.filter((entry): entry is string => typeof entry === 'string')
    : [];

  const overview = introOf(opts.src);
  const highlights = Array.isArray(opts.frontmatter.highlights)
    ? opts.frontmatter.highlights
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry !== '')
    : [];

  return {
    url: `/changelogs/${version}`,
    version,
    title: text(opts.frontmatter.title) || version,
    released: released ?? null,
    summary: text(opts.frontmatter.summary) || firstSentence({ text: overview }),
    overview,
    highlights,
    counts: countSections({ items: parseItems({ src: opts.src }) }),
    packages,
    hasBreaking: hasBreakingSection(opts.src),
  };
};

const numbers = (version: string): number[] => version.split('.').map(Number);

/** Newest first, by version number. */
export const sortVersions = (versions: TVersionEntry[]): TVersionEntry[] =>
  [...versions].sort((a, b) => {
    const [left, right] = [numbers(a.version), numbers(b.version)];

    return right[0] - left[0] || right[1] - left[1] || right[2] - left[2];
  });

export const parseEntry = (opts: {
  url: string;
  frontmatter: Record<string, unknown>;
  src: string;
}): TChangelogEntry | null => {
  const slug =
    opts.url
      .replace(/\.html$/, '')
      .split('/')
      .pop() ?? '';
  const dated = DATED.exec(slug);

  if (dated === null) {
    return null;
  }

  const title = text(opts.frontmatter.title);
  const isRelease =
    text(opts.frontmatter.type) === 'release' ||
    slug.includes('batch-overview') ||
    /\(overview\)\s*$/i.test(title);
  const explicit = Array.isArray(opts.frontmatter.badges)
    ? opts.frontmatter.badges.filter((entry): entry is string => typeof entry === 'string')
    : [];
  const badges =
    explicit.length > 0 ? explicit : [...opts.src.matchAll(BADGE)].map((match) => match[1]);
  const types = isRelease
    ? [{ label: 'Release', group: 'releases' as const }]
    : [
        ...new Map(
          badges.map((badge) => typeOfBadge(badge)).map((type) => [type.label, type]),
        ).values(),
      ].sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
  const release = text(opts.frontmatter.release);
  const packages = Array.isArray(opts.frontmatter.packages)
    ? opts.frontmatter.packages.filter((entry): entry is string => typeof entry === 'string')
    : [];

  return {
    url: opts.url.replace(/\.html$/, ''),
    slug,
    date: dated[1],
    title,
    summary: text(opts.frontmatter.summary) || text(opts.frontmatter.description),
    types,
    isRelease,
    packages,
    version: release.includes('@')
      ? release.slice(release.lastIndexOf('@') + 1)
      : (VERSION.exec(title)?.[1] ?? null),
  };
};

/** Newest first; on one day a release overview comes before the others, then the file name, descending. */
export const sortEntries = (entries: TChangelogEntry[]): TChangelogEntry[] =>
  [...entries].sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      Number(b.isRelease) - Number(a.isRelease) ||
      b.slug.localeCompare(a.slug),
  );

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "October 26, 2026" from an ISO date, without the time zone of the reader or the build machine. */
export const formatDate = (iso: string): string => {
  const [year, month, day] = iso.split('-').map(Number);

  return `${MONTHS[month - 1]} ${day}, ${year}`;
};

/** The filter tabs, in the order shown: a tab shows an entry when one of its types is in its group list. */
export const FILTERS: { id: string; label: string; groups: TChangelogGroup[] }[] = [
  { id: 'all', label: 'All', groups: [] },
  { id: 'releases', label: 'Releases', groups: ['releases'] },
  { id: 'features', label: 'Features', groups: ['features'] },
  { id: 'fixes', label: 'Fixes', groups: ['fixes'] },
  { id: 'security', label: 'Security', groups: ['security'] },
  { id: 'breaking', label: 'Breaking', groups: ['breaking'] },
];

export const matchesFilter = (entry: TChangelogEntry, id: string): boolean => {
  const filter = FILTERS.find((candidate) => candidate.id === id);

  return (
    filter === undefined ||
    filter.groups.length === 0 ||
    entry.types.some((type) => filter.groups.includes(type.group))
  );
};
