import { describe, expect, test } from 'bun:test';
import { MeilisearchQueryDialect } from '@/connectors/meilisearch/repositories/dialect/query-dialect';
import { TypesenseQueryDialect } from '@/connectors/typesense/repositories/dialect/query-dialect';

/** `hiddenProperties` is the only thing keeping a password hash out of a search response and it is passed on EVERY call - a dialect that short-circuits on a missing (optional) filter never reaches the exclude-fields block, and the engine happily returns the hidden columns. */
describe('a filterless search still hides the hidden fields', () => {
  test('Typesense: excludeFields is set even when no filter is supplied', () => {
    const query = new TypesenseQueryDialect().build({ hiddenFields: ['password', 'secret'] });

    expect(query.excludeFields).toBe('password,secret');
  });

  test('Typesense: a filter present keeps the same guarantee', () => {
    const query = new TypesenseQueryDialect().build({
      filter: { where: { status: 'active' } },
      hiddenFields: ['password'],
    });

    expect(query.excludeFields).toBe('password');
  });

  test('Typesense: no hidden fields means no excludeFields key at all', () => {
    const query = new TypesenseQueryDialect().build({});

    expect(query.excludeFields).toBeUndefined();
    expect(query.query).toBe('*');
  });
});

describe('Meilisearch rejects hidden fields the same way with or without a filter', () => {
  const dialect = new MeilisearchQueryDialect();

  test('a filterless call with hidden fields does not silently pass them through', () => {
    // Whatever Meilisearch does about hidden fields it must do CONSISTENTLY: the filterless path must not be a hole through which they escape.
    const attempt = () => dialect.build({ hiddenFields: ['password'] });
    const withFilter = () => dialect.build({ filter: { where: {} }, hiddenFields: ['password'] });

    let filterlessThrew = false;
    let withFilterThrew = false;

    try {
      attempt();
    } catch {
      filterlessThrew = true;
    }

    try {
      withFilter();
    } catch {
      withFilterThrew = true;
    }

    expect(filterlessThrew).toBe(withFilterThrew);
  });
});
