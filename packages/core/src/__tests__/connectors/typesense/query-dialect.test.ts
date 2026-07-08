import { describe, expect, test } from 'bun:test';
import { TypesenseQueryDialect } from '@/connectors/typesense/repositories/dialect/query-dialect';

describe('TypesenseQueryDialect.toWhere - translation table (spec 7.2)', () => {
  const dialect = new TypesenseQueryDialect();

  test('equality { f: v } -> f:=v (string)', () => {
    expect(dialect.toWhere({ where: { status: 'active' } })).toBe('status:=`active`');
  });

  test('equality { f: v } -> f:=v (number)', () => {
    expect(dialect.toWhere({ where: { age: 18 } })).toBe('age:=18');
  });

  test('equality { f: v } -> f:=v (boolean)', () => {
    expect(dialect.toWhere({ where: { isActive: true } })).toBe('isActive:=true');
  });

  test('explicit eq -> f:=v (string)', () => {
    expect(dialect.toWhere({ where: { status: { eq: 'active' } } })).toBe('status:=`active`');
  });

  test('explicit eq -> f:=v (number)', () => {
    expect(dialect.toWhere({ where: { age: { eq: 18 } } })).toBe('age:=18');
  });

  test('neq -> f:!=v', () => {
    expect(dialect.toWhere({ where: { status: { neq: 'inactive' } } })).toBe('status:!=`inactive`');
  });

  test('gt -> f:>v', () => {
    expect(dialect.toWhere({ where: { age: { gt: 18 } } })).toBe('age:>18');
  });

  test('gte -> f:>=v', () => {
    expect(dialect.toWhere({ where: { age: { gte: 18 } } })).toBe('age:>=18');
  });

  test('lt -> f:<v', () => {
    expect(dialect.toWhere({ where: { age: { lt: 65 } } })).toBe('age:<65');
  });

  test('lte -> f:<=v', () => {
    expect(dialect.toWhere({ where: { age: { lte: 65 } } })).toBe('age:<=65');
  });

  test('inq -> f:=[a,b]', () => {
    expect(dialect.toWhere({ where: { tier: { inq: ['gold', 'silver'] } } })).toBe(
      'tier:=[`gold`,`silver`]',
    );
  });

  test('bare array value -> f:=[a,b] (inq semantics, strings)', () => {
    expect(dialect.toWhere({ where: { tags: ['a', 'b'] } })).toBe('tags:=[`a`,`b`]');
  });

  test('bare array value -> f:=[a,b] (inq semantics, numbers)', () => {
    expect(dialect.toWhere({ where: { ids: [1, 2, 3] } })).toBe('ids:=[1,2,3]');
  });

  test('nin -> f:!=[a,b]', () => {
    expect(dialect.toWhere({ where: { tier: { nin: ['bronze', 'free'] } } })).toBe(
      'tier:!=[`bronze`,`free`]',
    );
  });

  test('between: [a,b] -> f:[a..b]', () => {
    expect(dialect.toWhere({ where: { price: { between: [10, 20] } } })).toBe('price:[10..20]');
  });

  test('between throws when value is not a [min, max] tuple', () => {
    expect(() => dialect.toWhere({ where: { price: { between: [10] } } })).toThrow();
  });

  describe('ne/is/isn/in aliases (shared-vocabulary parity with PostgresQueryOperators.FNS)', () => {
    test('ne -> f:!=v (same as neq)', () => {
      expect(dialect.toWhere({ where: { status: { ne: 'inactive' } } })).toBe(
        'status:!=`inactive`',
      );
    });

    test('is -> f:=v (same as eq)', () => {
      expect(dialect.toWhere({ where: { status: { is: 'active' } } })).toBe('status:=`active`');
    });

    test('isn -> f:!=v (same as neq)', () => {
      expect(dialect.toWhere({ where: { status: { isn: 'inactive' } } })).toBe(
        'status:!=`inactive`',
      );
    });

    test('in -> f:=[a,b] (same as inq)', () => {
      expect(dialect.toWhere({ where: { tier: { in: ['gold', 'silver'] } } })).toBe(
        'tier:=[`gold`,`silver`]',
      );
    });

    test('is: null throws - Typesense has no null representation', () => {
      expect(() => dialect.toWhere({ where: { status: { is: null } } })).toThrow(
        /null representation/,
      );
    });

    test('isn: null throws - Typesense has no null representation', () => {
      expect(() => dialect.toWhere({ where: { status: { isn: null } } })).toThrow(
        /null representation/,
      );
    });
  });

  test('and -> (x && y)', () => {
    expect(dialect.toWhere({ where: { and: [{ status: 'active' }, { age: { gte: 18 } }] } })).toBe(
      '(status:=`active` && age:>=18)',
    );
  });

  test('or -> (x || y)', () => {
    expect(dialect.toWhere({ where: { or: [{ status: 'active' }, { status: 'pending' }] } })).toBe(
      '(status:=`active` || status:=`pending`)',
    );
  });

  test('multiple top-level keys AND-join', () => {
    expect(dialect.toWhere({ where: { status: 'active', age: { gte: 18 } } })).toBe(
      'status:=`active` && age:>=18',
    );
  });

  test('nested and/or recurse with parentheses', () => {
    expect(
      dialect.toWhere({
        where: {
          status: 'active',
          or: [{ tier: 'gold' }, { and: [{ age: { gte: 18 } }, { age: { lte: 65 } }] }],
        },
      }),
    ).toBe('status:=`active` && (tier:=`gold` || (age:>=18 && age:<=65))');
  });
});

