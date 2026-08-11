import { describe, expect, test } from 'bun:test';
import { MeilisearchQueryDialect } from '@/connectors/meilisearch/repositories/dialect/query-dialect';
import { TypesenseQueryDialect } from '@/connectors/typesense/repositories/dialect/query-dialect';

/** Pins that both dialects agree on the byte-shared pagination/fields-CSV/operator-object helpers (search/repositories/common/dialect-helpers), so the lift stays honest. */
describe('search dialect parity - shared pagination / fields helpers', () => {
  const typesense = new TypesenseQueryDialect();
  const meilisearch = new MeilisearchQueryDialect();

  /**
   * PAGINATION IS DELIBERATELY ASYMMETRIC, and the asymmetry is pinned rather than removed.
   *
   * Typesense emits native `offset`/`limit`, so an arbitrary skip is expressible - which matches
   * the relational reference, where skip goes straight to Drizzle
   * (relational/repositories/dialect/filter.ts:283-287). Meilisearch keeps `page`/`hitsPerPage`
   * because its two pagination modes return DIFFERENT response shapes: `page`/`hitsPerPage` gives
   * an exact `totalHits`, `offset`/`limit` gives `estimatedTotalHits` (meilisearch@0.59.0,
   * FinitePagination vs InfinitePagination). Porting it would buy arbitrary skip by making every
   * total an estimate - a trade, not a mechanical change, so it is not made here.
   *
   * Follow-up for Meilisearch is therefore a DECISION, not a copy: exact totals, or arbitrary skip.
   */
  test('typesense expresses a skip as a native offset; meilisearch as a 1-based page', () => {
    const filter = { limit: 10, skip: 20 };

    expect(typesense.build({ filter }).offset).toBe(20);
    expect(typesense.build({ filter }).page).toBeUndefined();
    expect(meilisearch.build({ filter }).page).toBe(3);
  });

  test('a skip off the page boundary: typesense expresses it, meilisearch cannot', () => {
    const filter = { limit: 10, skip: 15 };

    expect(typesense.build({ filter }).offset).toBe(15);
    expect(() => meilisearch.build({ filter })).toThrow(/multiple of limit/);
  });

  test('a skip without a limit: typesense expresses it, meilisearch cannot', () => {
    const filter = { skip: 10 };

    expect(typesense.build({ filter }).offset).toBe(10);
    expect(() => meilisearch.build({ filter })).toThrow(/requires limit/);
  });

  test('array fields -> the same include CSV in both dialects', () => {
    const filter = { fields: ['id', 'name'] };
    expect(typesense.build({ filter }).includeFields).toBe('id,name');
    expect(meilisearch.build({ filter }).includeFields).toBe('id,name');
  });

  test('object fields keep only true keys, identically in both dialects', () => {
    const filter = { fields: { id: true, name: true, secret: false } };
    expect(typesense.build({ filter }).includeFields).toBe('id,name');
    expect(meilisearch.build({ filter }).includeFields).toBe('id,name');
  });
});
