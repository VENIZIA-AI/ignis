import { describe, expect, test } from 'bun:test';
import { SearchFilterOutcomes, SearchModes } from '@/search/core/repositories/common';
import type { ITypesenseSearchQuery } from '@/search/typesense/repositories/common';
import { TypesenseQueryDialect } from '@/search/typesense/repositories/dialect/query-dialect';

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

  // A dotted key is NOT untranslatable - under enable_nested_fields it is an ordinary Typesense
  // field name. What decides it is membership in the collection's field list, asserted in the
  // 'field list governs' block below, not the presence of a dot.

  test('filter.include present throws', () => {
    expect(() => dialect.build({ filter: { include: [{ relation: 'posts' }] } })).toThrow(
      /search\(\)/,
    );
  });
});

/**
 * ONE judgment - "does the collection declare this field?" - applied to both paths a caller can
 * name a field from. `where` got it on the parity branch; `order` did not, so an unknown sort field
 * reached the engine verbatim and came back as an infrastructure error instead of a 400.
 *
 * The dotted cases are the same judgment, not a second rule. With `enable_nested_fields` on, a
 * dotted name is a REAL Typesense field name, so `merchantName.en` must compile and `metadata.foo`
 * must be rejected for the only reason that is true of it: the collection does not declare it.
 */