describe('TypesenseQueryDialect - string escaping (injection-safe backtick literal quoting)', () => {
  const dialect = new TypesenseQueryDialect();

  test('a value containing a backtick throws', () => {
    expect(() => dialect.toWhere({ where: { name: 'x`y' } })).toThrow();
  });

  test('a value containing typesense-operator-looking text stays inside backticks (round-trips as a literal)', () => {
    expect(dialect.toWhere({ where: { note: 'a && b:=1' } })).toBe('note:=`a && b:=1`');
  });

  test('a bare array containing a backtick-bearing string still throws', () => {
    expect(() => dialect.toWhere({ where: { tags: ['a', 'x`y'] } })).toThrow();
  });
});

describe('TypesenseQueryDialect - NaN/Infinity guard', () => {
  const dialect = new TypesenseQueryDialect();

  test('eq: NaN throws instead of emitting "field:=NaN"', () => {
    expect(() => dialect.toWhere({ where: { price: NaN } })).toThrow(/non-finite/);
  });

  test('eq: Infinity throws', () => {
    expect(() => dialect.toWhere({ where: { price: Infinity } })).toThrow(/non-finite/);
  });

  test('gt: NaN throws', () => {
    expect(() => dialect.toWhere({ where: { price: { gt: NaN } } })).toThrow(/non-finite/);
  });

  test('between: NaN in the tuple throws', () => {
    expect(() => dialect.toWhere({ where: { price: { between: [NaN, 20] } } })).toThrow(
      /non-finite/,
    );
  });

  test('between: -Infinity in the tuple throws', () => {
    expect(() => dialect.toWhere({ where: { price: { between: [-Infinity, 20] } } })).toThrow(
      /non-finite/,
    );
  });

  test('inq: NaN in the array throws', () => {
    expect(() => dialect.toWhere({ where: { price: { inq: [1, NaN] } } })).toThrow(/non-finite/);
  });

  test('finite numbers still pass through unaffected', () => {
    expect(dialect.toWhere({ where: { price: 0 } })).toBe('price:=0');
    expect(dialect.toWhere({ where: { price: -1.5 } })).toBe('price:=-1.5');
  });
});

describe('TypesenseQueryDialect - untranslatable operators/shapes throw, naming search()', () => {
  const dialect = new TypesenseQueryDialect();

  test('like throws', () => {
    expect(() => dialect.toWhere({ where: { name: { like: '%john%' } } })).toThrow(/search\(\)/);
  });

  test('ilike throws', () => {
    expect(() => dialect.toWhere({ where: { name: { ilike: '%john%' } } })).toThrow(/search\(\)/);
  });

  test('regexp throws', () => {
    expect(() => dialect.toWhere({ where: { name: { regexp: '^j' } } })).toThrow(/search\(\)/);
  });

  test('dotted key (JSON path) throws', () => {
    expect(() => dialect.toWhere({ where: { 'metadata.score': { gt: 1 } } })).toThrow(/search\(\)/);
  });

  test('filter.include present throws', () => {
    expect(() => dialect.build({ filter: { include: [{ relation: 'posts' }] } })).toThrow(
      /search\(\)/,
    );
  });
});

