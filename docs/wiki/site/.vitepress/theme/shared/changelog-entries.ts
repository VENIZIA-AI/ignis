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
