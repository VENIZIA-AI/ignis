import { describe, expect, test } from 'bun:test';
import { MeilisearchQueryDialect } from '@/search/meilisearch/repositories/dialect/query-dialect';
import { TypesenseQueryDialect } from '@/search/typesense/repositories/dialect/query-dialect';

/**
 * `fieldNotFoundError` is what a request guard throws for a hidden field, so it must read as the query's own refusal of a field
 * the collection does not declare - on the same path (`where` or `order`).
 */

const FIELDS = new Set(['title']);

const messageOf = (task: () => unknown): string => {
  try {
    task();
  } catch (error) {
    return (error as Error).message;
  }

  throw new Error('expected a refusal');
};

describe('Typesense', () => {
  const dialect = new TypesenseQueryDialect();

  test('a where field reads as the undeclared where field does', () => {
    const own = messageOf(() =>
      dialect.compileWhere({ where: { nope: 'x' }, capabilities: { fields: FIELDS } }),
    );

    expect(dialect.fieldNotFoundError({ kind: 'where', field: 'nope' }).message).toBe(own);
  });

  test('an order field reads as the undeclared order field does', () => {
    const own = messageOf(() =>
      dialect.build({ filter: { order: ['nope ASC'] }, capabilities: { fields: FIELDS } }),
    );

    expect(dialect.fieldNotFoundError({ kind: 'order', field: 'nope' }).message).toBe(own);
  });
});

describe('Meilisearch', () => {
  const dialect = new MeilisearchQueryDialect();

  test('a where field reads as the undeclared where field does', () => {
    const own = messageOf(() =>
      dialect.compileWhere({ where: { nope: 'x' }, capabilities: { fields: FIELDS } }),
    );

    expect(dialect.fieldNotFoundError({ kind: 'where', field: 'nope' }).message).toBe(own);
  });

  test('a dotted where field reads as the JSON-path refusal the query gives first', () => {
    const own = messageOf(() =>
      dialect.compileWhere({ where: { 'meta.pin': 'x' }, capabilities: { fields: FIELDS } }),
    );

    expect(dialect.fieldNotFoundError({ kind: 'where', field: 'meta.pin' }).message).toBe(own);
  });

  test('an order field is worded like the other engine: the query itself leaves an order field to the engine', () => {
    expect(dialect.fieldNotFoundError({ kind: 'order', field: 'nope' }).message).toContain(
      'Field NOT FOUND',
    );
  });
});