describe('TypesenseQueryDialect.build - order/sortBy', () => {
  const dialect = new TypesenseQueryDialect();

  test("order: ['price DESC','name ASC'] -> sortBy: 'price:desc,name:asc'", () => {
    const result = dialect.build({ filter: { order: ['price DESC', 'name ASC'] } });
    expect(result.sortBy).toBe('price:desc,name:asc');
  });

  test('order entry with missing direction defaults to asc', () => {
    const result = dialect.build({ filter: { order: ['name'] } });
    expect(result.sortBy).toBe('name:asc');
  });

  test('order direction is case-insensitive', () => {
    const result = dialect.build({ filter: { order: ['price desc'] } });
    expect(result.sortBy).toBe('price:desc');
  });

  test('more than 3 order fields throws', () => {
    expect(() =>
      dialect.build({ filter: { order: ['a ASC', 'b ASC', 'c ASC', 'd ASC'] } }),
    ).toThrow();
  });
});

describe('TypesenseQueryDialect.build - pagination (limit/skip/offset -> perPage/page)', () => {
  const dialect = new TypesenseQueryDialect();

  test('limit -> perPage', () => {
    const result = dialect.build({ filter: { limit: 10 } });
    expect(result.perPage).toBe(10);
  });

  test('no limit -> perPage omitted', () => {
    const result = dialect.build({ filter: { where: { status: 'active' } } });
    expect(result.perPage).toBeUndefined();
  });

  test('skip ?? offset -> page = skip/limit + 1', () => {
    const result = dialect.build({ filter: { limit: 10, skip: 20 } });
    expect(result.perPage).toBe(10);
    expect(result.page).toBe(3);
  });

  test('offset behaves the same as skip', () => {
    const result = dialect.build({ filter: { limit: 10, offset: 20 } });
    expect(result.page).toBe(3);
  });

  test('skip % limit !== 0 throws', () => {
    expect(() => dialect.build({ filter: { limit: 10, skip: 15 } })).toThrow(
      /skip must be a multiple of limit/,
    );
  });

  test('skip without limit throws (cannot express a page)', () => {
    expect(() => dialect.build({ filter: { skip: 10 } })).toThrow();
  });
});

describe('TypesenseQueryDialect.build - fields/hiddenFields -> includeFields/excludeFields', () => {
  const dialect = new TypesenseQueryDialect();

  test('fields (array) -> includeFields csv', () => {
    const result = dialect.build({ filter: { fields: ['id', 'name', 'email'] } });
    expect(result.includeFields).toBe('id,name,email');
  });

  test('fields (object) -> includeFields csv (only true keys)', () => {
    const result = dialect.build({
      filter: { fields: { id: true, name: true, email: false } },
    });
    expect(result.includeFields).toBe('id,name');
  });

  test('hiddenFields -> excludeFields csv', () => {
    const result = dialect.build({ filter: {}, hiddenFields: ['password', 'token'] });
    expect(result.excludeFields).toBe('password,token');
  });
});

describe('TypesenseQueryDialect.build - overall shape', () => {
  const dialect = new TypesenseQueryDialect();

  test('no filter -> q: "*" only', () => {
    expect(dialect.build({})).toEqual({ q: '*' });
  });

  test('filter with where -> filterBy populated, q still "*"', () => {
    const result = dialect.build({ filter: { where: { status: 'active' } } });
    expect(result).toEqual({ q: '*', filterBy: 'status:=`active`' });
  });
});

describe('empty where members - regression from live cluster run', () => {
  const dialect = new TypesenseQueryDialect();

  test('where {} produces no filterBy', () => {
    const query = dialect.build({ filter: { where: {} } });
    expect(query.filterBy).toBeUndefined();
  });

  test('and-group drops empty members instead of emitting malformed fragments', () => {
    const query = dialect.build({
      filter: { where: { and: [{ status: 'published' }, {}] } },
    });
    expect(query.filterBy).toBe('(status:=`published`)');
  });

  test('and-group of only empty members produces no filterBy', () => {
    const query = dialect.build({ filter: { where: { and: [{}, {}] } } });
    expect(query.filterBy).toBeUndefined();
  });
});

