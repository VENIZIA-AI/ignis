#!/usr/bin/env bun
/**
 * Release table for the Atlas `version` and `changes` tools: every `chore(<package>): release
 * v<version>` commit in the history, and every dated changelog entry with the packages it names.
 * Read from `git log` and `docs/wiki/content/changelogs`, so no build is needed first.
 * Usage: bun scripts/atlas-releases.ts gen|check
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(import.meta.dir, '..');
export const RELEASES_OUTPUT = resolve(REPO, '.agents/knowledge/reference/releases.json');

const CHANGELOG_DIRECTORY = 'docs/wiki/content/changelogs';
const SHORT_SHA_LENGTH = 8;

/** A file the history does not carry yet: it sorts after every committed entry, so a fresh changelog is inside the newest window. */
const UNCOMMITTED_ORDER = Number.MAX_SAFE_INTEGER;

/** One published version of one package, as its release commit recorded it. */
export interface IReleaseRecord {
  version: string;
  date: string;
  sha: string;
  /** Position of the release commit in first-parent history, oldest first - the only ordering that separates two releases of one day. */
  order: number;
}

/** One dated changelog entry; `id` is the citation id `search` and `get` already use. */
export interface IChangelogRecord {
  id: string;
  file: string;
  date: string;
  title: string;
  packages: string[];
  kind: string | null;
  /** Position of the commit that ADDED the file, oldest first; `-1` when the file is not committed yet. */
  order: number;
}

export interface IReleaseTable {
  /** The package directories that exist today; `releases` also holds retired ones, whose history stays readable. */
  livePackages: string[];
  releases: Record<string, IReleaseRecord[]>;
  changelogs: IChangelogRecord[];
}

interface IReleaseSubject {
  package: string;
  version: string;
}

// `chore(kernel): release v0.2.0-21 [prerelease]` - the scope is the directory name under
// `packages/`, and every release commit in the history carries the mode in brackets.
const RELEASE_SUBJECT_PATTERN = /^chore\(([a-z0-9-]+)\): release v(\S+) \[[a-z]+\]$/;

const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---\n?/;
const DATE_PREFIX_PATTERN = /^(\d{4}-\d{2}-\d{2})-/;
const BADGE_TEXT_PATTERN = /<Badge[^>]*\stext="([^"]*)"/;
const TABLE_ROW_PATTERN = /^\s*\|(.*)\|\s*$/;
const TABLE_SEPARATOR_PATTERN = /^\s*\|[\s|:-]+\|\s*$/;

// `@venizia/ignis`, or `@venizia/ignis-<suffix>`; a sub-path (`/core`) is never part of the suffix.
const SCOPED_NAME_PATTERN = /@venizia\/ignis(?:-([a-z0-9-]+))?/g;
const SCOPED_NAME_EXACT_PATTERN = /^@venizia\/ignis(?:-([a-z0-9-]+))?$/;

// A package directory name: lower-case words joined by single hyphens, nothing else.
const PACKAGE_DIRECTORY_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

// Every directory this repository has ever released, live or retired - the set a bare word in a
// `Package` column must belong to. Retired names stay so an old changelog keeps its package.
const KNOWN_PACKAGES = [
  'atlas',
  'boot',
  'connectors',
  'core',
  'core-server',
  'core-worker',
  'dev-configs',
  'docs',
  'docs-mcp',
  'filter',
  'helpers',
  'inversion',
  'kernel',
];

const byText = (left: string, right: string): number => {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
};

/** The npm name's suffix as a directory under `packages/` - two names do not follow the suffix. */
const directoryOfSuffix = (suffix?: string): string => {
  switch (suffix) {
    case undefined: {
      return 'core-server';
    }
    case 'worker': {
      return 'core-worker';
    }
    default: {
      return suffix;
    }
  }
};

/** The bare words a `Package` column uses for a package whose directory has another name. */
const DIRECTORY_ALIASES: Record<string, string> = {
  core: 'core-server',
  ignis: 'core-server',
  worker: 'core-worker',
};

