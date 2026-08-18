import { describe, expect, test } from 'bun:test';
import type { SQL } from 'drizzle-orm';
import { PgDialect, boolean, integer, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { QueryOperators, type TWhere } from '@venizia/ignis-filter';
import { MeilisearchQueryDialect } from '@/search/meilisearch/repositories/dialect/query-dialect';
import { PostgresFilterBuilder } from '@/relational/postgres/repositories/dialect/filter';
import { TypesenseQueryDialect } from '@/search/typesense/repositories/dialect/query-dialect';
import type {
  ISearchCompileCapabilities,
  ISearchQueryDialect,
} from '@/search/core/repositories/common';
import { SearchFilterOutcomes } from '@/search/core/repositories/common';

/**
 * `dialect-parity.test.ts` pins the two SEARCH dialects against each other. This file pins the
 * other axis - search against relational - because architecture/search-typesense.md declares the
 * search hierarchy "a deliberate reflection of the relational one", and that reflection was built
 * at the repository tier and never at the dialect tier.
 *
 * WHAT PARITY MEANS HERE IS DECIDED BY THE CLASSIFICATION TABLE, NOT BY RELATIONAL.
 * Several operators are deliberately unsupported on one engine or both - `not` on both,
 * `exists`/`notExists`/`is: null` on Typesense, which has no null at all. For those, matching
 * relational is not the goal and never will be. So each operator case reads the engine's own
 * published capability and asserts accordingly:
 *
 *   canExpress -> true  (a): compiles, behaving as the relational reference does
 *   canExpress -> false (b): a CATALOGUED 400 naming both the operator and the engine
 *
 * Never (c) - silently compiling to something that does not mean what was asked. The absorbing
 * cases are exactly that failure, so they are asserted unconditionally: no engine gets to opt out
 * of "an empty `or` matches nothing".
 *
 * Whether each cell is TRUE is `operator-capability-matrix.test.ts`'s job. This file only asks
 * that behaviour follows whatever the table says.
 */

/** Mirrors the shape a search collection would carry, so an unknown key is unknown to both tiers. */
const table = pgTable('parity_fixture', {
  id: integer('id').primaryKey(),
  name: varchar('name', { length: 255 }),
  status: varchar('status', { length: 50 }),
  price: integer('price'),
  isActive: boolean('is_active'),
  orgId: text('org_id'),
});

/** The same collection stated as a field list - what a search dialect needs to reject unknown fields. */
const COLLECTION_FIELDS: ReadonlySet<string> = new Set([
  'id',
  'name',
  'status',
  'price',
  'isActive',
  'orgId',
]);

const CATALOGUED_UNKNOWN_FIELD = 'core.search_engine.unknown_field';
const CATALOGUED_UNSUPPORTED_OPERATOR = 'core.search_engine.unsupported_operator';

const relational = new PostgresFilterBuilder();
const pg = new PgDialect();
const typesense = new TypesenseQueryDialect();
const meilisearch = new MeilisearchQueryDialect();

type TThrown = Error & { statusCode?: number; normalized?: { code?: string } };

/**
 * What a dialect did with a `where`, flattened to one comparable shape. `dropped` is "no
 * constraint" (vacuously true); `matchNone` is absorbing false - a distinction relational has
 * always had (`undefined` vs `sql\`false\``) and the search branch previously could not express.
 */
type TOutcome =
  | { kind: 'compiled'; rendered: string }
  | { kind: 'dropped' }
  | { kind: 'matchNone' }
  | { kind: 'threw'; error: TThrown };

const relationalOutcome = (where: TWhere): TOutcome => {
  try {
    const condition = relational.toWhere({ tableName: 'parity_fixture', schema: table, where }) as
      SQL | undefined;

    if (!condition) {
      return { kind: 'dropped' };
    }

    return { kind: 'compiled', rendered: pg.sqlToQuery(condition).sql };
  } catch (error) {
    return { kind: 'threw', error: error as TThrown };
  }
};

/**
 * Compiled through `compileWhere` - the only entry that can express the absorbing outcomes.
 *
 * `capabilities` is taken as a whole object rather than a bare `fields`, because a default
 * parameter fires on an explicitly-passed `undefined`: `searchOutcome(d, w, undefined)` would
 * silently receive the full field set, and the "no collection declared" case would assert nothing.
 */
const searchOutcome = (
  dialect: ISearchQueryDialect,
  where: TWhere,
  capabilities: ISearchCompileCapabilities = { fields: COLLECTION_FIELDS },
): TOutcome => {
  try {
    const compiled = dialect.compileWhere({ where, capabilities });

    switch (compiled.outcome) {
      case SearchFilterOutcomes.FILTER: {
        return { kind: 'compiled', rendered: compiled.filterBy };
      }
      case SearchFilterOutcomes.MATCH_NONE: {
        return { kind: 'matchNone' };
      }
      default: {
        return { kind: 'dropped' };
      }
    }
  } catch (error) {
    return { kind: 'threw', error: error as TThrown };
  }
};

interface ISearchDialectUnderTest {
  name: string;
  engine: string;
  dialect: ISearchQueryDialect;
}

const SEARCH_DIALECTS: ISearchDialectUnderTest[] = [
  { name: 'typesense', engine: 'Typesense', dialect: typesense },
  { name: 'meilisearch', engine: 'Meilisearch', dialect: meilisearch },
];

interface IDialectUnderTest {
  name: string;
  compile: (where: TWhere) => TOutcome;
}

/** All three, for the semantic cases where every dialect must agree regardless of capability. */
const DIALECTS: IDialectUnderTest[] = [
  { name: 'relational', compile: where => relationalOutcome(where) },
  ...SEARCH_DIALECTS.map(({ name, dialect }) => ({
    name,
    compile: (where: TWhere) => searchOutcome(dialect, where),
  })),
];

/**
 * The clause is ABSORBING: it can never match. Relational spells that `sql\`false\``, the search
 * branch spells it `matchNone`. Each is checked in its own vocabulary; what must not happen on any
 * of them is compiling to something that imposes no constraint.
 */
const expectMatchesNothing = (outcome: TOutcome, dialect: string): void => {
  if (dialect === 'relational') {
    expect(
      outcome.kind,
      `[${dialect}] expected a compiled false, got: ${JSON.stringify(outcome)}`,
    ).toBe('compiled');

    if (outcome.kind !== 'compiled') {
      return;
    }

    expect(outcome.rendered, `[${dialect}] the absorbing clause must survive as false`).toMatch(
      /\bfalse\b/i,
    );
    return;
  }

  expect(
    outcome.kind,
    `[${dialect}] an absorbing clause must compile to matchNone; anything else either widens the query or emits a filter the engine rejects. Got: ${JSON.stringify(outcome)}`,
  ).toBe('matchNone');
};

/** The clause is vacuously TRUE, so imposing no constraint is correct. */
const expectMatchesEverything = (outcome: TOutcome, dialect: string): void => {
  const isVacuous =
    outcome.kind === 'dropped' ||
    (outcome.kind === 'compiled' && /^\s*true\s*$/i.test(outcome.rendered));

  expect(
    isVacuous,
    `[${dialect}] a vacuously-true clause must impose no constraint, got: ${JSON.stringify(outcome)}`,
  ).toBe(true);
};

/** A catalogued client error: 4xx, a code a client can branch on, and the offender named. */
const expectCatalogued = (opts: {
  outcome: TOutcome;
  dialect: string;
  code: string;
  contains: string[];
}): void => {
  const { outcome, dialect, code, contains } = opts;

  expect(
    outcome.kind,
    `[${dialect}] expected a catalogued rejection, got: ${JSON.stringify(outcome)}`,
  ).toBe('threw');

  if (outcome.kind !== 'threw') {
    return;
  }

  const statusCode = outcome.error.statusCode ?? 500;
  expect(
    statusCode >= 400 && statusCode < 500,
    `[${dialect}] a client mistake must surface as 4xx, got: ${statusCode}`,
  ).toBe(true);

  expect(
    outcome.error.normalized?.code,
    `[${dialect}] a client branches on the code, not on prose`,
  ).toBe(code);

  for (const fragment of contains) {
    expect(outcome.error.message, `[${dialect}] the rejection must name ${fragment}`).toContain(
      fragment,
    );
  }
};

describe('search <-> relational parity - absorbing semantics (no engine may opt out)', () => {
  /** The control: proves the harness reads all three dialects the same way before the cases below. */
  for (const dialect of DIALECTS) {
    test(`${dialect.name}: empty \`and\` is vacuously true and imposes no constraint`, () => {
      expectMatchesEverything(dialect.compile({ and: [] }), dialect.name);
    });
  }

  for (const dialect of DIALECTS) {
    test(`${dialect.name}: empty \`or\` matches NOTHING, never everything`, () => {
      expectMatchesNothing(dialect.compile({ or: [] }), dialect.name);
    });
  }

  /**
   * The concrete failure relational/repositories/dialect/filter.ts:637-641 names:
   * `or: permittedOrgIds.map(...)` on an empty permission list. Dropping that disjunction does not
   * narrow the surrounding `and` - it removes the permission scope entirely and returns every
   * published document to an unpermitted caller.
   */
  for (const dialect of DIALECTS) {
    test(`${dialect.name}: an empty permission scope denies rather than grants`, () => {
      const permittedOrgIds: string[] = [];

      expectMatchesNothing(
        dialect.compile({
          and: [{ status: 'published' }, { or: permittedOrgIds.map(orgId => ({ orgId })) }],
        }),
        dialect.name,
      );
    });
  }

  for (const dialect of DIALECTS) {
    test(`${dialect.name}: a bare empty array matches NOTHING`, () => {
      expectMatchesNothing(dialect.compile({ status: [] }), dialect.name);
    });
  }

  for (const dialect of DIALECTS) {
    test(`${dialect.name}: \`inq: []\` matches NOTHING`, () => {
      expectMatchesNothing(dialect.compile({ status: { inq: [] } }), dialect.name);
    });
  }

  for (const dialect of DIALECTS) {
    test(`${dialect.name}: \`nin: []\` excludes nothing, so it matches EVERYTHING`, () => {
      expectMatchesEverything(dialect.compile({ status: { nin: [] } }), dialect.name);
    });
  }
});

describe('search <-> relational parity - unknown fields', () => {
  /**
   * Relational resolves every key against the table's columns and throws `Column NOT FOUND`
   * (filter.ts:377-382). The search tier read the collection definition only at provisioning time,
   * so a typo'd field compiled verbatim and the ENGINE's rejection surfaced as an infrastructure
   * failure rather than a 400 naming the field.
   */
  test('relational: an unknown field throws, naming the field', () => {
    const outcome = relationalOutcome({ fieldThatDoesNotExist: 'x' } as TWhere);

    expect(outcome.kind).toBe('threw');
    if (outcome.kind !== 'threw') {
      return;
    }

    expect(outcome.error.message).toContain('fieldThatDoesNotExist');
  });

  for (const { name, dialect } of SEARCH_DIALECTS) {
    test(`${name}: an unknown field is rejected, naming the field`, () => {
      expectCatalogued({
        outcome: searchOutcome(dialect, { fieldThatDoesNotExist: 'x' } as TWhere),
        dialect: name,
        code: CATALOGUED_UNKNOWN_FIELD,
        contains: ["field: 'fieldThatDoesNotExist'"],
      });
    });

    test(`${name}: an unknown field nested in a logical group is rejected`, () => {
      expectCatalogued({
        outcome: searchOutcome(dialect, { and: [{ status: 'published' }, { nope: 1 }] } as TWhere),
        dialect: name,
        code: CATALOGUED_UNKNOWN_FIELD,
        contains: ["field: 'nope'"],
      });
    });

    /** No declared field set means UNVALIDATED, not "no fields" - an entity without one still compiles. */
    test(`${name}: without a declared field set, no field check runs`, () => {
      expect(searchOutcome(dialect, { anythingAtAll: 'x' } as TWhere, {}).kind).toBe('compiled');
    });
  }
});

/**
 * Operator cases, each asserted against the ENGINE'S OWN published capability rather than against
 * relational - because for several of these, differing from relational is the correct answer.
 */
const OPERATOR_CASES: Array<{ label: string; operator: string; where: TWhere }> = [
  {
    label: '`not: <bareValue>`',
    operator: QueryOperators.NOT,
    where: { status: { not: 'active' } },
  },
  {
    label: '`not: <operatorObject>`',
    operator: QueryOperators.NOT,
    where: { price: { not: { gte: 100 } } },
  },
  { label: '`exists`', operator: QueryOperators.EXISTS, where: { status: { exists: true } } },
  {
    label: '`notExists`',
    operator: QueryOperators.NOT_EXISTS,
    where: { status: { notExists: true } },
  },
  { label: '`like`', operator: QueryOperators.LIKE, where: { name: { like: '%x%' } } },
  {
    label: '`notBetween`',
    operator: QueryOperators.NOT_BETWEEN,
    where: { price: { notBetween: [1, 10] } },
  },
];

describe('search <-> relational parity - operators follow the classification table', () => {
  for (const { label, operator, where } of OPERATOR_CASES) {
    /** Relational is the reference: it expresses every member of the vocabulary. */
    test(`relational: ${label} compiles`, () => {
      const outcome = relationalOutcome(where);

      expect(
        outcome.kind,
        `relational must express '${operator}', got: ${JSON.stringify(outcome)}`,
      ).toBe('compiled');
    });

    for (const { name, engine, dialect } of SEARCH_DIALECTS) {
      const expressible = dialect.canExpress({ operator });

      test(`${name}: ${label} ${expressible ? 'compiles like relational' : 'is a catalogued 400'}`, () => {
        const outcome = searchOutcome(dialect, where);

        if (expressible) {
          expect(
            outcome.kind,
            `[${name}] '${operator}' is published as expressible but did not compile: ${JSON.stringify(outcome)}`,
          ).toBe('compiled');
          return;
        }

        expectCatalogued({
          outcome,
          dialect: name,
          code: CATALOGUED_UNSUPPORTED_OPERATOR,
          contains: [`operator: '${operator}'`, `engine: '${engine}'`],
        });
      });
    }
  }

  /**
   * `is: null` is a VALUE-level limit `canExpress` cannot carry: Typesense publishes `is` as
   * expressible, and it is - for a value. Null is the one operand it has no representation for.
   */
  test('relational: `is: null` compiles to IS NULL', () => {
    const outcome = relationalOutcome({ status: { is: null } });

    expect(outcome.kind).toBe('compiled');
    if (outcome.kind !== 'compiled') {
      return;
    }

    expect(outcome.rendered).toContain('is null');
  });

  test('meilisearch: `is: null` compiles, as relational does', () => {
    expect(searchOutcome(meilisearch, { status: { is: null } })).toEqual({
      kind: 'compiled',
      rendered: 'status IS NULL',
    });
  });

  test('typesense: `is: null` is a catalogued 400 - the engine has no null at all', () => {
    expectCatalogued({
      outcome: searchOutcome(typesense, { status: { is: null } }),
      dialect: 'typesense',
      code: CATALOGUED_UNSUPPORTED_OPERATOR,
      contains: ["engine: 'Typesense'", 'no null representation'],
    });
  });
});

describe('search <-> relational parity - the deprecated toWhere cannot answer wrongly', () => {
  /**
   * `toWhere` returns a string, so it cannot express matchNone. It used to return `''`, which
   * reads as "no constraint" - the security case above. It must refuse instead of answering.
   */
  for (const { name, dialect } of SEARCH_DIALECTS) {
    test(`${name}: toWhere throws rather than returning '' for an absorbing where`, () => {
      let caught: TThrown | undefined;

      try {
        dialect.toWhere({ where: { or: [] } });
      } catch (error) {
        caught = error as TThrown;
      }

      expect(
        caught,
        `[${name}] toWhere returned a string for an absorbing where - that string matches EVERYTHING`,
      ).toBeDefined();
      expect(caught?.normalized?.code).toBe(CATALOGUED_UNSUPPORTED_OPERATOR);
    });

    test(`${name}: toWhere still returns a plain string for an ordinary where`, () => {
      expect(dialect.toWhere({ where: { status: 'active' } })).toBeTypeOf('string');
    });
  }
});