describe('TypesenseQueryDialect.toVectorQuery', () => {
  const dialect = new TypesenseQueryDialect();

  test('client-supplied vector with k and alpha', () => {
    const result = dialect.toVectorQuery({
      field: 'embedding',
      nearVector: [1, 2, 3],
      k: 10,
      alpha: 0.5,
    });

    expect(result).toEqual({ vectorQuery: 'embedding:([1, 2, 3], k: 10, alpha: 0.5)' });
  });

  test('omitted nearVector emits an empty vector - the auto-embed path', () => {
    const result = dialect.toVectorQuery({ field: 'embedding', k: 10 });
    expect(result).toEqual({ vectorQuery: 'embedding:([], k: 10)' });
  });

  test('omitted k and alpha emit neither clause', () => {
    const result = dialect.toVectorQuery({ field: 'embedding', nearVector: [1, 2] });
    expect(result).toEqual({ vectorQuery: 'embedding:([1, 2])' });
  });

  test('non-finite number in nearVector throws', () => {
    expect(() =>
      dialect.toVectorQuery({ field: 'embedding', nearVector: [1, Number.NaN] }),
    ).toThrow(/non-finite/);
  });

  test('distanceThreshold and ef append after k/alpha', () => {
    const result = dialect.toVectorQuery({
      field: 'embedding',
      nearVector: [1, 2],
      k: 10,
      alpha: 0.5,
      distanceThreshold: 0.3,
      ef: 64,
    });

    expect(result).toEqual({
      vectorQuery: 'embedding:([1, 2], k: 10, alpha: 0.5, distance_threshold: 0.3, ef: 64)',
    });
  });

  test('distanceThreshold/ef emitted without k/alpha', () => {
    const result = dialect.toVectorQuery({
      field: 'embedding',
      distanceThreshold: 0.3,
      ef: 64,
    });

    expect(result).toEqual({ vectorQuery: 'embedding:([], distance_threshold: 0.3, ef: 64)' });
  });
});

describe('TypesenseQueryDialect.toWireParams', () => {
  const dialect = new TypesenseQueryDialect();

  test('maps every camelCase field to its Typesense wire key', () => {
    const query = dialect.build({
      filter: {
        where: { status: 'active' },
        order: ['price DESC'],
        limit: 10,
        skip: 0,
        fields: ['id', 'name'],
      },
      hiddenFields: ['password'],
    });

    const wire = dialect.toWireParams({ query });

    expect(wire['filter_by']).toBe('status:=`active`');
    expect(wire['sort_by']).toBe('price:desc');
    expect(wire['per_page']).toBe(10);
    expect(wire['include_fields']).toBe('id,name');
    expect(wire['exclude_fields']).toBe('password');
    expect(wire['page']).toBe(1);
    expect(wire['q']).toBe('*');
  });

  test('drops undefined fields instead of forwarding them as literal undefined', () => {
    const wire = dialect.toWireParams({ query: { q: '*' } });
    expect(wire).toEqual({ q: '*' });
  });

  test('passes q/page/offset through unchanged (no wire-key mapping)', () => {
    const wire = dialect.toWireParams({ query: { q: 'shoe', page: 2, offset: 20 } });
    expect(wire).toEqual({ q: 'shoe', page: 2, offset: 20 });
  });

  test('maps faceting/highlighting/grouping/search-tuning fields to their Typesense wire keys', () => {
    const wire = dialect.toWireParams({
      query: {
        q: '*',
        facetBy: 'brand',
        facetQuery: 'brand:nike',
        maxFacetValues: 10,
        highlightFields: 'title',
        highlightFullFields: 'title,description',
        highlightStartTag: '<em>',
        highlightEndTag: '</em>',
        snippetThreshold: 30,
        groupBy: 'brand',
        groupLimit: 3,
        groupMissingValues: false,
        numTypos: 2,
        useCache: true,
        cacheTtl: 60,
        exhaustiveSearch: true,
        pinnedHits: '1:1',
        hiddenHits: '2',
      },
    });

    expect(wire['facet_by']).toBe('brand');
    expect(wire['facet_query']).toBe('brand:nike');
    expect(wire['max_facet_values']).toBe(10);
    expect(wire['highlight_fields']).toBe('title');
    expect(wire['highlight_full_fields']).toBe('title,description');
    expect(wire['highlight_start_tag']).toBe('<em>');
    expect(wire['highlight_end_tag']).toBe('</em>');
    expect(wire['snippet_threshold']).toBe(30);
    expect(wire['group_by']).toBe('brand');
    expect(wire['group_limit']).toBe(3);
    expect(wire['group_missing_values']).toBe(false);
    expect(wire['num_typos']).toBe(2);
    expect(wire['use_cache']).toBe(true);
    expect(wire['cache_ttl']).toBe(60);
    expect(wire['exhaustive_search']).toBe(true);
    expect(wire['pinned_hits']).toBe('1:1');
    expect(wire['hidden_hits']).toBe('2');
  });

  test('prefix/infix pass through unchanged (single-word fields, no wire-key mapping)', () => {
    const wire = dialect.toWireParams({ query: { q: '*', prefix: true, infix: 'always' } });
    expect(wire['prefix']).toBe(true);
    expect(wire['infix']).toBe('always');
  });
});
