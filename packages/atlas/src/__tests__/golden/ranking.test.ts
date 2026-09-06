import { Chunker, CorpusLoader, resolveRepoRoots } from '@/corpus';
import { ChunkStore } from '@/search';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import golden from './queries.json';

interface IGoldenQuery {
  query: string;
  expectAnyOf: string[];
  /** Ids that must never appear in the top 3 - a rejected regression, not merely an unlisted answer. */
  rejectAnyOf?: string[];
  /** Human-readable ruling behind a widened `expectAnyOf`; read by a reviewer, ignored by this test. */
  why?: string;
}

// __dirname, not import.meta: tsconfig.json (unlike tsconfig.build.json) does not exclude
// __tests__, and this package's module mode treats every file as CommonJS output.
const REPO_ROOT = join(__dirname, '../../../../..');
const TOP_N = 3;

const queries: IGoldenQuery[] = golden;

const buildStore = (): ChunkStore => {
  const chunker = Chunker.getInstance();
  const documents = CorpusLoader.getInstance().load({
    roots: resolveRepoRoots({ repoRoot: REPO_ROOT }),
  });

  const store = new ChunkStore();
  store.add({ chunks: documents.flatMap(document => chunker.chunk({ document })) });
  return store;
};

/**
 * Builds the index once over the real `docs/wiki/content`, `docs/wiki/content/changelogs` and
 * `.agents/knowledge` trees - not fixtures - so a ranking regression against the live corpus fails
 * here instead of surfacing as a bad answer from a running server.
 */
describe('golden ranking set over the real repository corpus', () => {
  const store = buildStore();
  const rows: Array<[string, string[], string[]]> = queries.map(row => [
    row.query,
    row.expectAnyOf,
    row.rejectAnyOf ?? [],
  ]);

  test.each(rows)(
    '"%s" ranks an expected id in the top 3, with no rejected id present',
    (query, expectAnyOf, rejectAnyOf) => {
      const { hits } = store.search({ query, limit: TOP_N, offset: 0 });
      const top3 = hits.map(hit => hit.id);
      const matched = top3.some(id => expectAnyOf.some(prefix => id.startsWith(prefix)));
      const rejectedHit = top3.find(id => rejectAnyOf.some(prefix => id.startsWith(prefix)));

      // The custom message - not just a boolean - is what a miss prints, so the actual top 3
      // reads straight off the test output instead of requiring a rerun under a debugger.
      expect(
        matched,
        `expected one of [${expectAnyOf.join(', ')}] in the top 3, got [${top3.join(', ')}]`,
      ).toBe(true);
      expect(
        rejectedHit,
        `top 3 must not contain any of [${rejectAnyOf.join(', ')}], got [${top3.join(', ')}]`,
      ).toBeUndefined();
    },
  );
});
