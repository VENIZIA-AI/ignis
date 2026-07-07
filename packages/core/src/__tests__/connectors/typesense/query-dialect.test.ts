import { describe, expect, test } from 'bun:test';
import { TypesenseQueryDialect } from '@/connectors/typesense/repositories/dialect/query-dialect';

describe('TypesenseQueryDialect.translateWhere - translation table (spec 7.2)', () => {
  const dialect = new TypesenseQueryDialect();

  test('equality { f: v } -> f:=v (string)', () => {
    expect(dialect.translateWhere({ where: { status: 'active' } })).toBe('status:=`active`');
  });

  test('equality { f: v } -> f:=v (number)', () => {
    expect(dialect.translateWhere({ where: { age: 18 } })).toBe('age:=18');
  });

  test('equality { f: v } -> f:=v (boolean)', () => {
    expect(dialect.translateWhere({ where: { isActive: true } })).toBe('isActive:=true');
  });

  test('explicit eq -> f:=v (string)', () => {
    expect(dialect.translateWhere({ where: { status: { eq: 'active' } } })).toBe(
      'status:=`active`',
    );
  });

  test('explicit eq -> f:=v (number)', () => {
    expect(dialect.translateWhere({ where: { age: { eq: 18 } } })).toBe('age:=18');
  });

  test('neq -> f:!=v', () => {
    expect(dialect.translateWhere({ where: { status: { neq: 'inactive' } } })).toBe(
      'status:!=`inactive`',
    );
  });

  test('gt -> f:>v', () => {
    expect(dialect.translateWhere({ where: { age: { gt: 18 } } })).toBe('age:>18');
  });

  test('gte -> f:>=v', () => {
    expect(dialect.translateWhere({ where: { age: { gte: 18 } } })).toBe('age:>=18');
  });

  test('lt -> f:<v', () => {
    expect(dialect.translateWhere({ where: { age: { lt: 65 } } })).toBe('age:<65');
  });

  test('lte -> f:<=v', () => {
    expect(dialect.translateWhere({ where: { age: { lte: 65 } } })).toBe('age:<=65');
  });

  test('inq -> f:=[a,b]', () => {
    expect(dialect.translateWhere({ where: { tier: { inq: ['gold', 'silver'] } } })).toBe(
      'tier:=[`gold`,`silver`]',
    );
  });

  test('bare array value -> f:=[a,b] (inq semantics, strings)', () => {
    expect(dialect.translateWhere({ where: { tags: ['a', 'b'] } })).toBe('tags:=[`a`,`b`]');
  });

  test('bare array value -> f:=[a,b] (inq semantics, numbers)', () => {
    expect(dialect.translateWhere({ where: { ids: [1, 2, 3] } })).toBe('ids:=[1,2,3]');
  });

  test('nin -> f:!=[a,b]', () => {
    expect(dialect.translateWhere({ where: { tier: { nin: ['bronze', 'free'] } } })).toBe(
      'tier:!=[`bronze`,`free`]',
    );
  });

  test('between: [a,b] -> f:[a..b]', () => {
    expect(dialect.translateWhere({ where: { price: { between: [10, 20] } } })).toBe(
      'price:[10..20]',
    );
  });

  test('between throws when value is not a [min, max] tuple', () => {
    expect(() => dialect.translateWhere({ where: { price: { between: [10] } } })).toThrow();
  });

  describe('ne/is/isn/in aliases (shared-vocabulary parity with PostgresQueryOperators.FNS)', () => {
    test('ne -> f:!=v (same as neq)', () => {
      expect(dialect.translateWhere({ where: { status: { ne: 'inactive' } } })).toBe(
        'status:!=`inactive`',
      );
    });

    test('is -> f:=v (same as eq)', () => {
      expect(dialect.translateWhere({ where: { status: { is: 'active' } } })).toBe(
        'status:=`active`',
      );
    });

    test('isn -> f:!=v (same as neq)', () => {
      expect(dialect.translateWhere({ where: { status: { isn: 'inactive' } } })).toBe(
        'status:!=`inactive`',
      );
    });

    test('in -> f:=[a,b] (same as inq)', () => {
      expect(dialect.translateWhere({ where: { tier: { in: ['gold', 'silver'] } } })).toBe(
        'tier:=[`gold`,`silver`]',
      );
    });

    test('is: null throws - Typesense has no null representation', () => {
      expect(() => dialect.translateWhere({ where: { status: { is: null } } })).toThrow(
        /null representation/,
      );
    });

    test('isn: null throws - Typesense has no null representation', () => {
      expect(() => dialect.translateWhere({ where: { status: { isn: null } } })).toThrow(
        /null representation/,
      );
    });
  });

  test('and -> (x && y)', () => {
    expect(
      dialect.translateWhere({ where: { and: [{ status: 'active' }, { age: { gte: 18 } }] } }),
    ).toBe('(status:=`active` && age:>=18)');
  });

  test('or -> (x || y)', () => {
    expect(
      dialect.translateWhere({ where: { or: [{ status: 'active' }, { status: 'pending' }] } }),
    ).toBe('(status:=`active` || status:=`pending`)');
  });

  test('multiple top-level keys AND-join', () => {
    expect(dialect.translateWhere({ where: { status: 'active', age: { gte: 18 } } })).toBe(
      'status:=`active` && age:>=18',
    );
  });

  test('nested and/or recurse with parentheses', () => {
    expect(
      dialect.translateWhere({
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
    expect(() => dialect.translateWhere({ where: { name: 'x`y' } })).toThrow();
  });

  test('a value containing typesense-operator-looking text stays inside backticks (round-trips as a literal)', () => {
    expect(dialect.translateWhere({ where: { note: 'a && b:=1' } })).toBe('note:=`a && b:=1`');
  });

  test('a bare array containing a backtick-bearing string still throws', () => {
    expect(() => dialect.translateWhere({ where: { tags: ['a', 'x`y'] } })).toThrow();
  });
});

describe('TypesenseQueryDialect - NaN/Infinity guard', () => {
  const dialect = new TypesenseQueryDialect();

  test('eq: NaN throws instead of emitting "field:=NaN"', () => {
    expect(() => dialect.translateWhere({ where: { price: NaN } })).toThrow(/non-finite/);
  });

  test('eq: Infinity throws', () => {
    expect(() => dialect.translateWhere({ where: { price: Infinity } })).toThrow(/non-finite/);
  });

  test('gt: NaN throws', () => {
    expect(() => dialect.translateWhere({ where: { price: { gt: NaN } } })).toThrow(/non-finite/);
  });

  test('between: NaN in the tuple throws', () => {
    expect(() => dialect.translateWhere({ where: { price: { between: [NaN, 20] } } })).toThrow(
      /non-finite/,
    );
  });

  test('between: -Infinity in the tuple throws', () => {
    expect(() =>
      dialect.translateWhere({ where: { price: { between: [-Infinity, 20] } } }),
    ).toThrow(/non-finite/);
  });

  test('inq: NaN in the array throws', () => {
    expect(() => dialect.translateWhere({ where: { price: { inq: [1, NaN] } } })).toThrow(
      /non-finite/,
    );
  });

  test('finite numbers still pass through unaffected', () => {
    expect(dialect.translateWhere({ where: { price: 0 } })).toBe('price:=0');
    expect(dialect.translateWhere({ where: { price: -1.5 } })).toBe('price:=-1.5');
  });
});

describe('TypesenseQueryDialect - untranslatable operators/shapes throw, naming search()', () => {
  const dialect = new TypesenseQueryDialect();

  test('like throws', () => {
    expect(() => dialect.translateWhere({ where: { name: { like: '%john%' } } })).toThrow(
      /search\(\)/,
    );
  });

  test('ilike throws', () => {
    expect(() => dialect.translateWhere({ where: { name: { ilike: '%john%' } } })).toThrow(
      /search\(\)/,
    );
  });

  test('regexp throws', () => {
    expect(() => dialect.translateWhere({ where: { name: { regexp: '^j' } } })).toThrow(
      /search\(\)/,
    );
  });

  test('dotted key (JSON path) throws', () => {
    expect(() => dialect.translateWhere({ where: { 'metadata.score': { gt: 1 } } })).toThrow(
      /search\(\)/,
    );
  });

  test('filter.include present throws', () => {
    expect(() => dialect.translate({ filter: { include: [{ relation: 'posts' }] } })).toThrow(
      /search\(\)/,
    );
  });
});

describe('TypesenseQueryDialect.translate - order/sort_by', () => {
  const dialect = new TypesenseQueryDialect();

  test("order: ['price DESC','name ASC'] -> sort_by: 'price:desc,name:asc'", () => {
    const result = dialect.translate({ filter: { order: ['price DESC', 'name ASC'] } });
    expect(result.sort_by).toBe('price:desc,name:asc');
  });

  test('order entry with missing direction defaults to asc', () => {
    const result = dialect.translate({ filter: { order: ['name'] } });
    expect(result.sort_by).toBe('name:asc');
  });

  test('order direction is case-insensitive', () => {
    const result = dialect.translate({ filter: { order: ['price desc'] } });
    expect(result.sort_by).toBe('price:desc');
  });

  test('more than 3 order fields throws', () => {
    expect(() =>
      dialect.translate({ filter: { order: ['a ASC', 'b ASC', 'c ASC', 'd ASC'] } }),
    ).toThrow();
  });
});

describe('TypesenseQueryDialect.translate - pagination (limit/skip/offset -> per_page/page)', () => {
  const dialect = new TypesenseQueryDialect();

  test('limit -> per_page', () => {
    const result = dialect.translate({ filter: { limit: 10 } });
    expect(result.per_page).toBe(10);
  });

  test('no limit -> per_page omitted', () => {
    const result = dialect.translate({ filter: { where: { status: 'active' } } });
    expect(result.per_page).toBeUndefined();
  });

  test('skip ?? offset -> page = skip/limit + 1', () => {
    const result = dialect.translate({ filter: { limit: 10, skip: 20 } });
    expect(result.per_page).toBe(10);
    expect(result.page).toBe(3);
  });

  test('offset behaves the same as skip', () => {
    const result = dialect.translate({ filter: { limit: 10, offset: 20 } });
    expect(result.page).toBe(3);
  });

  test('skip % limit !== 0 throws', () => {
    expect(() => dialect.translate({ filter: { limit: 10, skip: 15 } })).toThrow(
      /skip must be a multiple of limit/,
    );
  });

  test('skip without limit throws (cannot express a page)', () => {
    expect(() => dialect.translate({ filter: { skip: 10 } })).toThrow();
  });
});

describe('TypesenseQueryDialect.translate - fields/hiddenFields -> include_fields/exclude_fields', () => {
  const dialect = new TypesenseQueryDialect();

  test('fields (array) -> include_fields csv', () => {
    const result = dialect.translate({ filter: { fields: ['id', 'name', 'email'] } });
    expect(result.include_fields).toBe('id,name,email');
  });

  test('fields (object) -> include_fields csv (only true keys)', () => {
    const result = dialect.translate({
      filter: { fields: { id: true, name: true, email: false } },
    });
    expect(result.include_fields).toBe('id,name');
  });

  test('hiddenFields -> exclude_fields csv', () => {
    const result = dialect.translate({ filter: {}, hiddenFields: ['password', 'token'] });
    expect(result.exclude_fields).toBe('password,token');
  });
});

describe('TypesenseQueryDialect.translate - overall shape', () => {
  const dialect = new TypesenseQueryDialect();

  test('no filter -> q: "*" only', () => {
    expect(dialect.translate({})).toEqual({ q: '*' });
  });

  test('filter with where -> filter_by populated, q still "*"', () => {
    const result = dialect.translate({ filter: { where: { status: 'active' } } });
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Typesense wire field name
    expect(result).toEqual({ q: '*', filter_by: 'status:=`active`' });
  });
});

describe('empty where members - regression from live cluster run', () => {
  const dialect = new TypesenseQueryDialect();

  test('where {} produces no filter_by', () => {
    const query = dialect.translate({ filter: { where: {} } });
    expect(query.filter_by).toBeUndefined();
  });

  test('and-group drops empty members instead of emitting malformed fragments', () => {
    const query = dialect.translate({
      filter: { where: { and: [{ status: 'published' }, {}] } },
    });
    expect(query.filter_by).toBe('(status:=`published`)');
  });

  test('and-group of only empty members produces no filter_by', () => {
    const query = dialect.translate({ filter: { where: { and: [{}, {}] } } });
    expect(query.filter_by).toBeUndefined();
  });
});
