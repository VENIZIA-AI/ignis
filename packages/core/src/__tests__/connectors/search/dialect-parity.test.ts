import { describe, expect, test } from 'bun:test';
import { MeilisearchQueryDialect } from '@/connectors/meilisearch/repositories/dialect/query-dialect';
import { TypesenseQueryDialect } from '@/connectors/typesense/repositories/dialect/query-dialect';

/** Pins that both dialects agree on the byte-shared pagination/fields-CSV/operator-object helpers
 * (search/repositories/common/dialect-helpers), so the lift stays honest. */
describe('search dialect parity - shared pagination / fields helpers', () => {
  const typesense = new TypesenseQueryDialect();
  const meilisearch = new MeilisearchQueryDialect();

  test('skip/limit -> the same 1-based page in both dialects', () => {
    const filter = { limit: 10, skip: 20 };
    expect(typesense.build({ filter }).page).toBe(3);
    expect(meilisearch.build({ filter }).page).toBe(3);
  });

  test('both reject a skip that is not a multiple of limit', () => {
    const filter = { limit: 10, skip: 15 };
    expect(() => typesense.build({ filter })).toThrow(/multiple of limit/);
    expect(() => meilisearch.build({ filter })).toThrow(/multiple of limit/);
  });

  test('both reject skip without a limit (no page size)', () => {
    const filter = { skip: 10 };
    expect(() => typesense.build({ filter })).toThrow(/requires limit/);
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
