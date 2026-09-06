import type { TAtlasMode } from '@/common';
import { releasesFileOf } from '@/common/layout';
import { BaseHelper } from '@venizia/ignis-helpers/core';
import { existsSync, readFileSync } from 'node:fs';
import type { IChangelogRecord, IReleaseRecord, IReleaseTable } from './common';

// The table is keyed by directory name under `packages/`; two npm names do not follow the suffix.
const NPM_NAME_PATTERN = /^@venizia\/ignis(?:-([a-z0-9-]+))?$/;

/** `@venizia/ignis-kernel` and `kernel` name the same package - the npm spelling maps to its directory. */
export const toPackageDirectory = (value: string): string => {
  const trimmed = value.trim().toLowerCase();
  const scoped = trimmed.match(NPM_NAME_PATTERN);
  if (!scoped) {
    return trimmed;
  }

  switch (scoped[1]) {
    case undefined: {
      return 'core-server';
    }
    case 'worker': {
      return 'core-worker';
    }
    default: {
      return scoped[1];
    }
  }
};

const byText = (left: string, right: string): number => {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
};

/**
 * The generated release table in memory: which versions of a package exist, when each shipped, and
 * which changelog entries fall between two dates. One instance per server - the table never
 * changes while the process runs.
 */
export class ReleaseStore extends BaseHelper {
  private readonly releases = new Map<string, IReleaseRecord[]>();
  private readonly changelogs: IChangelogRecord[];
  private readonly live: string[];

  constructor(opts: { table: IReleaseTable }) {
    super({ scope: ReleaseStore.name });

    for (const [name, records] of Object.entries(opts.table.releases ?? {})) {
      this.releases.set(toPackageDirectory(name), records);
    }

    // Newest first, so every window answers in that order without re-sorting.
    this.changelogs = [...(opts.table.changelogs ?? [])].sort((left, right) =>
      byText(right.date, left.date),
    );
    this.live = [...(opts.table.livePackages ?? [])].map(toPackageDirectory).sort(byText);
  }

  /**
   * Repo mode reads the knowledge bundle's table, snapshot mode the packaged one. A missing or
   * unreadable table leaves the store empty - the tools say so, the server still starts.
   */
  static load(opts: { mode: TAtlasMode; root: string }): ReleaseStore {
    const path = releasesFileOf(opts);
    if (!existsSync(path)) {
      return new ReleaseStore({ table: { releases: {}, changelogs: [] } });
    }

    try {
      const table: IReleaseTable = JSON.parse(readFileSync(path, 'utf8'));
      return new ReleaseStore({ table });
    } catch (error) {
      const store = new ReleaseStore({ table: { releases: {}, changelogs: [] } });
      store.logger
        .for('load')
        .error('unreadable release table | path: %s | error: %s', path, error);
      return store;
    }
  }

  /** Whether no table was loaded at all - distinct from a table that simply does not carry a package. */
  isEmpty(): boolean {
    return this.releases.size === 0 && this.changelogs.length === 0;
  }

  /** Every package the release table knows, sorted. */
  packages(): string[] {
    return [...this.releases.keys()].sort(byText);
  }

  /** Every date a changelog entry carries, newest first, each date once. */
  entryDates(): string[] {
    return [...new Set(this.changelogs.map(record => record.date))];
  }

  /** The packages that exist today; a table generated before this list existed answers with every package it knows. */
  livePackages(): string[] {
    return this.live.length > 0 ? this.live : this.packages();
  }

  /** Every known version of one package, newest first; an unknown package has none. */
  versionsOf(opts: { package: string }): string[] {
    return this.recordsOf(opts).map(record => record.version);
  }

  /** The date one version shipped on, or `undefined` when the table never saw it. */
  releaseDateOf(opts: { package: string; version: string }): string | undefined {
    return this.recordsOf(opts).find(record => record.version === opts.version)?.date;
  }

  /** The newest release of one package, or `undefined` when the table never saw it. */
  newestOf(opts: { package: string }): IReleaseRecord | undefined {
    return this.recordsOf(opts)[0];
  }

  /**
   * The changelog entries in `fromDate < date <= toDate`, newest first. The lower bound is open so
   * the release that opens a window is not counted twice; the upper bound is closed so the release
   * that closes it carries its own entries.
   */
  entriesBetween(opts: { package?: string; fromDate: string; toDate: string }): IChangelogRecord[] {
    const wanted = opts.package === undefined ? undefined : toPackageDirectory(opts.package);

    return this.changelogs.filter(entry => {
      if (entry.date <= opts.fromDate || entry.date > opts.toDate) {
        return false;
      }

      return wanted === undefined || entry.packages.includes(wanted);
    });
  }

  private recordsOf(opts: { package: string }): IReleaseRecord[] {
    return this.releases.get(toPackageDirectory(opts.package)) ?? [];
  }
}
