import { Corpora } from '@/common';
import type { TCorpus } from '@/common';
import type { IChunk } from '@/corpus';
import { ChunkStore } from '@/search/store';
import { describe, expect, test } from 'bun:test';

const buildChunk = (opts: {
  id: string;
  corpus?: TCorpus;
  document?: string;
  anchor: string;
  title: string;
  body: string;
  symbols?: string;
}): IChunk => ({
  id: opts.id,
  corpus: opts.corpus ?? Corpora.WIKI,
  document: opts.document ?? 'guide.md',
  anchor: opts.anchor,
  headingPath: opts.title,
  title: opts.title,
  body: opts.body,
  symbols: opts.symbols ?? '',
});

// Six chunks, each earning its place in the fixture:
// - AND_MATCH contains both query terms - the AND plan's one hit.
// - OR_REGISTER_ONLY / OR_ARTIFACTS_ONLY each contain one term - only the OR plan finds them.
// - OTHER_CORPUS contains both terms too, but in a different corpus, to prove the filter excludes it.
// - SYMBOL_HIT / PROSE_HIT carry the same identifier in `symbols` vs. prose in `body`, to prove the
//   symbols column's higher bm25 weight outranks a plain mention.
const AND_MATCH = buildChunk({
  id: 'wiki:guide.md#and-match',
  anchor: 'and-match',
  title: 'Registering artifacts',
  body: 'Register the artifacts before boot completes so every binding resolves in one pass.',
});

const OR_REGISTER_ONLY = buildChunk({
  id: 'wiki:guide.md#or-register',
  anchor: 'or-register',
  title: 'Boot order',
  body: 'Register the primary datasource connection first, before anything else starts.',
});

const OR_ARTIFACTS_ONLY = buildChunk({
  id: 'wiki:guide.md#or-artifacts',
  anchor: 'or-artifacts',
  title: 'Generated files',
  body: 'The generated artifacts folder is safe to delete and rebuild at any time.',
});

const OTHER_CORPUS = buildChunk({
  id: 'changelog:2026-01-01-thing#register-artifacts',
  corpus: Corpora.CHANGELOG,
  document: '2026-01-01-thing.md',
  anchor: 'register-artifacts',
  title: 'Register and artifacts',
  body: 'This release changes how the boot sequence will register every artifacts entry.',
});

const SYMBOL_HIT = buildChunk({
  id: 'wiki:guide.md#symbol-hit',
  anchor: 'symbol-hit',
  title: 'Symbols and lookups',
  body: 'Every registration is confirmed once before the application starts serving traffic.',
  symbols: 'verifybindings',
});

const PROSE_HIT = buildChunk({
  id: 'wiki:guide.md#prose-hit',
  anchor: 'prose-hit',
  title: 'Manual checks',
  body: 'Call verifybindings once during boot to confirm every registration resolved cleanly.',
});

const FIXTURE_CHUNKS: IChunk[] = [
  AND_MATCH,
  OR_REGISTER_ONLY,
  OR_ARTIFACTS_ONLY,
  OTHER_CORPUS,
  SYMBOL_HIT,
  PROSE_HIT,
];

describe('ChunkStore', () => {
  const store = new ChunkStore();
  store.add({ chunks: FIXTURE_CHUNKS });

  describe('AND-first planning with an OR fallback', () => {
    test('the exact AND match ranks first', () => {
      const { hits } = store.search({
        query: 'register artifacts',
        corpus: Corpora.WIKI,
        limit: 10,
        offset: 0,
      });
      expect(hits[0]?.id).toBe(AND_MATCH.id);
    });

    test('when the AND plan yields fewer than the limit, OR hits fill the rest without duplicates', () => {
      const { hits, total } = store.search({
        query: 'register artifacts',
        corpus: Corpora.WIKI,
        limit: 3,
        offset: 0,
      });

      expect(hits.map(hit => hit.id)).toEqual([
        AND_MATCH.id,
        OR_REGISTER_ONLY.id,
        OR_ARTIFACTS_ONLY.id,
      ]);
      expect(new Set(hits.map(hit => hit.id)).size).toBe(hits.length);
      expect(total).toBe(3);
    });

    test('total counts the distinct union of the AND and OR plans, independent of the page size', () => {
      const { total } = store.search({
        query: 'register artifacts',
        corpus: Corpora.WIKI,
        limit: 1,
        offset: 0,
      });
      expect(total).toBe(3);
    });

    test('offset pages across the concatenated AND+OR list', () => {
      const page = store.search({
        query: 'register artifacts',
        corpus: Corpora.WIKI,
        limit: 2,
        offset: 1,
      });
      expect(page.hits.map(hit => hit.id)).toEqual([OR_REGISTER_ONLY.id, OR_ARTIFACTS_ONLY.id]);
      expect(page.total).toBe(3);
    });
  });

  describe('corpus filter', () => {
    test('excludes chunks from other corpora', () => {
      const { hits, total } = store.search({
        query: 'register artifacts',
        corpus: Corpora.WIKI,
        limit: 10,
        offset: 0,
      });
      expect(hits.some(hit => hit.id === OTHER_CORPUS.id)).toBe(false);
      expect(total).toBe(3);
    });

    test('a different corpus filter finds only its own match', () => {
      const { hits, total } = store.search({
        query: 'register artifacts',
        corpus: Corpora.CHANGELOG,
        limit: 10,
        offset: 0,
      });
      expect(hits.map(hit => hit.id)).toEqual([OTHER_CORPUS.id]);
      expect(total).toBe(1);
    });
  });

  describe('snippets', () => {
    test('carry the highlighted term and never exceed 300 characters', () => {
      const { hits } = store.search({
        query: 'register artifacts',
        corpus: Corpora.WIKI,
        limit: 1,
        offset: 0,
      });

      expect(hits).toHaveLength(1);
      const [hit] = hits;
      expect(hit?.snippet).toContain('[');
      expect(hit?.snippet).toContain(']');
      expect(hit?.snippet.length).toBeLessThanOrEqual(300);
    });
  });

  describe('identifier vs. prose ranking', () => {
    test('a hit in the symbols column outranks a prose-only mention of the same term', () => {
      const { hits, total } = store.search({ query: 'verifybindings', limit: 10, offset: 0 });
      expect(total).toBe(2);
      expect(hits.map(hit => hit.id)).toEqual([SYMBOL_HIT.id, PROSE_HIT.id]);
    });
  });

  describe('get', () => {
    test('returns the chunk by id, including its body', () => {
      expect(store.get({ id: AND_MATCH.id })).toEqual(AND_MATCH);
    });

    test('returns undefined for an unknown id', () => {
      expect(store.get({ id: 'wiki:missing#nope' })).toBeUndefined();
    });
  });

  describe('list', () => {
    test('returns every chunk for one document, and none from another', () => {
      const chunks = store.list({ document: 'guide.md' });
      expect(chunks.map(chunk => chunk.id).sort()).toEqual(
        [AND_MATCH, OR_REGISTER_ONLY, OR_ARTIFACTS_ONLY, SYMBOL_HIT, PROSE_HIT]
          .map(chunk => chunk.id)
          .sort(),
      );
    });
  });

  describe('close', () => {
    // Its own store: closing the shared `store` above would break every other test in this file.
    test('search() after close() throws; closing an already-closed store is harmless', () => {
      const disposable = new ChunkStore();
      disposable.add({ chunks: [AND_MATCH] });

      disposable.close();
      expect(() => disposable.close()).not.toThrow();
      expect(() => disposable.search({ query: 'register', limit: 10, offset: 0 })).toThrow();
    });
  });
});
