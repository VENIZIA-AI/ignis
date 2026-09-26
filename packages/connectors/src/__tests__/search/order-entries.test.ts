import { describe, expect, test } from 'bun:test';
import { isApplicationError } from '@venizia/ignis-helpers/core';
import type { ApplicationError } from '@venizia/ignis-helpers/core';
import type { ISearchQueryDialect } from '@/search/core/repositories/common';
import { MeilisearchQueryDialect } from '@/search/meilisearch/repositories/dialect/query-dialect';
import { TypesenseQueryDialect } from '@/search/typesense/repositories/dialect/query-dialect';

/**
 * Both search dialects read an order entry through the shared `parseOrderEntry`, so they accept
 * and reject exactly what the relational dialect does - a caller mistake is a 400 that names the
 * whole entry, never a sort that silently drops what it did not understand.
 */

const DIALECTS: Array<{ name: string; dialect: ISearchQueryDialect }> = [
  { name: 'Typesense', dialect: new TypesenseQueryDialect() },
  { name: 'Meilisearch', dialect: new MeilisearchQueryDialect() },
];

const captureError = (task: () => unknown): ApplicationError => {
  try {
    task();
  } catch (error) {
    if (isApplicationError(error)) {
      return error;
    }

    throw error;
  }

  throw new Error('expected the call to throw, but it returned normally');
};

describe.each(DIALECTS)('$name dialect - order entries', ({ dialect }) => {
  const sortBy = (order: string[]) => dialect.build({ filter: { order } }).sortBy;

  test('valid entries translate to field:direction', () => {
    expect(sortBy(['price DESC', 'name asc', 'rank'])).toBe('price:desc,name:asc,rank:asc');
  });

  test('a tab or several spaces between the tokens still parse', () => {
    expect(sortBy(['price\tDESC', '  name    Desc  '])).toBe('price:desc,name:desc');
  });

  test('an invalid direction is a 400 naming the whole entry', () => {
    const error = captureError(() => sortBy(['price sideways']));

    expect(error.statusCode).toBe(400);
    expect(error.message).toContain('price sideways');
  });

  test('more than two tokens is a 400, not a sort that drops the rest', () => {
    const error = captureError(() => sortBy(['price desc NULLS LAST']));

    expect(error.statusCode).toBe(400);
    expect(error.message).toContain('price desc NULLS LAST');
  });

  test('a line break in the entry reaches the message escaped, on one line', () => {
    const entry = 'price\nFAKE LOG LINE desc';
    const error = captureError(() => sortBy([entry]));

    expect(error.statusCode).toBe(400);
    expect(error.message).toContain(JSON.stringify(entry));
    expect(error.message).not.toContain('\n');
  });

  test('an entry with no field is a 400', () => {
    const error = captureError(() => sortBy(['   ']));

    expect(error.statusCode).toBe(400);
  });
});