/**
 * A table cell or a frontmatter item as a package directory name, or `undefined` when it names
 * none. A bare word must be a directory this repository has released; a `Package` column also
 * carries prose, and filing an entry under an invented name hides it from every real package.
 */
const directoryOfValue = (opts: { value: string; known: string[] }): string | undefined => {
  const cleaned = opts.value.replace(/`/g, '').trim();
  const scoped = cleaned.match(SCOPED_NAME_EXACT_PATTERN);
  if (scoped) {
    return directoryOfSuffix(scoped[1]);
  }

  const withoutPrefix = cleaned.startsWith('ignis-') ? cleaned.slice('ignis-'.length) : cleaned;
  const aliased = DIRECTORY_ALIASES[withoutPrefix] ?? withoutPrefix;
  if (!PACKAGE_DIRECTORY_PATTERN.test(aliased)) {
    return undefined;
  }

  return opts.known.includes(aliased) ? aliased : undefined;
};

const resolveAll = (opts: { values: string[]; known: string[] }): string[] => {
  const resolved = opts.values
    .map(value => directoryOfValue({ value, known: opts.known }))
    .filter((name): name is string => name !== undefined);
  return [...new Set(resolved)].sort(byText);
};

const cellsOf = (line: string): string[] => {
  const matched = line.match(TABLE_ROW_PATTERN);
  return matched ? matched[1].split('|').map(cell => cell.trim()) : [];
};

/**
 * Every value under a `Package` column, across every table in the body. A row whose cell count
 * differs from its header's contributes nothing - a stray `|` shifts the column, it never renames it.
 */
const packageColumnValuesOf = (opts: { body: string }): string[] => {
  const lines = opts.body.split('\n');
  const values: string[] = [];
  let columnIndex = -1;
  let columnCount = 0;

  for (const line of lines) {
    const cells = cellsOf(line);
    if (cells.length === 0) {
      columnIndex = -1;
      continue;
    }

    if (TABLE_SEPARATOR_PATTERN.test(line)) {
      continue;
    }

    const headerIndex = cells.findIndex(cell => cell.toLowerCase() === 'package');
    if (columnIndex === -1 || headerIndex !== -1) {
      columnIndex = headerIndex;
      columnCount = cells.length;
      continue;
    }

    if (cells.length === columnCount) {
      values.push(cells[columnIndex]);
    }
  }

  return values;
};

/** Every `@venizia/ignis...` mention anywhere in the body, mapped back to directory names. */
const bodyMentionsOf = (opts: { body: string }): string[] =>
  [...opts.body.matchAll(SCOPED_NAME_PATTERN)].map(match => directoryOfSuffix(match[1]));

/** `packages/<dir>`, the heading convention every changelog before 2026-09 used to name its package. */
const PACKAGE_PATH_PATTERN = /packages\/([a-z0-9-]+)/g;

const bodyPathsOf = (opts: { body: string }): string[] =>
  [...opts.body.matchAll(PACKAGE_PATH_PATTERN)].map(match => match[1]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const splitFrontmatter = (text: string): { data: Record<string, unknown>; body: string } => {
  const matched = text.match(FRONTMATTER_PATTERN);
  if (!matched) {
    return { data: {}, body: text };
  }

  const parsed: unknown = Bun.YAML.parse(matched[1]);
  return { data: isRecord(parsed) ? parsed : {}, body: text.slice(matched[0].length) };
};

export class AtlasReleases {
  static render(opts: { repoRoot?: string } = {}): string {
    const repoRoot = opts.repoRoot ?? REPO;
    const table: IReleaseTable = {
      livePackages: AtlasReleases.livePackagesOf({ repoRoot }),
      releases: AtlasReleases.releasesOf({ repoRoot }),
      changelogs: AtlasReleases.changelogsOf({ repoRoot }),
    };

    return `${JSON.stringify(table, null, 2)}\n`;
  }

  /** Every directory under `packages/` that carries a manifest, sorted. */
  static livePackagesOf(opts: { repoRoot: string }): string[] {
    const directory = resolve(opts.repoRoot, 'packages');
    return readdirSync(directory)
      .filter(name => existsSync(resolve(directory, name, 'package.json')))
      .sort();
  }

  static check(opts: { repoRoot?: string; outputPath?: string } = {}): boolean {
    const outputPath = opts.outputPath ?? RELEASES_OUTPUT;
    const expected = AtlasReleases.render({ repoRoot: opts.repoRoot });
    const actual = existsSync(outputPath) ? readFileSync(outputPath, 'utf8') : '';
    return expected.trim() === actual.trim();
  }

  /** `undefined` for any subject that is not a release commit - the scope and the mode are both required. */
  static parseReleaseSubject(opts: { subject: string }): IReleaseSubject | undefined {
    const matched = opts.subject.match(RELEASE_SUBJECT_PATTERN);
    return matched ? { package: matched[1], version: matched[2] } : undefined;
  }

  /**
   * The packages one changelog file names, by the first rule that hits: a `packages:` frontmatter
   * list, a Details table's `Package` column, `@venizia/ignis...` mentions, then `packages/<dir>`
   * paths. A file none of the four answer for resolves to none - the generator never guesses one.
   */
  static packagesOf(opts: { text: string; known?: string[] }): string[] {
    const { data, body } = splitFrontmatter(opts.text);
    const known = opts.known ?? KNOWN_PACKAGES;

    const listed: unknown[] = Array.isArray(data.packages) ? data.packages : [];
    const declared = resolveAll({
      values: listed.filter((item): item is string => typeof item === 'string'),
      known,
    });
    if (declared.length > 0) {
      return declared;
    }

    const tabled = resolveAll({ values: packageColumnValuesOf({ body }), known });
    if (tabled.length > 0) {
      return tabled;
    }

    const mentioned = resolveAll({ values: bodyMentionsOf({ body }), known });
    if (mentioned.length > 0) {
      return mentioned;
    }

    return resolveAll({ values: bodyPathsOf({ body }), known });
  }

  /** The first `<Badge ... text="X" />` in the file, or `null` when it carries none. */
  static kindOf(opts: { text: string }): string | null {
    const matched = opts.text.match(BADGE_TEXT_PATTERN);
    return matched ? matched[1] : null;
  }

  /** The frontmatter `title`, falling back to the file stem - never blank. */
  static titleOf(opts: { text: string; file: string }): string {
    const { data } = splitFrontmatter(opts.text);
    if (typeof data.title === 'string' && data.title.length > 0) {
      return data.title;
    }

    return opts.file.replace(/\.md$/, '');
  }

  /** Newest first per package, in `git log` order; the package keys are sorted, so the file is byte-identical on every machine. */
  private static releasesOf(opts: { repoRoot: string }): Record<string, IReleaseRecord[]> {
    const log = spawnSync(
      'git',
      ['log', '--format=%H|%ad|%s', '--date=short', '--grep', '^chore(.*): release v'],
      { cwd: opts.repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );
    if (log.status !== 0) {
      throw new Error(`[atlas-releases] git log exited ${log.status}\n${log.stderr ?? ''}`);
    }

    const byPackage = new Map<string, IReleaseRecord[]>();
    const lines = (log.stdout ?? '').split('\n').filter(line => line.length > 0);
    const order = AtlasReleases.commitOrderOf({ repoRoot: opts.repoRoot });

    for (const line of lines) {
      const [hash, date, ...rest] = line.split('|');
      const parsed = AtlasReleases.parseReleaseSubject({ subject: rest.join('|') });
      if (!parsed) {
        continue;
      }

      const records = byPackage.get(parsed.package) ?? [];
      records.push({
        version: parsed.version,
        date,
        sha: hash.slice(0, SHORT_SHA_LENGTH),
        order: order.get(hash) ?? UNCOMMITTED_ORDER,
      });
      byPackage.set(parsed.package, records);
    }

    const sorted: Record<string, IReleaseRecord[]> = {};
    for (const name of [...byPackage.keys()].sort(byText)) {
      sorted[name] = byPackage.get(name) ?? [];
    }
    return sorted;
  }

  /** Every commit of first-parent history mapped to its position, oldest first. One `git log`, reused by both collectors. */
  private static commitOrderOf(opts: { repoRoot: string }): Map<string, number> {
    const log = spawnSync('git', ['rev-list', '--first-parent', '--reverse', 'HEAD'], {
      cwd: opts.repoRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    if (log.status !== 0) {
      throw new Error(`[atlas-releases] git rev-list exited ${log.status}\n${log.stderr ?? ''}`);
    }

    const order = new Map<string, number>();
    const hashes = (log.stdout ?? '').split('\n').filter(line => line.length > 0);
    hashes.forEach((hash, index) => order.set(hash, index));
    return order;
  }

  /** The position of the commit that added each changelog file, keyed by file name. */
  private static changelogOrderOf(opts: { repoRoot: string }): Map<string, number> {
    const order = AtlasReleases.commitOrderOf({ repoRoot: opts.repoRoot });
    const log = spawnSync(
      'git',
      [
        'log',
        '--first-parent',
        '--diff-filter=A',
        '--name-only',
        '--format=commit %H',
        '--',
        CHANGELOG_DIRECTORY,
      ],
      { cwd: opts.repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );
    if (log.status !== 0) {
      throw new Error(`[atlas-releases] git log --diff-filter=A exited ${log.status}`);
    }

    const byFile = new Map<string, number>();
    let current = UNCOMMITTED_ORDER;
    for (const line of (log.stdout ?? '').split('\n')) {
      if (line.startsWith('commit ')) {
        current = order.get(line.slice('commit '.length).trim()) ?? UNCOMMITTED_ORDER;
        continue;
      }
      const file = line.trim().split('/').pop();
      if (file && line.endsWith('.md') && !byFile.has(file)) {
        byFile.set(file, current);
      }
    }

    return byFile;
  }

  /**
   * Every changelog file except `index.md`, newest first. A file with no `YYYY-MM-DD` prefix
   * (`template.md`, `planned-schema-migrator.md`) is not a dated entry: it can never fall inside a
   * release window, so it is left out rather than carried with an invented date.
   */
  private static changelogsOf(opts: { repoRoot: string }): IChangelogRecord[] {
    const directory = resolve(opts.repoRoot, CHANGELOG_DIRECTORY);
    const files = readdirSync(directory)
      .filter(file => file.endsWith('.md') && file !== 'index.md')
      .sort(byText)
      .reverse();

    const records: IChangelogRecord[] = [];
    const order = AtlasReleases.changelogOrderOf({ repoRoot: opts.repoRoot });
    for (const file of files) {
      const dated = file.match(DATE_PREFIX_PATTERN);
      if (!dated) {
        continue;
      }

      const text = readFileSync(resolve(directory, file), 'utf8');
      records.push({
        id: `changelog:${file.replace(/\.md$/, '')}`,
        file,
        date: dated[1],
        title: AtlasReleases.titleOf({ text, file }),
        packages: AtlasReleases.packagesOf({ text }),
        kind: AtlasReleases.kindOf({ text }),
        order: order.get(file) ?? UNCOMMITTED_ORDER,
      });
    }

    return records;
  }
}

const run = (): number => {
  switch (process.argv[2]) {
    case 'gen': {
      const rendered = AtlasReleases.render();
      writeFileSync(RELEASES_OUTPUT, rendered);
      const table: IReleaseTable = JSON.parse(rendered);
      const unresolved = table.changelogs.filter(entry => entry.packages.length === 0).length;
      console.log(`wrote ${RELEASES_OUTPUT}`);
      console.log(
        `${table.changelogs.length} changelog entries, ${unresolved} resolving to no package`,
      );
      return 0;
    }
    case 'check': {
      if (AtlasReleases.check()) {
        console.log('fresh .agents/knowledge/reference/releases.json');
        return 0;
      }
      console.error(
        'stale .agents/knowledge/reference/releases.json - the release table drifted; ' +
          'run `make releases-gen`',
      );
      return 1;
    }
    default: {
      console.error('usage: bun scripts/atlas-releases.ts gen|check');
      return 2;
    }
  }
};

if (import.meta.main) {
  process.exit(run());
}
