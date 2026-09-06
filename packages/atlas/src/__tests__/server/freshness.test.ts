import { AtlasModes, Corpora } from '@/common';
import { CorpusLoader, resolveRepositoryRoots } from '@/corpus';
import type { ICorpusRoot } from '@/corpus';
import { FreshnessGuard } from '@/server/freshness';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, spyOn, test } from 'bun:test';

// __dirname, not import.meta: tsconfig.json (unlike tsconfig.build.json) does not exclude
// __tests__, and this package's module mode treats every file as CommonJS output.
const REPOSITORY_ROOT = join(__dirname, '../../../../..');
const FIXTURES = join(__dirname, '../fixtures/corpus');
const FRESHNESS_MARKER = 'zzzfreshnessmarkerzzz';

const tempDirectories: string[] = [];

/** A watched `wiki` root copied from the fixtures into a scratch directory - safe to edit per test. */
const makeWikiRoot = (): ICorpusRoot[] => {
  const workDirectory = mkdtempSync(join(tmpdir(), 'atlas-freshness-test-'));
  tempDirectories.push(workDirectory);
  cpSync(join(FIXTURES, 'wiki'), join(workDirectory, 'wiki'), { recursive: true });
  return [{ corpus: Corpora.WIKI, directory: join(workDirectory, 'wiki'), exclude: ['excluded'] }];
};

/** Guarantees a strictly newer mtime regardless of the filesystem's timestamp resolution. */
const touchIntoTheFuture = (opts: { path: string }): void => {
  const future = new Date(Date.now() + 60_000);
  utimesSync(opts.path, future, future);
};

afterEach(() => {
  for (const directory of tempDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
  tempDirectories.length = 0;
});

describe('FreshnessGuard', () => {
  test('repo mode rebuilds the store when a fixture file changes between two calls', () => {
    const roots = makeWikiRoot();
    const guard = new FreshnessGuard({ mode: AtlasModes.REPOSITORY, roots });

    const before = guard.getStore().search({ query: FRESHNESS_MARKER, limit: 5, offset: 0 });
    expect(before.hits.length).toBe(0);

    const guidePath = join(roots[0].directory, 'guide.md');
    const original = readFileSync(guidePath, 'utf8');
    writeFileSync(
      guidePath,
      `${original}\n\nA paragraph mentioning ${FRESHNESS_MARKER} after the edit.\n`,
    );
    touchIntoTheFuture({ path: guidePath });

    const after = guard.getStore().search({ query: FRESHNESS_MARKER, limit: 5, offset: 0 });
    expect(after.hits.length).toBeGreaterThan(0);
  });

  test('a same-count swap that preserves mtime is still seen, via the byte-size change', () => {
    const roots = makeWikiRoot();
    const guard = new FreshnessGuard({ mode: AtlasModes.REPOSITORY, roots });

    const before = guard.getStore().search({ query: FRESHNESS_MARKER, limit: 5, offset: 0 });
    expect(before.hits.length).toBe(0);

    const guidePath = join(roots[0].directory, 'guide.md');
    const originalStat = statSync(guidePath);

    // Same file count, mtime pinned back to its original value - only the byte size moves, which
    // is exactly the case a count-plus-mtime-only fingerprint would have missed.
    writeFileSync(guidePath, `A short replacement body mentioning ${FRESHNESS_MARKER}.`);
    utimesSync(guidePath, originalStat.atime, originalStat.mtime);

    const after = guard.getStore().search({ query: FRESHNESS_MARKER, limit: 5, offset: 0 });
    expect(after.hits.length).toBeGreaterThan(0);
  });

  test('an unchanged corpus rebuilds nothing', () => {
    const roots = makeWikiRoot();
    const guard = new FreshnessGuard({ mode: AtlasModes.REPOSITORY, roots });

    const loadSpy = spyOn(CorpusLoader.getInstance(), 'load');
    try {
      const first = guard.getStore();
      const second = guard.getStore();

      expect(loadSpy).not.toHaveBeenCalled();
      expect(second).toBe(first);
    } finally {
      loadSpy.mockRestore();
    }
  });

  test('snapshot mode never rebuilds, even when the corpus changes underneath it', () => {
    const roots = makeWikiRoot();
    const guard = new FreshnessGuard({ mode: AtlasModes.SNAPSHOT, roots });
    const first = guard.getStore();

    const guidePath = join(roots[0].directory, 'guide.md');
    writeFileSync(guidePath, `mentions ${FRESHNESS_MARKER} but snapshot mode must never notice`);
    touchIntoTheFuture({ path: guidePath });

    expect(guard.getStore()).toBe(first);
    expect(
      guard.getStore().search({ query: FRESHNESS_MARKER, limit: 5, offset: 0 }).hits.length,
    ).toBe(0);
  });

  test('the fingerprint walk over the real repo roots stays under 20ms', () => {
    const roots = resolveRepositoryRoots({ repositoryRoot: REPOSITORY_ROOT });
    const guard = new FreshnessGuard({ mode: AtlasModes.REPOSITORY, roots });

    const startedAt = performance.now();
    const fingerprint = guard.fingerprint();
    const elapsedMs = performance.now() - startedAt;

    // Printed for the task report - this is the number that matters, not just the assertion.
    console.log(
      `[freshness] fingerprint walk over the real repo roots: ${elapsedMs.toFixed(3)}ms for ${fingerprint.count} files`,
    );

    expect(elapsedMs).toBeLessThan(20);
  });
});
