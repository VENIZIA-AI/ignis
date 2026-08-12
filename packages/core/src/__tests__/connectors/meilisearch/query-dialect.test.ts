import { describe, expect, test } from 'bun:test';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { MeilisearchQueryDialect } from '@/connectors/meilisearch';
import { SearchModes } from '@/connectors/search/repositories/common';

describe('MeilisearchQueryDialect.toWhere', () => {
  const dialect = new MeilisearchQueryDialect();

  test('equality and comparison use SQL-like operators', () => {
    expect(dialect.toWhere({ where: { genre: 'horror' } })).toBe("genre = 'horror'");
    expect(dialect.toWhere({ where: { rating: { gt: 3 } } })).toBe('rating > 3');
    expect(dialect.toWhere({ where: { isActive: true } })).toBe('isActive = true');
  });

  test('multiple operators on one field AND-join inside parentheses', () => {
    expect(dialect.toWhere({ where: { rating: { gte: 3, lte: 9 } } })).toBe(
      '(rating >= 3 AND rating <= 9)',
    );
  });

  test('inq becomes IN, nin becomes NOT IN', () => {
    expect(dialect.toWhere({ where: { genre: { inq: ['a', 'b'] } } })).toBe("genre IN ['a', 'b']");
    expect(dialect.toWhere({ where: { genre: { nin: ['a'] } } })).toBe("genre NOT IN ['a']");
  });

  test('between becomes the TO range form', () => {
    expect(dialect.toWhere({ where: { price: { between: [10, 20] } } })).toBe('price 10 TO 20');
  });

  test('and/or group with parentheses', () => {
    expect(dialect.toWhere({ where: { or: [{ genre: 'horror' }, { genre: 'comedy' }] } })).toBe(
      "(genre = 'horror' OR genre = 'comedy')",
    );
    expect(dialect.toWhere({ where: { and: [{ a: 1 }, { b: 2 }] } })).toBe('(a = 1 AND b = 2)');
  });

  test('multiple top-level keys AND-join', () => {
    expect(dialect.toWhere({ where: { genre: 'horror', rating: { gt: 3 } } })).toBe(
      "genre = 'horror' AND rating > 3",
    );
  });

  test('single quotes inside a string value are escaped', () => {
    expect(dialect.toWhere({ where: { title: "it's" } })).toBe("title = 'it\\'s'");
  });

  test('an operator with no Meilisearch equivalent throws', () => {
    expect(() => dialect.toWhere({ where: { title: { ilike: '%a%' } } })).toThrow(/ilike/i);
    expect(() => dialect.toWhere({ where: { title: { regexp: '^a' } } })).toThrow(/regexp/i);
  });

  test('a JSON-path field throws', () => {
    expect(() => dialect.toWhere({ where: { 'metadata.score': 1 } })).toThrow(/JSON-path/);
  });

  test('non-finite numbers throw', () => {
    expect(() => dialect.toWhere({ where: { price: Number.NaN } })).toThrow(/non-finite/);
  });
});

describe('MeilisearchQueryDialect.toWireParams', () => {
  const dialect = new MeilisearchQueryDialect();

  test('page/perPage map to the exhaustive page/hitsPerPage mode, never offset/limit', () => {
    const wire = dialect.toWireParams({ query: { query: 'shoes', page: 2, perPage: 10 } });

    expect(wire['q']).toBe('shoes');
    expect(wire['page']).toBe(2);
    expect(wire['hitsPerPage']).toBe(10);
    expect(wire['offset']).toBeUndefined();
    expect(wire['limit']).toBeUndefined();
  });

  test('filterBy -> filter, sortBy -> sort array, includeFields -> attributesToRetrieve', () => {
    const wire = dialect.toWireParams({
      query: {
        query: '*',
        filterBy: "genre = 'horror'",
        sortBy: 'price:asc,name:desc',
        includeFields: 'id,title',
        facetBy: 'genre',
      },
    });

    expect(wire['filter']).toBe("genre = 'horror'");
    expect(wire['sort']).toEqual(['price:asc', 'name:desc']);
    expect(wire['attributesToRetrieve']).toEqual(['id', 'title']);
    expect(wire['facets']).toEqual(['genre']);
  });

  test('engineParams merge last, verbatim', () => {
    const wire = dialect.toWireParams({
      query: { query: '*', engineParams: { matchingStrategy: 'all' } },
    });

    expect(wire['matchingStrategy']).toBe('all');
  });

  test('excludeFields has no Meilisearch equivalent and throws', () => {
    expect(() => dialect.toWireParams({ query: { query: '*', excludeFields: 'secret' } })).toThrow(
      /excludeFields/,
    );
  });
});

describe('MeilisearchQueryDialect.applySearchInput', () => {
  const dialect = new MeilisearchQueryDialect();

  test('semantic mode pins semanticRatio to 1.0 and carries the vector', () => {
    const query = dialect.build({});
    dialect.applySearchInput({
      query,
      input: { mode: SearchModes.SEMANTIC, vectorField: 'embedding', nearVector: [0.1] },
    });

    const wire = dialect.toWireParams({ query });
    expect(wire['hybrid']).toEqual({ semanticRatio: 1, embedder: 'embedding' });
    expect(wire['vector']).toEqual([0.1]);
  });

  test('semantic mode without a vector embeds queryText server-side', () => {
    const query = dialect.build({});
    dialect.applySearchInput({
      query,
      input: { mode: SearchModes.SEMANTIC, vectorField: 'embedding', queryText: 'shoes' },
    });

    const wire = dialect.toWireParams({ query });
    expect(wire['q']).toBe('shoes');
    expect(wire['vector']).toBeUndefined();
  });

  test('hybrid mode maps alpha to semanticRatio, defaulting to 0.5', () => {
    const query = dialect.build({});
    dialect.applySearchInput({
      query,
      input: {
        mode: SearchModes.HYBRID,
        query: 'shoes',
        queryBy: ['title'],
        vectorField: 'embedding',
      },
    });

    const wire = dialect.toWireParams({ query });
    expect(wire['hybrid']).toEqual({ semanticRatio: 0.5, embedder: 'embedding' });
  });

  test('keyword mode copies query and queryBy', () => {
    const query = dialect.build({});
    dialect.applySearchInput({
      query,
      input: { mode: SearchModes.KEYWORD, query: 'shoes', queryBy: ['title', 'brand'] },
    });

    const wire = dialect.toWireParams({ query });
    expect(wire['q']).toBe('shoes');
    expect(wire['attributesToSearchOn']).toEqual(['title', 'brand']);
  });

  test('an explicitly set Typesense-only knob throws NotSupported rather than being dropped', () => {
    const query = dialect.build({});

    // These knobs moved to engineParams, so a typed caller cannot set them; the cast simulates a raw JS caller reaching the defensive guard.
    expect(() =>
      dialect.applySearchInput({
        query,
        input: { mode: SearchModes.KEYWORD, query: 'shoes', numTypos: 2 } as AnyType,
      }),
    ).toThrow(/numTypos/);

    expect(() =>
      dialect.applySearchInput({
        query,
        input: { mode: SearchModes.KEYWORD, query: 'shoes', pinnedHits: '1:1' } as AnyType,
      }),
    ).toThrow(/pinnedHits/);
  });

  test('an unset Typesense-only knob is fine', () => {
    const query = dialect.build({});

    expect(() =>
      dialect.applySearchInput({ query, input: { mode: SearchModes.KEYWORD, query: 'shoes' } }),
    ).not.toThrow();
  });
});