describe('TypesenseQueryDialect - the collection field list governs order and dotted names alike', () => {
  const dialect = new TypesenseQueryDialect();

  const capabilities = {
    fields: new Set(['price', 'name', 'merchantName.en']) as ReadonlySet<string>,
  };

  const CATALOGUED_UNKNOWN_FIELD = 'core.search_engine.unknown_field';

  type TThrown = Error & { normalized?: { code?: string } };

  const thrownBy = (task: () => unknown): TThrown => {
    try {
      task();
    } catch (error) {
      return error as TThrown;
    }

    throw new Error('expected the call to throw, but it returned normally');
  };

  test('order naming a field the collection does not declare is a catalogued 400', () => {
    const error = thrownBy(() => dialect.build({ filter: { order: ['nope DESC'] }, capabilities }));

    expect(error.normalized?.code).toBe(CATALOGUED_UNKNOWN_FIELD);
    // Names BOTH, exactly as the where path does - the caller has to know which engine decided it.
    expect(error.message).toContain("field: 'nope'");
    expect(error.message).toContain("engine: 'Typesense'");
  });

  test('order splits the direction off before checking the name', () => {
    // The entry is "field DIRECTION"; checking the raw entry would reject every valid sort.
    const error = thrownBy(() => dialect.build({ filter: { order: ['nope'] }, capabilities }));

    expect(error.message).toContain("field: 'nope'");
    expect(error.message).not.toContain('nope DESC');
  });

  test('order on a declared DOTTED field compiles', () => {
    const result = dialect.build({ filter: { order: ['merchantName.en ASC'] }, capabilities });

    expect(result.sortBy).toBe('merchantName.en:asc');
  });

  test('order on a declared plain field still compiles', () => {
    expect(dialect.build({ filter: { order: ['price DESC'] }, capabilities }).sortBy).toBe(
      'price:desc',
    );
  });

  test('order is UNVALIDATED when the collection declares no fields', () => {
    // Absent `fields` means "unvalidated", not "no fields" - an entity carrying no collection
    // definition must compile exactly as it did before this check existed.
    expect(dialect.build({ filter: { order: ['anythingAtAll DESC'] } }).sortBy).toBe(
      'anythingAtAll:desc',
    );
  });

  test('where on a declared dotted field compiles - it is a field name, not a JSON path', () => {
    const compiled = dialect.compileWhere({
      where: { 'merchantName.en': 'ACME' },
      capabilities,
    });

    expect(compiled).toEqual({
      outcome: SearchFilterOutcomes.FILTER,
      filterBy: 'merchantName.en:=`ACME`',
    });
  });

  test('where on an undeclared dotted field names the field, NOT JSON paths', () => {
    const error = thrownBy(() =>
      dialect.compileWhere({ where: { 'metadata.foo': { gt: 1 } }, capabilities }),
    );

    expect(error.normalized?.code).toBe(CATALOGUED_UNKNOWN_FIELD);
    expect(error.message).toContain("field: 'metadata.foo'");
    // The old message claimed Typesense cannot express JSON-path fields, which is untrue of it.
    expect(error.message).not.toContain('JSON-path');
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

describe('TypesenseQueryDialect.build - pagination (limit/skip/offset -> perPage or offset/limit)', () => {
  const dialect = new TypesenseQueryDialect();

  test('limit alone -> perPage, the page/per_page pair', () => {
    const result = dialect.build({ filter: { limit: 10 } });
    expect(result.perPage).toBe(10);
    expect(result.offset).toBeUndefined();
  });

  test('no limit -> perPage omitted', () => {
    const result = dialect.build({ filter: { where: { status: 'active' } } });
    expect(result.perPage).toBeUndefined();
  });

  /**
   * A skip switches to Typesense's NATIVE offset pair. Exactly one pair is ever emitted: the two
   * are documented as alternatives with no stated precedence, so sending both would be a bet.
   */
  test('skip -> offset/limit, and never both pagination pairs at once', () => {
    const result = dialect.build({ filter: { limit: 10, skip: 20 } });

    expect(result.offset).toBe(20);
    expect(result.limit).toBe(10);
    expect(result.perPage).toBeUndefined();
    expect(result.page).toBeUndefined();
  });

  test('offset behaves the same as skip', () => {
    const result = dialect.build({ filter: { limit: 10, offset: 20 } });
    expect(result.offset).toBe(20);
    expect(result.limit).toBe(10);
  });

  /**
   * The multiple-of-limit rule is gone. It was never Typesense's - it came from expressing a skip
   * as a page NUMBER - and the relational reference never had it either
   * (relational/repositories/dialect/filter.ts:283-287 passes skip straight to Drizzle). Rejecting
   * `skip: 15, limit: 10` made the search branch stricter than the branch it claims to mirror.
   */
  test('a skip off the page boundary is expressible', () => {
    const result = dialect.build({ filter: { limit: 10, skip: 15 } });

    expect(result.offset).toBe(15);
    expect(result.limit).toBe(10);
  });

  test('a skip without a limit is expressible - an offset needs no page size', () => {
    const result = dialect.build({ filter: { skip: 10 } });

    expect(result.offset).toBe(10);
    expect(result.limit).toBeUndefined();
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

  test('no filter -> query: "*" only', () => {
    expect(dialect.build({})).toEqual({ query: '*' });
  });

  test('filter with where -> filterBy populated, query still "*"', () => {
    const result = dialect.build({ filter: { where: { status: 'active' } } });
    expect(result).toEqual({ query: '*', filterBy: 'status:=`active`' });
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

  test('an empty logical group beside a field never leaks a dangling && into filterBy', () => {
    const leading = dialect.toWhere({ where: { and: [], status: 'active' } });
    const trailing = dialect.toWhere({ where: { status: 'active', or: [{}, {}] } });

    expect(leading).toBe('status:=`active`');
    expect(trailing).toBe('status:=`active`');
  });

  test('build drops the empty top-level group rather than emitting a malformed filter_by', () => {
    const query = dialect.build({ filter: { where: { and: [], status: 'active' } } });
    expect(query.filterBy).toBe('status:=`active`');
  });

  test('only-empty top-level groups produce no filterBy', () => {
    const query = dialect.build({ filter: { where: { and: [], or: [] } } });
    expect(query.filterBy).toBeUndefined();
  });
});

describe('TypesenseQueryDialect.applySearchInput - vector clause', () => {
  const dialect = new TypesenseQueryDialect();

  /** Runs the dialect over a fresh query and hands back the Typesense-typed result. */
  const applySemantic = (
    input: Parameters<TypesenseQueryDialect['applySearchInput']>[0]['input'],
  ): ITypesenseSearchQuery => {
    const query = dialect.build({});
    dialect.applySearchInput({ query, input });
    return query;
  };

  test('client-supplied vector with k and alpha (hybrid)', () => {
    const query = applySemantic({
      mode: SearchModes.HYBRID,
      query: 'shoes',
      queryBy: ['title'],
      vectorField: 'embedding',
      nearVector: [1, 2, 3],
      k: 10,
      alpha: 0.5,
    });

    expect(query.vectorQuery).toBe('embedding:([1, 2, 3], k: 10, alpha: 0.5)');
  });

  test('omitted nearVector emits an empty vector - the auto-embed path', () => {
    const query = applySemantic({
      mode: SearchModes.SEMANTIC,
      vectorField: 'embedding',
      queryText: 'shoes',
      k: 10,
    });

    expect(query.vectorQuery).toBe('embedding:([], k: 10)');
    expect(query.query).toBe('shoes');
    expect(query.queryBy).toBe('embedding');
  });

  test('omitted k and alpha emit neither clause', () => {
    const query = applySemantic({
      mode: SearchModes.SEMANTIC,
      vectorField: 'embedding',
      nearVector: [1, 2],
    });

    expect(query.vectorQuery).toBe('embedding:([1, 2])');
  });

  test('non-finite number in nearVector throws', () => {
    expect(() =>
      applySemantic({
        mode: SearchModes.SEMANTIC,
        vectorField: 'embedding',
        nearVector: [1, Number.NaN],
      }),
    ).toThrow(/non-finite/);
  });

  test('distanceThreshold and ef append after k/alpha', () => {
    const query = applySemantic({
      mode: SearchModes.HYBRID,
      query: 'shoes',
      queryBy: ['title'],
      vectorField: 'embedding',
      nearVector: [1, 2],
      k: 10,
      alpha: 0.5,
      distanceThreshold: 0.3,
      ef: 64,
    });

    expect(query.vectorQuery).toBe(
      'embedding:([1, 2], k: 10, alpha: 0.5, distance_threshold: 0.3, ef: 64)',
    );
  });

  test('distanceThreshold/ef emitted without k/alpha', () => {
    const query = applySemantic({
      mode: SearchModes.SEMANTIC,
      vectorField: 'embedding',
      queryText: 'shoes',
      distanceThreshold: 0.3,
      ef: 64,
    });

    expect(query.vectorQuery).toBe('embedding:([], distance_threshold: 0.3, ef: 64)');
  });

  test('semantic mode disables prefix - remote embedders reject prefix search', () => {
    const query = applySemantic({
      mode: SearchModes.SEMANTIC,
      vectorField: 'embedding',
      nearVector: [0.1],
    });

    expect(query.prefix).toBe(false);
  });

  test('semantic mode without nearVector or queryText throws', () => {
    expect(() => applySemantic({ mode: SearchModes.SEMANTIC, vectorField: 'embedding' })).toThrow(
      /nearVector.*queryText/,
    );
  });

  test('keyword mode carries engineParams (Typesense wire names) onto the query for the verbatim merge', () => {
    const query = dialect.build({});
    dialect.applySearchInput({
      query,
      input: {
        mode: SearchModes.KEYWORD,
        query: 'shoes',
        queryBy: ['title', 'brand'],
        engineParams: { ['num_typos']: 2, preset: 'p1', ['pinned_hits']: '1:1' },
      },
    });

    expect(query.query).toBe('shoes');
    expect((query as ITypesenseSearchQuery).queryBy).toBe('title,brand');

    // engineParams reach the wire verbatim, under their own Typesense names, via toWireParams.
    const wire = dialect.toWireParams({ query });
    expect(wire['num_typos']).toBe(2);
    expect(wire['preset']).toBe('p1');
    expect(wire['pinned_hits']).toBe('1:1');
  });

  test('hybrid mode without nearVector appends the vector field to queryBy for auto-embed', () => {
    const query = applySemantic({
      mode: SearchModes.HYBRID,
      query: 'shoes',
      queryBy: ['title'],
      vectorField: 'embedding',
    });

    expect(query.queryBy).toBe('title,embedding');
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
    expect(wire['include_fields']).toBe('id,name');
    expect(wire['exclude_fields']).toBe('password');
    expect(wire['q']).toBe('*');

    // An explicit `skip` selects the offset pair whatever its value - which pair is used depends on
    // whether a skip was asked for, not on how large it is, so there is no zero special case.
    expect(wire['offset']).toBe(0);
    expect(wire['limit']).toBe(10);
    expect(wire['per_page']).toBeUndefined();
    expect(wire['page']).toBeUndefined();
  });

  test('drops undefined fields instead of forwarding them as literal undefined', () => {
    const wire = dialect.toWireParams({ query: { query: '*' } });
    expect(wire).toEqual({ q: '*' });
  });

  test('maps query -> q; passes page/offset through unchanged', () => {
    const wire = dialect.toWireParams({ query: { query: 'shoe', page: 2, offset: 20 } });
    expect(wire).toEqual({ q: 'shoe', page: 2, offset: 20 });
  });

  test('maps faceting/highlighting/grouping fields to their Typesense wire keys', () => {
    const tuned: ITypesenseSearchQuery = {
      query: '*',
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
      queryByWeights: '2,1',
    };

    const wire = dialect.toWireParams({ query: tuned });

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
    expect(wire['query_by_weights']).toBe('2,1');
  });

  test('prefix passes through unchanged (single-word field, no wire-key mapping)', () => {
    const tuned: ITypesenseSearchQuery = { query: '*', prefix: false };
    const wire = dialect.toWireParams({ query: tuned });
    expect(wire['prefix']).toBe(false);
  });

  test('engineParams merge last, verbatim, under the engine’s own wire names', () => {
    const wire = dialect.toWireParams({
      query: { query: '*', engineParams: { ['num_typos']: 4, ['some_future_flag']: true } },
    });

    expect(wire['num_typos']).toBe(4);
    expect(wire['some_future_flag']).toBe(true);
  });
});
