import { AtlasModes } from '@/common';
import { ReleaseStore } from '@/releases';
import type { IReleaseTable } from '@/releases';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'bun:test';

const TABLE: IReleaseTable = {
  releases: {
    kernel: [
      { version: '0.2.0-16', date: '2026-09-05', sha: 'fda2d717' },
      { version: '0.2.0-15', date: '2026-09-05', sha: 'd1b3c139' },
      { version: '0.2.0-14', date: '2026-09-04', sha: '5922b420' },
      { version: '0.2.0-13', date: '2026-08-31', sha: '370fd0a2' },
    ],
    helpers: [{ version: '0.2.0-12', date: '2026-09-04', sha: 'aaaaaaaa' }],
  },
  changelogs: [
    {
      id: 'changelog:2026-09-05-list-response-contract',
      file: '2026-09-05-list-response-contract.md',
      date: '2026-09-05',
      title: 'One respond method',
      packages: ['connectors', 'kernel'],
      kind: 'New Feature',
    },
    {
      id: 'changelog:2026-09-04-helpers-only',
      file: '2026-09-04-helpers-only.md',
      date: '2026-09-04',
      title: 'Helpers only',
      packages: ['helpers'],
      kind: null,
    },
    {
      id: 'changelog:2026-08-31-on-the-lower-edge',
      file: '2026-08-31-on-the-lower-edge.md',
      date: '2026-08-31',
      title: 'On the lower edge',
      packages: ['kernel'],
      kind: 'Bug Fix',
    },
    {
      id: 'changelog:2026-08-20-no-package',
      file: '2026-08-20-no-package.md',
      date: '2026-08-20',
      title: 'Names no package',
      packages: [],
      kind: null,
    },
  ],
};

const store = new ReleaseStore({ table: TABLE });

const idsOf = (opts: { package?: string; fromDate: string; toDate: string }): string[] =>
  store.entriesBetween(opts).map(entry => entry.id);

describe('ReleaseStore versions', () => {
  test('lists a package version newest first', () => {
    expect(store.versionsOf({ package: 'kernel' })).toEqual([
      '0.2.0-16',
      '0.2.0-15',
      '0.2.0-14',
      '0.2.0-13',
    ]);
  });

  test('accepts the npm spelling of a package name', () => {
    expect(store.versionsOf({ package: '@venizia/ignis-kernel' })).toHaveLength(4);
  });

  test('lists nothing for a package the table never saw', () => {
    expect(store.versionsOf({ package: 'nowhere' })).toEqual([]);
  });

  test('names the release date of one version', () => {
    expect(store.releaseDateOf({ package: 'kernel', version: '0.2.0-13' })).toBe('2026-08-31');
  });

  test('has no release date for a version the table never saw', () => {
    expect(store.releaseDateOf({ package: 'kernel', version: '9.9.9' })).toBeUndefined();
  });

  test('names the newest release of a package', () => {
    expect(store.newestOf({ package: 'kernel' })?.version).toBe('0.2.0-16');
  });

  test('lists its package names sorted', () => {
    expect(store.packages()).toEqual(['helpers', 'kernel']);
  });

  test('lists every changelog date once, newest first', () => {
    expect(store.entryDates()).toEqual(['2026-09-05', '2026-09-04', '2026-08-31', '2026-08-20']);
  });
});

describe('ReleaseStore.entriesBetween', () => {
  test('excludes an entry dated exactly on fromDate and includes one dated on toDate', () => {
    expect(idsOf({ fromDate: '2026-08-31', toDate: '2026-09-05' })).toEqual([
      'changelog:2026-09-05-list-response-contract',
      'changelog:2026-09-04-helpers-only',
    ]);
  });

  test('includes an entry dated on toDate when the window opens below it', () => {
    expect(idsOf({ fromDate: '2026-08-30', toDate: '2026-08-31' })).toEqual([
      'changelog:2026-08-31-on-the-lower-edge',
    ]);
  });

  test('filters by package', () => {
    expect(idsOf({ package: 'kernel', fromDate: '2026-08-30', toDate: '2026-09-05' })).toEqual([
      'changelog:2026-09-05-list-response-contract',
      'changelog:2026-08-31-on-the-lower-edge',
    ]);
  });

  test('answers newest first', () => {
    const dates = store
      .entriesBetween({ fromDate: '', toDate: '2026-09-05' })
      .map(entry => entry.date);

    expect(dates).toEqual([...dates].sort().reverse());
  });

  test('never returns an entry that names no package when a package is asked for', () => {
    expect(idsOf({ package: 'kernel', fromDate: '', toDate: '2026-09-05' })).not.toContain(
      'changelog:2026-08-20-no-package',
    );
  });

  test('returns nothing for an empty window', () => {
    expect(idsOf({ fromDate: '2026-09-05', toDate: '2026-09-05' })).toEqual([]);
  });
});

describe('ReleaseStore.load', () => {
  const directories: string[] = [];

  afterAll(() => {
    for (const directory of directories) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test('a snapshot with no release table loads empty instead of throwing', () => {
    const root = mkdtempSync(join(tmpdir(), 'atlas-release-store-'));
    directories.push(root);

    const loaded = ReleaseStore.load({ mode: AtlasModes.SNAPSHOT, root });

    expect(loaded.isEmpty()).toBe(true);
    expect(loaded.packages()).toEqual([]);
    expect(loaded.entriesBetween({ fromDate: '', toDate: '2026-09-05' })).toEqual([]);
  });
});
